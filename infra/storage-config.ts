import type { BucketLocationConstraint, CORSConfiguration } from '@aws-sdk/client-s3';
export function bucketLocation(region: string) {
  return region === 'us-east-1' ? {} : { CreateBucketConfiguration: { LocationConstraint: region as BucketLocationConstraint } };
}
export function bucketCors(origins: string[]): CORSConfiguration {
  return { CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ['GET', 'HEAD', 'PUT'],
    AllowedHeaders: ['*'], ExposeHeaders: ['ETag', 'Content-Length', 'Content-Range', 'Accept-Ranges'], MaxAgeSeconds: 600 }] };
}
