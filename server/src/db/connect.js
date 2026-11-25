import mongoose from 'mongoose';

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Unique indexes must exist before the first write relies on them.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

export function disconnectDatabase() {
  return mongoose.disconnect();
}
