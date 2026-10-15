import { HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, ListPartsCommand, type S3Client } from '@aws-sdk/client-s3';

export type Snapshot = {
  version: 1; id: string; bucket: string; endpoint: string;
  key: string; uploadId: string | null;
};
type Deps = {
  s3: Pick<S3Client, 'send'>; bucket: string; endpoint: string;
  db: { video: { findUnique(args: any): Promise<any> } };
};
export async function inspectSession(deps: Deps, id: string, previous?: Snapshot) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid session ID');
  if (previous && (previous.version !== 1 || previous.id !== id || previous.bucket !== deps.bucket ||
      previous.endpoint !== deps.endpoint || previous.key !== `originals/${id}`)) {
    throw new Error('Snapshot does not match this session/storage configuration');
  }
  // A missing bucket or denied request must never count as successful deletion.
  await deps.s3.send(new HeadBucketCommand({ Bucket: deps.bucket }));
  const row = await deps.db.video.findUnique({ where: { id } });
  const snapshot: Snapshot = previous ?? {
    version: 1, id, bucket: deps.bucket, endpoint: deps.endpoint,
    key: `originals/${id}`, uploadId: row?.uploadId ?? null,
  };
  let originalBytes: number | null = null;
  try {
    const result = await deps.s3.send(new HeadObjectCommand({ Bucket: deps.bucket, Key: snapshot.key }));
    originalBytes = result.ContentLength ?? 0;
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode !== 404 && !['NotFound', 'NoSuchKey'].includes(error?.name)) throw error;
  }
  let generatedFileCount = 0;
  let token: string | undefined;
  do {
    const page = await deps.s3.send(new ListObjectsV2Command({
      Bucket: deps.bucket, Prefix: `videos/${id}/`, ContinuationToken: token,
    }));
    generatedFileCount += page.Contents?.length ?? 0;
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && !token) throw new Error('Storage returned truncated objects without a continuation token');
  } while (token);
  let multipart: 'PRESENT' | 'ABSENT' | 'NOT_CAPTURED' = 'NOT_CAPTURED';
  let savedParts = 0, savedBytes = 0;
  if (snapshot.uploadId) {
    let marker: string | undefined;
    try {
      do {
        const page = await deps.s3.send(new ListPartsCommand({
          Bucket: deps.bucket, Key: snapshot.key, UploadId: snapshot.uploadId, PartNumberMarker: marker,
        }));
        savedParts += page.Parts?.length ?? 0;
        savedBytes += (page.Parts ?? []).reduce((sum, part) => sum + (part.Size ?? 0), 0);
        marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
        if (page.IsTruncated && !marker) throw new Error('Storage returned truncated parts without a marker');
      } while (marker);
      multipart = 'PRESENT';
    } catch (error: any) {
      if (error?.name !== 'NoSuchUpload') throw error;
      multipart = 'ABSENT';
    }
  }
  return {
    snapshot, checkedAt: new Date().toISOString(), databaseStatus: row?.status ?? 'ABSENT',
    originalExists: originalBytes !== null, originalBytes, generatedFileCount,
    multipart, savedParts, savedBytes,
    deletionVerified: !row && originalBytes === null && generatedFileCount === 0 && multipart !== 'PRESENT' &&
      // Without a captured multipart identity, never claim multipart cleanup.
      (!!snapshot.uploadId || previous !== undefined && snapshot.uploadId === null),
  };
}
