import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@/generated/prisma-edge/client';
import { AsyncLocalStorage } from 'node:async_hooks';

type EdgeDatabaseScope = {
  client?: PrismaClient;
};

const databaseScope = new AsyncLocalStorage<EdgeDatabaseScope>();

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for the OMNININJA database');
  }

  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter, log: ['error', 'warn'] });
}

function getClient(): PrismaClient {
  const scope = databaseScope.getStore();
  if (!scope) {
    throw new Error('OMNININJA database accessed outside the Worker request scope');
  }

  scope.client ??= createClient();
  return scope.client;
}

async function disposeScope(scope: EdgeDatabaseScope): Promise<void> {
  const client = scope.client;
  scope.client = undefined;
  if (client) await client.$disconnect().catch(() => {});
}

function responseWithDatabaseCleanup(
  response: Response,
  scope: EdgeDatabaseScope,
): Response {
  if (!response.body) return response;

  const reader = response.body.getReader();
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await disposeScope(scope);
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          await dispose();
          controller.close();
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        await dispose();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await dispose();
      }
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Cloudflare reuses an isolate across requests, but Neon WebSocket I/O cannot
 * cross request contexts. Keep one lazy Prisma client per incoming request and
 * dispose it only after the response body (including SSE) has finished.
 */
export function withEdgeDatabaseRequest(
  handler: () => Promise<Response>,
): Promise<Response> {
  const scope: EdgeDatabaseScope = {};

  return databaseScope.run(scope, async () => {
    try {
      const response = await handler();
      if (!scope.client) return response;
      if (!response.body) {
        await disposeScope(scope);
        return response;
      }
      return responseWithDatabaseCleanup(response, scope);
    } catch (error) {
      await disposeScope(scope);
      throw error;
    }
  });
}

// Keep initialization lazy so a build never needs production credentials.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
