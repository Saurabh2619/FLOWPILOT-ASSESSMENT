import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

const ALGORITHM = 'HS256';

export function signAccessToken(userId, { accessSecret, accessTtlSeconds }) {
  return jwt.sign({}, accessSecret, {
    algorithm: ALGORITHM,
    subject: String(userId),
    expiresIn: accessTtlSeconds,
  });
}

// Throws when the token is invalid or expired. The algorithm is pinned.
export function verifyAccessToken(token, { accessSecret }) {
  return jwt.verify(token, accessSecret, { algorithms: [ALGORITHM] }).sub;
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

// Opaque tokens are high-entropy, so a fast hash is enough for storage.
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
