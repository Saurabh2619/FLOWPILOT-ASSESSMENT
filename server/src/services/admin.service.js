import { isValidObjectId } from 'mongoose';
import { HttpError } from '../lib/errors.js';
import { User } from '../models/user.model.js';
import { endAllSessions } from './session.service.js';

export async function listUsers({ page, limit }) {
  const [users, total] = await Promise.all([
    User.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(),
  ]);
  return { users: users.map((user) => user.toPublic()), page, limit, total };
}

export async function setUserDisabled({ actorId, userId, disabled }) {
  if (!isValidObjectId(userId)) throw new HttpError(404, 'User not found');
  if (disabled && String(actorId) === userId) {
    throw new HttpError(400, 'You cannot disable your own account');
  }

  const user = await User.findByIdAndUpdate(userId, { disabled }, { returnDocument: 'after' });
  if (!user) throw new HttpError(404, 'User not found');
  if (disabled) await endAllSessions(user._id);
  return user;
}
