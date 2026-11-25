import { HttpError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { User } from '../models/user.model.js';

// The user is loaded on every request, so disabling an account takes effect at once.
export function requireAuth(config) {
  return async (req, res, next) => {
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Authentication required');

    let userId;
    try {
      userId = verifyAccessToken(token, config.auth);
    } catch {
      throw new HttpError(401, 'Invalid or expired token');
    }

    const user = await User.findById(userId);
    if (!user) throw new HttpError(401, 'Invalid or expired token');
    if (user.disabled) throw new HttpError(403, 'This account is disabled');

    req.user = user;
    next();
  };
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) throw new HttpError(403, 'You do not have access to this');
    next();
  };
}
