import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongod: MongoMemoryServer | undefined;

export async function connectTestDb() {
  mongod = await MongoMemoryServer.create({ binary: { version: "7.0.14" } });
  await mongoose.connect(mongod.getUri());
}

export async function disconnectTestDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

export async function clearTestDb() {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
