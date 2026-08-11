import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@/generated/prisma-edge/client';

const globalForPrisma = globalThis as unknown as {
  edgePrisma: PrismaClient | undefined;
};

function getClient(): PrismaClient {
  if (globalForPrisma.edgePrisma) return globalForPrisma.edgePrisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for the OMNININJA database');
  }

  const adapter = new PrismaNeon({ connectionString });
  const client = new PrismaClient({ adapter, log: ['error', 'warn'] });
  globalForPrisma.edgePrisma = client;
  return client;
}

// Keep initialization lazy so a build never needs production credentials.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
