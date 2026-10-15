import { S3Client, ListMultipartUploadsCommand } from '@aws-sdk/client-s3';
const client = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! } });
let KeyMarker: string | undefined, UploadIdMarker: string | undefined;
try {
  do {
    const page = await client.send(new ListMultipartUploadsCommand({ Bucket: process.env.S3_BUCKET!, Prefix: 'originals/', KeyMarker, UploadIdMarker }));
    console.log(JSON.stringify(page.Uploads ?? [], null, 2));
    KeyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    UploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
  } while (KeyMarker);
} finally { client.destroy(); }
