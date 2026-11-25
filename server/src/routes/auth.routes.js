import { Router } from 'express';
import { signAccessToken } from '../lib/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import * as authService from '../services/auth.service.js';
import { loginSchema, signupSchema } from './auth.schemas.js';

export function createAuthRouter(config) {
  const router = Router();
  const limit = () => createRateLimiter(config.auth.rateLimitMax);

  router.post('/signup', limit(), validateBody(signupSchema), async (req, res) => {
    const user = await authService.signup(req.body);
    res.status(201).json({ user: user.toPublic() });
  });

  router.post('/login', limit(), validateBody(loginSchema), async (req, res) => {
    const user = await authService.login(req.body);
    res.json({ user: user.toPublic(), accessToken: signAccessToken(user.id, config.auth) });
  });

  router.get('/me', requireAuth(config), (req, res) => {
    res.json({ user: req.user.toPublic() });
  });

  return router;
}
