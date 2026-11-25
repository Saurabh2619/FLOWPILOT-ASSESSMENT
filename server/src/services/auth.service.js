import { HttpError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { User } from '../models/user.model.js';

const DUPLICATE_KEY = 11000;

const dummyHash = hashPassword('unused-password-for-timing');

export async function signup({ email, password }) {
  const passwordHash = await hashPassword(password);
  try {
    return await User.create({ email, passwordHash });
  } catch (error) {
    if (error.code === DUPLICATE_KEY) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    throw error;
  }
}

export async function login({ email, password }) {
  const user = await User.findOne({ email });
  const matches = await verifyPassword(user?.passwordHash ?? (await dummyHash), password);
  if (!user || !matches) throw new HttpError(401, 'Incorrect email or password');
  if (user.disabled) throw new HttpError(403, 'This account is disabled');
  return user;
}
