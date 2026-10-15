// Run while backend/worker are stopped. Does not remove any source objects or DB rows.
import { PrismaClient } from '@prisma/client';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
const bucket = process.env.S3_BUCKET!;
const source = new S3Client({ endpoint: 'http://localstack:4566', region: 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' }, requestChecksumCalculation: 'WHEN_REQUIRED' });
const target = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! }, requestChecksumCalculation: 'WHEN_REQUIRED' });
const db = new PrismaClient();
const pending = await db.video.count({ where: { status: { in: ['UPLOADING', 'UPLOADED', 'PROCESSING', 'RETRYING', 'DELETING'] } } });
await db.$disconnect();
if (pending) throw new Error('Finish or cancel all unfinished sessions using the old app before migration. No objects were changed.');
let token: string | undefined;
let copied = 0;
try {
  do {
    const page = await source.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const object of page.Contents ?? []) {
      if (!object.Key || (!object.Key.startsWith('originals/') && !object.Key.startsWith('videos/'))) continue;
      const media = await source.send(new GetObjectCommand({ Bucket: bucket, Key: object.Key }));
      if (!media.Body) throw new Error(`Unreadable object: ${object.Key}`);
      if ((media.ContentLength ?? 0) > 5 * 1024 ** 3) throw new Error('Migration helper supports existing objects up to 5 GiB. Use a multipart-capable S3 copy tool for larger originals. Source is unchanged.');
      await target.send(new PutObjectCommand({ Bucket: bucket, Key: object.Key, Body: media.Body as any,
        ContentLength: media.ContentLength, ContentType: media.ContentType, CacheControl: media.CacheControl, Metadata: media.Metadata }));
      const check = await target.send(new HeadObjectCommand({ Bucket: bucket, Key: object.Key }));
      if (check.ContentLength !== media.ContentLength) throw new Error(`Copy size verification failed: ${object.Key}`);
      copied++;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  console.log(`Copied and size-verified ${copied} objects. Source unchanged. Multipart uploads are not migrated.`);
} finally { source.destroy(); target.destroy(); }
