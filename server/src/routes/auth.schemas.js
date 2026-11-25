import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));
const newPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const signupSchema = z.object({ email, password: newPassword });

// No length rules here, so a policy change never locks out existing accounts.
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
