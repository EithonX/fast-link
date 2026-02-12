import { z } from 'zod';

export const TurnstileResponseSchema = z.object({
  success: z.boolean(),
  challenge_ts: z.string().optional(),
  hostname: z.string().optional(),
  'error-codes': z.array(z.string()).optional(),
  action: z.string().optional(),
  cdata: z.string().optional(),
});

export type TurnstileResponse = z.infer<typeof TurnstileResponseSchema>;
