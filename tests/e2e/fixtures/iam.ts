import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { json, listen } from "./http";
import {
  type AccountFlow,
  createAccountFlows,
  type Principal,
} from "./passkeys";

export const clientId = "657290eb-5ba8-4cf2-b3c9-b6c7888cab87";
export const sessionCookie = "di_auth_e2e_session";
export const account = {
  email: "playwright@example.test",
  password: "FixturePassword1!",
  code: "381649",
  name: "Test User",
};
export const skipPasskeyAccount = {
  ...account,
  email: "playwright-skip@example.test",
  name: "Skip Test",
};
export const recoveryPasskeyAccount = {
  ...account,
  email: "playwright-recovery@example.test",
  name: "Recovery Test",
};
export const subscriber = {
  id: "playwright-fixture",
  secret: "local-fixture-subscriber-secret",
};

async function body(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  let content = "";
  for await (const chunk of request.setEncoding("utf8")) content += chunk;
  return JSON.parse(content);
}

type GatewayContext = AccountFlow & {
  contextId: string;
  clientId: string;
  expiresAt: string;
  status: "ACTIVE" | "AUTHENTICATED" | "CONSUMED" | "CANCELLED";
  nextAction:
    | "ENTER_PASSWORD"
    | "SELECT_MFA_METHOD"
    | "ENTER_OTP"
    | "OFFER_PASSKEY"
    | "ISSUE_SESSION"
    | "COMPLETE"
    | "CANCELLED";
  challenge?: { id: string; code: string; expiresAt: number };
  challengeSequence?: number;
  principal?: Principal;
  passwordEmail?: string;
  session?: { key: string; token: string };
};

export async function startIam(mfeOrigin: string, passkeysEnabled: boolean) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "playwright",
    alg: "RS256",
  };
  const bearer = randomUUID();
  const contexts = new Map<string, GatewayContext>();
  const root = "/internal/authentication/contexts";
  const configuration = `/internal/configuration/clients/${clientId}`;
  let parentOrigin: string;
  let issuer: string;
  let nextContextLifetimeMs = 300_000;
  let passkeyEnrollments = 0;
  let sessionsIssued = 0;
  const accounts = createAccountFlows({
    mfeOrigin,
    parentOrigin: () => parentOrigin,
    demoAccounts: [account, skipPasskeyAccount, recoveryPasskeyAccount],
    code: account.code,
  });

  const server = await listen(async (request, response) => {
    const { method, url } = request;
    if (method === "GET" && url === "/.well-known/jwks.json") {
      return json(response, 200, { keys: [jwk] });
    }
    if (method === "POST" && url === "/oauth/subscriber/token") {
      const input = await body(request);
      if (
        input.subscriberId !== subscriber.id ||
        input.subscriberSecret !== subscriber.secret
      ) {
        return json(response, 401, { code: "INVALID_SUBSCRIBER" });
      }
      return json(response, 200, { accessToken: bearer, expiresIn: 600 });
    }
    if (request.headers.authorization !== `Bearer ${bearer}`) {
      return json(response, 401, { code: "INVALID_SUBSCRIBER" });
    }
    if (method === "GET" && url === configuration) {
      return json(response, 200, {
        clientId,
        parentOrigin,
        enabled: true,
        inlineEnabled: true,
        protocol: "SHARED_COOKIE",
        policy: {
          version: "e2e",
          contextTtlSeconds: 300,
          methods: passkeysEnabled ? ["PASSKEY", "PASSWORD"] : ["PASSWORD"],
          mfaMethods: ["EMAIL_OTP"],
          registrationEnabled: passkeysEnabled,
        },
      });
    }

    const key = request.headers["idempotency-key"];
    if (method === "POST" && typeof key !== "string") {
      return json(response, 400, { code: "IDEMPOTENCY_KEY_REQUIRED" });
    }
    if (method === "POST" && url === root) {
      if ((await body(request)).clientId !== clientId) {
        return json(response, 400, { code: "CLIENT_NOT_ALLOWED" });
      }
      const context: GatewayContext = {
        contextId: randomUUID(),
        clientId,
        expiresAt: new Date(Date.now() + nextContextLifetimeMs).toISOString(),
        status: "ACTIVE",
        nextAction: "ENTER_PASSWORD",
      };
      nextContextLifetimeMs = 300_000;
      contexts.set(context.contextId, context);
      return json(response, 201, context);
    }

    if (!url?.startsWith(`${root}/`)) {
      return json(response, 404, { code: "NOT_FOUND" });
    }
    const [contextId, ...parts] = url.slice(root.length + 1).split("/");
    const action = parts.join("/");
    const context = contexts.get(contextId);
    if (!context || Date.parse(context.expiresAt) <= Date.now()) {
      return json(response, 404, { code: "CONTEXT_NOT_FOUND" });
    }
    const { session, challenge } = context;
    const publicContext = {
      contextId: context.contextId,
      clientId: context.clientId,
      expiresAt: context.expiresAt,
      status: context.status,
      nextAction: context.nextAction,
    };
    if (method === "GET" && !action) return json(response, 200, publicContext);
    if (method !== "POST")
      return json(response, 405, { code: "METHOD_NOT_ALLOWED" });

    if (
      context.nextAction === "ENTER_PASSWORD" &&
      (action.startsWith("registration/") || action.startsWith("passkey/"))
    ) {
      const input = await body(request);
      if (!passkeysEnabled) {
        if (action === "registration/identify" && input.email === account.email)
          return json(response, 200, { nextAction: "ENTER_PASSWORD" });
        return json(response, 403, { code: "METHOD_NOT_ALLOWED" });
      }
      const result = action.startsWith("registration/")
        ? await accounts.registration(
            context,
            action.slice("registration/".length),
            input,
          )
        : await accounts.passkey(
            context,
            action.slice("passkey/".length),
            input,
          );
      if (result.principal) {
        context.principal = result.principal;
        context.status = "AUTHENTICATED";
        context.nextAction = "ISSUE_SESSION";
      }
      return json(response, result.status, result.body);
    }

    switch (action) {
      case "password": {
        if (context.nextAction !== "ENTER_PASSWORD") break;
        const input = await body(request);
        if (typeof input.username !== "string") break;
        const principal = accounts.passwordPrincipal(
          input.username,
          input.password,
        );
        if (!principal) {
          return json(response, 401, { code: "INVALID_CREDENTIALS" });
        }
        context.principal = principal;
        context.passwordEmail = input.username.trim().toLowerCase();
        context.nextAction = "SELECT_MFA_METHOD";
        return json(response, 200, {
          ...publicContext,
          nextAction: context.nextAction,
        });
      }
      case "mfa/challenges": {
        if (
          context.nextAction !== "SELECT_MFA_METHOD" &&
          context.nextAction !== "ENTER_OTP"
        )
          break;
        const { method } = await body(request);
        if (method !== "EMAIL_OTP") break;
        context.nextAction = "ENTER_OTP";
        context.challengeSequence = (context.challengeSequence ?? 0) + 1;
        context.challenge = {
          id: randomUUID(),
          code: String(
            Number(account.code) + context.challengeSequence - 1,
          ).padStart(6, "0"),
          expiresAt: Math.min(
            Date.now() + 60_000,
            Date.parse(context.expiresAt),
          ),
        };
        return json(response, 201, {
          challengeId: context.challenge.id,
          method,
          maskedDestination: "pla*******@example.test",
          expiresAt: new Date(context.challenge.expiresAt).toISOString(),
        });
      }
      case "mfa/verifications": {
        if (context.nextAction !== "ENTER_OTP") break;
        const input = await body(request);
        if (!challenge || challenge.expiresAt <= Date.now())
          return json(response, 410, { code: "CHALLENGE_EXPIRED" });
        if (
          input.challengeId !== challenge.id ||
          input.code !== challenge.code
        ) {
          return json(response, 401, { code: "INVALID_OTP" });
        }
        context.status = "AUTHENTICATED";
        context.nextAction =
          input.offerPasskey === true &&
          passkeysEnabled &&
          context.passwordEmail &&
          accounts.canEnroll(context.passwordEmail)
            ? "OFFER_PASSKEY"
            : "ISSUE_SESSION";
        return json(response, 200, {
          ...publicContext,
          status: context.status,
          nextAction: context.nextAction,
        });
      }
      case "passkey/enrollment/options":
      case "passkey/enrollment/verify":
      case "passkey/enrollment/skip": {
        if (context.nextAction !== "OFFER_PASSKEY" || !context.passwordEmail)
          break;
        const operation =
          action === "passkey/enrollment/options"
            ? "options"
            : action === "passkey/enrollment/verify"
              ? "verify"
              : "skip";
        const input = await body(request);
        const result = await accounts.enrollPasskey(
          context,
          context.passwordEmail,
          operation,
          input,
        );
        if (result.status === 200 && operation !== "options") {
          if (operation === "verify") passkeyEnrollments++;
          context.nextAction = "ISSUE_SESSION";
          return json(response, 200, {
            ...publicContext,
            nextAction: context.nextAction,
          });
        }
        return json(response, result.status, result.body);
      }
      case "sessions": {
        if (typeof key !== "string") break;
        if (session?.key === key) {
          return json(response, 200, {
            sessionToken: session.token,
            tokenType: "Bearer",
            expiresIn: 900,
          });
        }
        if (context.nextAction !== "ISSUE_SESSION" || !context.principal) break;
        const token = await new SignJWT({
          name: context.principal.name,
          amr: context.principal.amr,
          token_use: "session",
        })
          .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
          .setIssuer(issuer)
          .setAudience(clientId)
          .setSubject(context.principal.subject)
          .setExpirationTime("15m")
          .sign(privateKey);
        sessionsIssued++;
        context.session = { key, token };
        context.status = "CONSUMED";
        context.nextAction = "COMPLETE";
        return json(response, 201, {
          sessionToken: token,
          tokenType: "Bearer",
          expiresIn: 900,
        });
      }
      case "cancel":
        if (
          context.status !== "ACTIVE" &&
          context.nextAction !== "OFFER_PASSKEY"
        )
          break;
        context.status = "CANCELLED";
        context.nextAction = "CANCELLED";
        response.writeHead(204).end();
        return;
    }
    return json(response, 409, { code: "INVALID_FIXTURE_TRANSITION" });
  });
  issuer = server.origin;

  return {
    ...server,
    completionCounts() {
      return { passkeyEnrollments, sessionsIssued };
    },
    expireMfaChallenges() {
      for (const context of contexts.values()) {
        if (context.challenge) context.challenge.expiresAt = Date.now() - 1;
      }
    },
    setNextContextLifetime(milliseconds: number) {
      nextContextLifetimeMs = milliseconds;
    },
    approve(origin: string) {
      parentOrigin = origin;
    },
    async authenticate(token: string | undefined) {
      if (!token) return null;
      try {
        const { payload } = await jwtVerify(token, publicKey, {
          issuer,
          audience: clientId,
          algorithms: ["RS256"],
          requiredClaims: ["exp", "sub"],
        });
        if (
          payload.token_use === "session" &&
          Array.isArray(payload.amr) &&
          ((payload.amr.includes("pwd") && payload.amr.includes("otp")) ||
            (payload.amr.includes("fido") && payload.amr.includes("uv"))) &&
          typeof payload.name === "string"
        )
          return { name: payload.name };
      } catch {
        // Missing, invalid, or expired cookies leave the test host signed out.
      }
      return null;
    },
  };
}
