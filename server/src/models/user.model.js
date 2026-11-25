import mongoose from 'mongoose';
import { PLAN_NAMES } from '../config/plans.js';

export const ROLES = ['user', 'admin'];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: 'user' },
    disabled: { type: Boolean, default: false },
    plan: { type: String, enum: PLAN_NAMES, default: 'free' },
  },
  { timestamps: true },
);

// The password hash never leaves the server.
userSchema.methods.toPublic = function toPublic() {
  return {
    id: this.id,
    email: this.email,
    role: this.role,
    disabled: this.disabled,
    plan: this.plan,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
