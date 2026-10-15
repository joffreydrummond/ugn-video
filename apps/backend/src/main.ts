import 'reflect-metadata';
import { Module, Controller, Get, Post, Body, Param, Req, Res, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Queue } from 'bullmq';
import { SignJWT, jwtVerify } from 'jose';
import cookieParser from 'cookie-parser';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { retryVideo, deleteVideo } from './video-management';
import { stopProcessing } from './processing-control';
import { withVideoLock } from './video-lock';
import { startRecovery, startStopMonitor, originalSize, jobOptions, missing } from './recovery';

const db = new PrismaClient();
const bucket = process.env.S3_BUCKET!;
const config = {
  region: process.env.S3_REGION, forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED' as const,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
};
const s3 = new S3Client({ ...config, endpoint: process.env.S3_ENDPOINT });
const browserS3 = new S3Client({ ...config, endpoint: process.env.S3_BROWSER_ENDPOINT });
const queue = new Queue('videos', { connection: { host: process.env.REDIS_HOST } });
const management = { db, queue, s3, bucket };
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
if (secret.length < 32) throw new Error('JWT_SECRET must have at least 32 characters');
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' };
async function admin(req: Request) {
  try {
    const { payload } = await jwtVerify(req.cookies?.session, secret, { algorithms: ['HS256'] });
    if (payload.role !== 'admin') throw new Error('Admin access required');
  } catch { throw new UnauthorizedException('Please sign in.'); }
}
function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const input = z.object({
  title: z.string().min(1).max(200), description: z.string().max(5000).default(''),
  filename: z.string().min(1).max(255), size: z.number().int().positive().max(20 * 1024 ** 3),
});
@Controller()
class Api {
  @Get('health')
  async health() { await db.$queryRaw`SELECT 1`; await queue.getJobCounts(); return { ok: true }; }
  @Get('auth/me')
  async me(@Req() req: Request) { await admin(req); return { authenticated: true }; }

  @Post('auth/login')
  async login(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    if (!equal(String(body.email), process.env.ADMIN_EMAIL!) || !equal(String(body.password), process.env.ADMIN_PASSWORD!)) {
      throw new UnauthorizedException('Incorrect email or password.');
    }
    const token = await new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('12h').sign(secret);
    res.cookie('session', token, { ...cookieOptions, maxAge: 43_200_000 });
    return { ok: true };
  }
  @Post('auth/logout')
  logout(@Res({ passthrough: true }) res: Response) { res.clearCookie('session', cookieOptions); return { ok: true }; }

  @Get('videos')
  list() { return db.video.findMany({ where: { status: 'READY' }, orderBy: { createdAt: 'desc' }, select: {
    id: true, title: true, description: true, duration: true, status: true,
  } }); }
  @Get('admin/videos')
  async all(@Req() req: Request) { await admin(req); return db.video.findMany({ orderBy: { createdAt: 'desc' } }); }

  @Post('admin/videos/:id/stop')
  async stop(@Req() req: Request, @Param('id') id: string) { await admin(req); return withVideoLock(db, id, tx => stopProcessing({ ...management, db: tx }, id)); }

  @Post('admin/videos/:id/retry')
  async retry(@Req() req: Request, @Param('id') id: string) { await admin(req); return withVideoLock(db, id, tx => retryVideo({ ...management, db: tx }, id)); }
  @Post('admin/videos/:id/delete')
  async remove(@Req() req: Request, @Param('id') id: string) { await admin(req); return withVideoLock(db, id, tx => deleteVideo({ ...management, db: tx }, id)); }

  @Get('videos/:id/playback')
  async playback(@Param('id') id: string) {
    const video = await db.video.findUnique({ where: { id } });
    if (!video) return { status: 'NOT_FOUND' };
    return {
      id: video.id, title: video.title, description: video.description, status: video.status, duration: video.duration,
      manifestUrl: video.status === 'READY' ? `${process.env.S3_PUBLIC_URL}/videos/${id}/master.m3u8` : null,
      poster: video.status === 'READY' ? `${process.env.S3_PUBLIC_URL}/videos/${id}/poster.jpg` : null,
      renditions: video.status === 'READY' ? [1080, 720, 480] : [],
    };
  }
  @Post('uploads')
  async create(@Req() req: Request, @Body() body: any) {
    await admin(req);
    const parsed = input.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const video = await db.video.create({ data: parsed.data });
    const upload = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: `originals/${video.id}`, ContentType: 'application/octet-stream' }));
    return db.video.update({ where: { id: video.id }, data: { uploadId: upload.UploadId } });
  }
  @Get('uploads/:id/parts')
  async parts(@Req() req: Request, @Param('id') id: string) {
    await admin(req);
    return withVideoLock(db, id, async db => {
    const video = await db.video.findUniqueOrThrow({ where: { id } });
    if (video.status !== 'UPLOADING' || !video.uploadId) throw new BadRequestException('Upload is no longer active. Refresh the session list.');
    await db.video.update({ where: { id }, data: { updatedAt: new Date() } });
    let marker: string | undefined;
    const parts: any[] = [];
    do {
      let result;
      try { result = await s3.send(new ListPartsCommand({ Bucket: bucket, Key: `originals/${id}`, UploadId: video.uploadId!, PartNumberMarker: marker })); }
      catch (error) {
        if (missing(error)) {
          // Completion may have succeeded despite a lost browser response.
          // Leave that case for reconciliation rather than calling it a failure.
          const size = await originalSize(management, id);
          if (size === video.size) {
            await db.video.update({ where: { id }, data: { status: 'UPLOADED', uploadId: null } });
            await queue.add('process', { id }, jobOptions(id));
          } else {
            await db.video.update({ where: { id }, data: { status: 'FAILED', error: 'The unfinished upload is no longer available. Upload the file again.' } });
          }
          throw new BadRequestException('Upload is no longer active. Check Sessions below.');
        }
        throw error;
      }
      parts.push(...(result.Parts ?? []));
      marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
    });
  }
  @Post('uploads/:id/part')
  async part(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    await admin(req);
    return withVideoLock(db, id, async db => {
    const number = z.number().int().min(1).max(10000).parse(body.part);
    const video = await db.video.findUniqueOrThrow({ where: { id } });
    if (video.status !== 'UPLOADING') throw new BadRequestException('Upload is not active');
    await db.video.update({ where: { id }, data: { updatedAt: new Date() } });
    return { url: await getSignedUrl(browserS3, new UploadPartCommand({ Bucket: bucket, Key: `originals/${id}`, UploadId: video.uploadId!, PartNumber: number }), { expiresIn: 3600 }) };
    });
  }
  @Post('uploads/:id/complete')
  async complete(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    await admin(req);
    return withVideoLock(db, id, async db => {
    const video = await db.video.findUniqueOrThrow({ where: { id } });
    if (video.status === 'UPLOADING') {
      const parts = z.array(z.object({ PartNumber: z.number().int().positive(), ETag: z.string() })).min(1).parse(body.parts);
      const uploadedSize = await originalSize(management, id);
      if (uploadedSize === null) {
        try {
          await s3.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: `originals/${id}`, UploadId: video.uploadId!, MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) } }));
        } catch (error) {
          if (await originalSize(management, id) === null) throw error;
        }
      }
      const size = await originalSize(management, id);
      if (size !== video.size) {
        await db.video.update({ where: { id }, data: { status: 'FAILED', uploadId: null, error: 'Uploaded size does not match the selected file. Upload the file again.' } });
        throw new BadRequestException('Size mismatch');
      }
      await db.video.update({ where: { id }, data: { status: 'UPLOADED', uploadId: null } });
    } else if (video.status !== 'UPLOADED') { return { ok: true, status: video.status }; }
    await queue.add('process', { id }, jobOptions(id));
    return { ok: true };
    });
  }
  @Post('uploads/:id/cancel')
  async cancel(@Req() req: Request, @Param('id') id: string) {
    await admin(req);
    return withVideoLock(db, id, async db => {
      const video = await db.video.findUnique({ where: { id } });
      if (!video) return { ok: true };
      if (video.status !== 'UPLOADING') throw new BadRequestException('Upload is not active');
      // Commit cleanup intent first; a failed cleanup remains explicitly retryable.
      await db.video.update({ where: { id }, data: { status: 'DELETING' } });
      return deleteVideo({ ...management, db }, id);
    });
  }
}
@Module({ controllers: [Api] })
class App {}
const app = await NestFactory.create(App);
app.use(cookieParser());
app.enableCors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173', credentials: true });
await app.listen(3000, '0.0.0.0');

const idleDays = Number(process.env.UPLOAD_IDLE_DAYS || 7);
if (!Number.isFinite(idleDays) || idleDays <= 0) throw new Error('UPLOAD_IDLE_DAYS must be positive');
const stopRecovery = startRecovery(management, 60000, idleDays * 86400000);
const stopMonitor = startStopMonitor(management);
app.enableShutdownHooks();
process.on('SIGTERM', () => { stopRecovery(); stopMonitor(); });
process.on('SIGINT', () => { stopRecovery(); stopMonitor(); });
