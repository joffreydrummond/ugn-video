import { PrismaClient } from '@prisma/client';
import { S3Client, ListMultipartUploadsCommand } from '@aws-sdk/client-s3';
import { inspectSession, type Snapshot } from './storage-inspection';

const db = new PrismaClient();
const bucket = process.env.S3_BUCKET!;
const endpoint = process.env.S3_ENDPOINT!;
const s3 = new S3Client({
  endpoint, region: process.env.S3_REGION, forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
});
const deps = { db, s3, bucket, endpoint };
try {
  const [mode, id] = process.argv.slice(2);
  if (mode === 'snapshot') {
    if (!id) throw new Error('Usage: inspect-storage.ts snapshot SESSION_ID');
    const result = await inspectSession(deps, id);
    if (result.databaseStatus === 'ABSENT') throw new Error('Capture the snapshot BEFORE deleting the session');
    console.log(JSON.stringify(result, null, 2));
  } else if (mode === 'verify') {
    let text = '';
    for await (const chunk of process.stdin) text += chunk.toString();
    const saved = JSON.parse(text.replace(/^\uFEFF/, '')) as { snapshot: Snapshot };
    if (!saved.snapshot) throw new Error('Pipe a saved snapshot JSON into verify');
    const result = await inspectSession(deps, saved.snapshot.id, saved.snapshot);
    console.log(JSON.stringify(result, null, 2));
    if (!result.deletionVerified) process.exitCode = 2;
  } else if (!mode || mode === 'inventory-all') {
    let KeyMarker: string | undefined, UploadIdMarker: string | undefined;
    let listed = 0;
    do {
      const page = await s3.send(new ListMultipartUploadsCommand({
        Bucket: bucket, KeyMarker, UploadIdMarker,
      }));
      const uploads = (page.Uploads ?? []).filter(upload => mode === 'inventory-all' || upload.Key?.startsWith('originals/'));
      listed += uploads.length;
      console.log(JSON.stringify({ source: 'multipart inventory', prefix: null, localKeyFilter: mode === 'inventory-all' ? null : 'originals/', uploads }, null, 2));
      if (page.IsTruncated && (!page.NextKeyMarker || (page.NextKeyMarker === KeyMarker && page.NextUploadIdMarker === UploadIdMarker))) throw new Error('Multipart inventory pagination did not advance');
      KeyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      UploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
    } while (KeyMarker);
    const rows = await db.video.findMany({ where: { status: { in: ['UPLOADING', 'DELETING'] } }, select: { id: true } });
    for (const row of rows) console.log(JSON.stringify(await inspectSession(deps, row.id), null, 2));
    if (listed === 0) console.error('Empty inventory is NOT proof of cleanup. Use snapshot/verify for a specific session; tracked uploads are checked directly above.');
  } else throw new Error('Supported modes: snapshot SESSION_ID, verify (JSON on stdin), inventory-all, or no arguments');
} catch (error: any) {
  console.error(error?.name ?? 'Error', error?.message ?? String(error));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
  s3.destroy();
}
