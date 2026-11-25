import { Router } from 'express';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import * as authService from '../services/auth.service.js';
import { signupSchema } from './auth.schemas.js';

export function createAuthRouter(config) {
  const router = Router();

  router.post(
    '/signup',
    createRateLimiter(config.auth.rateLimitMax),
    validateBody(signupSchema),
    async (req, res) => {
      const user = await authService.signup(req.body);
      res.status(201).json({ user: user.toPublic() });
    },
  );

  return router;
}
