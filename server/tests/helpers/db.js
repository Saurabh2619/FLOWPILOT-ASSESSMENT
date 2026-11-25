import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/db/connect.js';

const BASE_URI = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017';

export function useTestDatabase() {
  beforeAll(async () => {
    const name = `flowpilot-test-${randomUUID().slice(0, 8)}`;
    await connectDatabase(`${BASE_URI}/${name}`);
  });

  beforeEach(async () => {
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });
}
