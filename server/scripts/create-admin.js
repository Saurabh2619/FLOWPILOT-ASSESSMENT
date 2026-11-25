import { loadConfig } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connect.js';
import { ensureAdmin } from '../src/services/admin-seed.service.js';

const config = loadConfig();
await connectDatabase(config.mongoUri);
try {
  const { email, created } = await ensureAdmin({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  console.log(`${created ? 'Created' : 'Promoted'} admin ${email}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
