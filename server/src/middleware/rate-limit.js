import { rateLimit } from 'express-rate-limit';

const WINDOW_MS = 15 * 60 * 1000;

export function createRateLimiter(limit) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message: 'Too many attempts, try again later' } },
  });
}
