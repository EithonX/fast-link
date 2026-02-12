import { z } from 'zod';

export const PrivateBinResponseSchema = z.object({
  status: z.number(),
  id: z.string(),
  url: z.string(),
  deletetoken: z.string(),
  message: z.string().optional(),
});

export type PrivateBinResponse = z.infer<typeof PrivateBinResponseSchema>;
