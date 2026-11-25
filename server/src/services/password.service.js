import { HttpError } from '../lib/errors.js';
import { hashPassword } from '../lib/passwords.js';
import { createOpaqueToken, hashToken } from '../lib/tokens.js';
import { PasswordReset } from '../models/password-reset.model.js';
import { User } from '../models/user.model.js';
import { endAllSessions } from './session.service.js';

export async function requestPasswordReset(email, { config, emailProvider }) {
  const user = await User.findOne({ email });
  if (!user || user.disabled) return;

  // Only the most recent link works.
  await PasswordReset.updateMany({ userId: user._id, usedAt: null }, { usedAt: new Date() });

  const token = createOpaqueToken();
  await PasswordReset.create({
    userId: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + config.auth.resetTtlMinutes * 60 * 1000),
  });

  const resetUrl = new URL('/reset-password', config.appUrl);
  resetUrl.searchParams.set('token', token);
  await emailProvider.sendPasswordReset({ to: user.email, resetUrl: resetUrl.toString() });
}

export async function resetPassword({ token, password }) {
  const passwordHash = await hashPassword(password);

  // Claiming the token in one operation makes it single-use, even under a race.
  const reset = await PasswordReset.findOneAndUpdate(
    { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date() } },
    { usedAt: new Date() },
  );
  if (!reset) throw new HttpError(400, 'This reset link is invalid or has expired');

  await User.updateOne({ _id: reset.userId }, { passwordHash });
  await endAllSessions(reset.userId);
}
