import { randomUUID } from 'node:crypto';
import { HttpError } from '../lib/errors.js';
import { createOpaqueToken, hashToken } from '../lib/tokens.js';
import { RefreshToken } from '../models/refresh-token.model.js';
import { User } from '../models/user.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const invalidSession = () => new HttpError(401, 'Session expired, please log in again');

async function createToken(userId, familyId, { refreshTtlDays }) {
  const token = createOpaqueToken();
  const record = await RefreshToken.create({
    userId,
    familyId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + refreshTtlDays * DAY_MS),
  });
  return { token, record };
}

function revoke(filter) {
  return RefreshToken.updateMany({ ...filter, revokedAt: null }, { revokedAt: new Date() });
}

export async function startSession(userId, authConfig) {
  const { token } = await createToken(userId, randomUUID(), authConfig);
  return token;
}

export async function rotateSession(token, authConfig) {
  const current = token && (await RefreshToken.findOne({ tokenHash: hashToken(token) }));
  if (!current) throw invalidSession();

  const { familyId, userId } = current;

  // A revoked token being presented again means it was copied: end the whole family.
  if (current.revokedAt) {
    await revoke({ familyId });
    throw invalidSession();
  }
  if (current.expiresAt <= new Date()) throw invalidSession();

  const user = await User.findById(userId);
  if (!user || user.disabled) {
    await revoke({ familyId });
    throw invalidSession();
  }

  // The replacement is written first, so a family revocation that races with this
  // rotation also covers it. Only one request can then claim the old token.
  const next = await createToken(userId, familyId, authConfig);
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: current._id, revokedAt: null },
    { revokedAt: new Date(), replacedBy: next.record._id },
  );
  if (!claimed) {
    await revoke({ familyId });
    throw invalidSession();
  }

  return { user, token: next.token };
}

export async function endSession(token) {
  const current = token && (await RefreshToken.findOne({ tokenHash: hashToken(token) }));
  if (current) await revoke({ familyId: current.familyId });
}

export function endAllSessions(userId) {
  return revoke({ userId });
}
