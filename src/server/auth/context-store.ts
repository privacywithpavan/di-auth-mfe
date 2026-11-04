import "server-only";
import { randomUUID } from "node:crypto";
import type { ClientConfiguration } from "@/server/clients/configuration";
import { config } from "@/server/config";
import type { MfaMethod } from "@/server/infrastructure/iam-client";
import { redis } from "@/server/infrastructure/redis";
import { SecurityError } from "@/server/security/request-security";

export type ContextStage =
  | "PASSWORD"
  | "MFA_METHOD"
  | "OTP"
  | "COMPLETED"
  | "CANCELLED"
  | "REG_EMAIL"
  | "REG_PROFILE"
  | "REG_PASSKEY"
  | "REG_PHONE"
  | "REG_CONSENT";
export interface AuthContext {
  id: string;
  gatewayContextId: string;
  clientId: string;
  state: string;
  parentOrigin: string;
  policy: ClientConfiguration["policy"];
  confirmedFactors: string[];
  browserBindingHash: string;
  stage: ContextStage;
  challengeId?: string;
  method?: MfaMethod;
  createdAt: number;
  expiresAt: number;
}

const shared = globalThis as unknown as {
  authContexts?: Map<string, AuthContext>;
  authLocks?: Set<string>;
  authStates?: Map<string, number>;
};
shared.authContexts ??= new Map();
const records = shared.authContexts;
shared.authLocks ??= new Set();
const locks = shared.authLocks;
shared.authStates ??= new Map();
const states = shared.authStates;
const usesRedisStorage = () => {
  if (
    process.env.NODE_ENV === "production" &&
    config.transactionStore !== "redis"
  )
    throw new Error(
      "Production authentication contexts require TRANSACTION_STORE=redis",
    );
  return config.transactionStore === "redis";
};
const releaseLockScript =
  "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end";

export const contextStore = {
  async get(id: string): Promise<AuthContext | null> {
    let value: AuthContext | null | undefined;
    if (usesRedisStorage()) {
      const client = await redis();
      value = JSON.parse(
        (await client.get(`iam-poc:context:${id}`)) ?? "null",
      ) as AuthContext | null;
    } else {
      value = records.get(id);
    }
    if (!value || value.expiresAt <= Date.now()) return null;
    return structuredClone(value);
  },

  async set(value: AuthContext): Promise<void> {
    if (value.expiresAt <= Date.now())
      throw new SecurityError("CONTEXT_EXPIRED", 410);
    if (usesRedisStorage()) {
      const client = await redis();
      const ttl = value.expiresAt - Date.now();
      if (ttl <= 0) throw new SecurityError("CONTEXT_EXPIRED", 410);
      await client.set(`iam-poc:context:${value.id}`, JSON.stringify(value), {
        expiration: { type: "PX", value: ttl },
      });
    } else {
      for (const [id, record] of records)
        if (record.expiresAt <= Date.now()) records.delete(id);
      records.set(value.id, structuredClone(value));
    }
  },

  async consumeState(key: string, expiresAt: number): Promise<boolean> {
    if (usesRedisStorage()) {
      const client = await redis();
      return (
        (await client.set(`iam-poc:state:${key}`, "used", {
          expiration: {
            type: "PX",
            value: Math.max(1, expiresAt - Date.now()),
          },
          condition: "NX",
        })) === "OK"
      );
    }
    for (const [id, expiry] of states)
      if (expiry <= Date.now()) states.delete(id);
    if (states.has(key)) return false;
    states.set(key, expiresAt);
    return true;
  },

  async withLock<T>(id: string, work: () => Promise<T>): Promise<T> {
    const remote = usesRedisStorage();
    const client = remote ? await redis() : undefined;
    const key = `iam-poc:context-lock:${id}`;
    const owner = randomUUID();
    if (
      client
        ? (await client.set(key, owner, {
            expiration: { type: "EX", value: 90 },
            condition: "NX",
          })) !== "OK"
        : locks.has(id)
    )
      throw new SecurityError("CONTEXT_BUSY", 409);
    if (!remote) locks.add(id);
    try {
      return await work();
    } finally {
      if (client)
        await client.eval(releaseLockScript, {
          keys: [key],
          arguments: [owner],
        });
      else locks.delete(id);
    }
  },
};
