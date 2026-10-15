import { z } from 'zod';
import { MAX_BYTES } from './index';

export const metadataSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title.').max(200, 'Use at most 200 characters.'),
  description: z.string().max(5000, 'Use at most 5,000 characters.').default(''),
});
export const uploadSchema = metadataSchema.extend({
  filename: z.string().min(1).max(255).regex(/\.(mp4|mov|m4v|mkv|webm)$/i, 'Choose MP4, MOV, M4V, MKV or WebM.'),
  size: z.number().int().positive('Choose a nonempty file.').max(MAX_BYTES, 'File must be at most 20 GiB.'),
});
export const partSchema = z.object({ part: z.number().int().min(1).max(10000) });
export const completeSchema = z.object({
  parts: z.array(z.object({ PartNumber: z.number().int().min(1).max(10000), ETag: z.string().min(1).max(1024) })).min(1).max(10000),
}).superRefine(({ parts }, context) => {
  if (new Set(parts.map(part => part.PartNumber)).size !== parts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['parts'], message: 'Duplicate part numbers.' });
  }
});
export function supportedContainer(formatName: unknown) {
  return typeof formatName === 'string' && formatName.split(',').some(name => ['mov', 'mp4', 'matroska', 'webm'].includes(name));
}
