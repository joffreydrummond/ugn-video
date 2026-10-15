import { S3Client, HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';

const bucket = process.env.S3_BUCKET!;
const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION,
  forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! } });
try { await s3.send(new HeadBucketCommand({ Bucket: bucket })); }
catch (error: any) {
  if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound') throw error;
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
}
// Only processed media is public. Originals and unfinished uploads stay private.
await s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify({
  Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${bucket}/videos/*`] }],
}) }));
console.log('Persistent video storage initialized.');
s3.destroy();
