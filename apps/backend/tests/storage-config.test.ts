import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendOrigins } from '../../../packages/contracts/src/origins';
import { bucketLocation, bucketCors } from '../../../infra/storage-config';
test('explicit origin list supports localhost and LAN without wildcards', () => {
  assert.deepEqual(frontendOrigins({ FRONTEND_ORIGINS: 'http://localhost:5173,http://192.168.1.195:5173,http://localhost:5173/' }),
    ['http://localhost:5173', 'http://192.168.1.195:5173']);
  for (const value of ['*', 'http://example.com/path', 'http://user:pass@example.com', 'file:///tmp']) {
    assert.throws(() => frontendOrigins({ FRONTEND_ORIGINS: value }));
  }
  assert.deepEqual(frontendOrigins({}), ['http://localhost:5173']);
});
test('bucket rules expose multipart ETags and support GET HEAD PUT', () => {
  const rules = bucketCors(['http://localhost:5173']).CORSRules![0];
  assert.deepEqual(rules.AllowedMethods, ['GET', 'HEAD', 'PUT']);
  assert.ok(rules.ExposeHeaders?.includes('ETag'));
  assert.deepEqual(rules.AllowedOrigins, ['http://localhost:5173']);
});
test('AWS bucket creation omits us-east-1 location and sets other regions', () => {
  assert.deepEqual(bucketLocation('us-east-1'), {});
  assert.deepEqual(bucketLocation('us-west-2'), { CreateBucketConfiguration: { LocationConstraint: 'us-west-2' } });
});
