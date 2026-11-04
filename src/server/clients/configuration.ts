import "server-only";
import { z } from "zod";
import { config } from "@/server/config";
import { iamClient } from "@/server/infrastructure/iam";
import { SecurityError } from "@/server/security/request-security";
import { configuredOrigin } from "@/server/security/session-settings";

export const clientIdSchema = z.uuid();
export const stateSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const schema = z.object({
  clientId: clientIdSchema,
  enabled: z.boolean(),
  inlineEnabled: z.boolean(),
  protocol: z.literal("SHARED_COOKIE"),
  parentOrigin: z.string(),
  policy: z.object({
    version: z.string().min(1).max(80),
    contextTtlSeconds: z.number().int().min(60).max(600),
    methods: z.array(z.enum(["PASSWORD", "PASSKEY"])).min(1),
    mfaMethods: z.array(z.enum(["EMAIL_OTP", "SMS_OTP"])).min(1),
    registrationEnabled: z.boolean(),
  }),
});
export type ClientConfiguration = z.infer<typeof schema>;
const shared = globalThis as unknown as {
  clientConfigurations?: Map<
    string,
    { value: ClientConfiguration; expiresAt: number }
  >;
};
shared.clientConfigurations ??= new Map();
const cache = shared.clientConfigurations;

export async function getClientConfiguration(
  clientId: string,
): Promise<ClientConfiguration> {
  if (!clientIdSchema.safeParse(clientId).success)
    throw new SecurityError("CLIENT_INVALID", 400);
  const cached = cache.get(clientId);
  let value =
    cached && cached.expiresAt > Date.now() ? cached.value : undefined;
  if (!value) {
    // Never fall back to an expired security policy if the service is unavailable.
    value = schema.parse(await iamClient.getClientConfiguration(clientId));
    if (value.clientId !== clientId)
      throw new Error("Configuration client mismatch");
    const origin = configuredOrigin(
      value.parentOrigin,
      "registered parent origin",
    );
    const url = new URL(origin);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
      throw new Error("Registered parent must use HTTPS");
    const domain = config.sessionCookieDomain;
    if (
      domain &&
      url.hostname !== domain &&
      !url.hostname.endsWith(`.${domain}`)
    )
      throw new Error("Registered parent is outside the shared cookie domain");
    // Bounded cache; no unbounded growth from caller-supplied client IDs.
    for (const [key, entry] of cache)
      if (entry.expiresAt <= Date.now()) cache.delete(key);
    if (cache.size >= 1000) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(clientId, { value, expiresAt: Date.now() + 30_000 });
  }
  if (!value.enabled || !value.inlineEnabled)
    throw new SecurityError("CLIENT_NOT_ALLOWED", 403);
  return structuredClone(value);
}
