import "server-only";
import { createClient, type RedisClientType } from "redis";
import { config } from "@/server/config";

type AuthRedisClient = RedisClientType;

const shared = globalThis as unknown as {
  authRedis?: AuthRedisClient;
  authRedisConnection?: Promise<AuthRedisClient>;
};

function createRedisClient(): AuthRedisClient {
  const client = createClient({
    url: config.redisUrl,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: (retries) =>
        retries >= 2 ? false : (retries + 1) * 100,
    },
  });
  // Redis URLs and error messages can contain credentials. Log no connection details.
  client.on("error", () => console.error("Redis connection error."));
  return client;
}

export async function redis(): Promise<AuthRedisClient> {
  shared.authRedis ??= createRedisClient();
  const client = shared.authRedis;
  if (shared.authRedisConnection) return shared.authRedisConnection;
  if (client.isReady) return client;
  // During automatic reconnection, do not queue authentication work indefinitely.
  if (client.isOpen) throw new Error("Redis is not ready.");

  const connection = client.connect().then(() => client);
  shared.authRedisConnection = connection;
  try {
    return await connection;
  } finally {
    // A rejected connection must not poison all later attempts.
    if (shared.authRedisConnection === connection)
      shared.authRedisConnection = undefined;
  }
}
