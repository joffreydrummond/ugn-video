import type { PrismaClient } from '@prisma/client';

// Serialize API/maintenance operations for one video across backend processes.
// Preserve recovery state even when storage/Redis throws; surface the error after commit.
export async function withVideoLock<T>(db: PrismaClient, id: string, work: (tx: PrismaClient) => Promise<T>): Promise<T> {
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
    try { return { value: await work(tx as unknown as PrismaClient) }; }
    catch (error) { return { error }; }
  }, { maxWait: 10000, timeout: 120000 });
  if ('error' in result) throw result.error;
  return result.value as T;
}
