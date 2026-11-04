import "server-only";
import {
  configuredOrigin,
  sessionSettings,
} from "@/server/security/session-settings";

function required(name: string, developmentDefault: string) {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production")
    throw new Error(`${name} is required in production`);
  return developmentDefault;
}

export const config = {
  get iamUrl() {
    return (
      process.env.IAM_API_URL ||
      process.env.MOCK_IAM_URL ||
      required("IAM_API_URL", "http://localhost:5050")
    );
  },
  get configurationUrl() {
    return process.env.CLIENT_CONFIGURATION_URL || config.iamUrl;
  },
  get subscriberId() {
    return required("SUBSCRIBER_ID", "iam-chatbot-mfe-bff");
  },
  get subscriberSecret() {
    return required("SUBSCRIBER_SECRET", "dev-only-secret");
  },
  get identityOrigin() {
    sessionSettings();
    return configuredOrigin(
      required("IDENTITY_ORIGIN", "http://localhost:3000"),
      "IDENTITY_ORIGIN",
    );
  },
  get sessionCookieName() {
    return sessionSettings().name;
  },
  get sessionCookieDomain() {
    return sessionSettings().options.domain;
  },
  get sessionCookieOptions() {
    return sessionSettings().options;
  },
  get iamIssuer() {
    return process.env.IAM_ISSUER || config.iamUrl;
  },
  get jwksUrl() {
    return process.env.IAM_JWKS_URL || `${config.iamUrl}/.well-known/jwks.json`;
  },
  transactionStore: process.env.TRANSACTION_STORE ?? "memory",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  get secureCookies() {
    return sessionSettings().options.secure;
  },
} as const;
