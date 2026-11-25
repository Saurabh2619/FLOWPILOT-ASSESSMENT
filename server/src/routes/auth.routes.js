import { Router } from 'express';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from '../lib/cookies.js';
import { signAccessToken } from '../lib/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import * as authService from '../services/auth.service.js';
import * as passwordService from '../services/password.service.js';
import * as sessionService from '../services/session.service.js';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from './auth.schemas.js';

export function createAuthRouter(config, { emailProvider }) {
  const router = Router();
  const limit = () => createRateLimiter(config.auth.rateLimitMax);

  const sendSession = (res, user, refreshToken) => {
    setRefreshCookie(res, refreshToken, config);
    res.json({ user: user.toPublic(), accessToken: signAccessToken(user.id, config.auth) });
  };

  router.post('/signup', limit(), validateBody(signupSchema), async (req, res) => {
    const user = await authService.signup(req.body);
    res.status(201).json({ user: user.toPublic() });
  });

  router.post('/login', limit(), validateBody(loginSchema), async (req, res) => {
    const user = await authService.login(req.body);
    sendSession(res, user, await sessionService.startSession(user.id, config.auth));
  });

  router.post('/refresh', async (req, res) => {
    try {
      const { user, token } = await sessionService.rotateSession(
        req.cookies[REFRESH_COOKIE],
        config.auth,
      );
      sendSession(res, user, token);
    } catch (error) {
      if (error.status === 401) clearRefreshCookie(res, config);
      throw error;
    }
  });

  router.post('/logout', async (req, res) => {
    await sessionService.endSession(req.cookies[REFRESH_COOKIE]);
    clearRefreshCookie(res, config);
    res.status(204).end();
  });

  router.post('/forgot-password', limit(), validateBody(forgotPasswordSchema), async (req, res) => {
    await passwordService.requestPasswordReset(req.body.email, { config, emailProvider });
    res.status(202).json({ message: 'If that account exists, a reset link has been sent' });
  });

  router.post('/reset-password', limit(), validateBody(resetPasswordSchema), async (req, res) => {
    await passwordService.resetPassword(req.body);
    res.status(204).end();
  });

  router.get('/me', requireAuth(config), (req, res) => {
    res.json({ user: req.user.toPublic() });
  });

  return router;
}
