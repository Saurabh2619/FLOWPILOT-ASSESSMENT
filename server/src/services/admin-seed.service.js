import { signupSchema } from '../routes/auth.schemas.js';
import { User } from '../models/user.model.js';
import { signup } from './auth.service.js';

export async function ensureAdmin(input) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters)');
  }
  const { email, password } = parsed.data;

  // An existing account keeps its password; only the role changes.
  const existing = await User.findOneAndUpdate({ email }, { role: 'admin' });
  if (existing) return { email, created: false };

  const user = await signup({ email, password });
  await User.updateOne({ _id: user._id }, { role: 'admin' });
  return { email, created: true };
}
