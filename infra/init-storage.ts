import { S3Client, HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
import { frontendOrigins } from '../packages/contracts/src/origins';
import { bucketLocation, bucketCors } from './storage-config';

const bucket = process.env.S3_BUCKET!;
const region = process.env.S3_REGION || 'us-east-1';
const origins = frontendOrigins();
const mode = process.env.S3_CORS_MODE || 'minio';
if (!['minio', 'bucket'].includes(mode)) throw new Error('S3_CORS_MODE must be minio or bucket');
const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region,
  forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED',
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! } });
try {
  try { await s3.send(new HeadBucketCommand({ Bucket: bucket })); }
  catch (error: any) {
    if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound') throw error;
    await s3.send(new CreateBucketCommand({ Bucket: bucket, ...bucketLocation(region) }));
  }
  // This MinIO release uses server-wide CORS, supplied by Compose. AWS uses bucket CORS.
  // Do not hide permission failures behind a provider fallback.
  if (mode === 'bucket') {
    await s3.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: bucketCors(origins) }));
    const result = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
    if (!result.CORSRules?.some(rule => origins.every(origin => rule.AllowedOrigins?.includes(origin)) &&
      ['GET', 'HEAD', 'PUT'].every(method => rule.AllowedMethods?.includes(method)) && rule.ExposeHeaders?.includes('ETag'))) {
      throw new Error('Bucket CORS readback did not match the required origins, methods and ETag exposure');
    }
  }
  // Only processed media is public. Originals and unfinished uploads stay private.
  await s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify({
    Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${bucket}/videos/*`] }],
  }) }));
  console.log(JSON.stringify({ message: 'Persistent video storage initialized', corsMode: mode, origins }));
} finally { s3.destroy(); }
