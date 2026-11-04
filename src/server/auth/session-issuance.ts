import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { type AuthContext, contextStore } from "@/server/auth/context-store";
import { setSessionCookie } from "@/server/auth/session-cookie";
import { config } from "@/server/config";
import { iamClient } from "@/server/infrastructure/iam";
import type { AuthenticationContext } from "@/server/infrastructure/iam-client";
import { SecurityError } from "@/server/security/request-security";

export function confirmGateway(
  context: AuthContext,
  gateway: AuthenticationContext,
  expectedAction: string,
) {
  const expiresAt = Date.parse(gateway.expiresAt);
  if (
    gateway.contextId !== context.gatewayContextId ||
    gateway.clientId !== context.clientId ||
    gateway.nextAction !== expectedAction ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  )
    throw new SecurityError("GATEWAY_CONFIRMATION_INVALID", 409);
}
let jwks: ReturnType<typeof createRemoteJWKSet>;
export async function issueSession(context: AuthContext) {
  const gateway = await iamClient.getContext(context.gatewayContextId);
  // A consumed gateway context can be retried only for idempotent delivery of
  // its existing session after an interrupted BFF response.
  confirmGateway(
    context,
    gateway,
    gateway.status === "CONSUMED" ? "COMPLETE" : "ISSUE_SESSION",
  );
  const session = await iamClient.createSession(
    context.gatewayContextId,
    `session:${context.id}`,
  );
  jwks ??= createRemoteJWKSet(new URL(config.jwksUrl));
  const { payload } = await jwtVerify(session.sessionToken, jwks, {
    issuer: config.iamIssuer,
    audience: context.clientId,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "sub"],
  });
  const methods = Array.isArray(payload.amr) ? (payload.amr as string[]) : [];
  if (
    payload.token_use !== "session" ||
    !(
      (methods.includes("pwd") && methods.includes("otp")) ||
      (methods.includes("fido") &&
        (methods.includes("uv") || methods.includes("otp")))
    )
  )
    throw new SecurityError("SESSION_ASSURANCE_INVALID", 502);
  const maxAge = Math.min(
    session.expiresIn,
    Math.floor(Number(payload.exp) - Date.now() / 1000),
  );
  if (!Number.isFinite(maxAge) || maxAge <= 0)
    throw new SecurityError("SESSION_EXPIRY_INVALID", 502);
  context.confirmedFactors = methods;
  context.stage = "COMPLETED";
  await contextStore.set(context);
  await setSessionCookie(session.sessionToken, maxAge);
}
