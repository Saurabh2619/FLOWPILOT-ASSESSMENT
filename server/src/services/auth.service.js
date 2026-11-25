import { HttpError } from '../lib/errors.js';
import { hashPassword } from '../lib/passwords.js';
import { User } from '../models/user.model.js';

const DUPLICATE_KEY = 11000;

export async function signup({ email, password }) {
  const passwordHash = await hashPassword(password);
  try {
    // Role and plan are never taken from the request.
    return await User.create({ email, passwordHash });
  } catch (error) {
    if (error.code === DUPLICATE_KEY) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    throw error;
  }
}
