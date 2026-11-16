import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type WebAuthnCredential,
} from "@simplewebauthn/server";

export type Principal = { subject: string; name: string; amr: string[] };

type Profile = {
  subject: string;
  name: string;
  userId: Uint8Array<ArrayBuffer>;
  phone: string;
} & (
  | { method: "PASSKEY" }
  | { method: "PASSWORD"; salt: Buffer; hash: Buffer }
);

type RegisteredAccount = {
  subject: string;
  name: string;
  userId: string;
  password?: { salt: Buffer; hash: Buffer };
  credential?: WebAuthnCredential;
};

type Enrollment = {
  email: string;
  stage: "VERIFY_EMAIL" | "PROFILE" | "PASSKEY" | "PHONE" | "CONSENT";
  profile?: Profile;
  credential?: WebAuthnCredential;
  challenge?: string;
};

export type AccountFlow = {
  enrollment?: Enrollment;
  assertion?: { challenge: string; email?: string };
  passkeyEnrollment?: { challenge: string; expiresAt: number };
};

const invalidTransition = {
  status: 409,
  body: { code: "INVALID_FIXTURE_TRANSITION" },
};
const invalidPasskey = {
  status: 401,
  body: { code: "PASSKEY_INVALID" },
};
const next = (type: string) => ({ status: 200, body: { nextAction: type } });

export function createAccountFlows({
  mfeOrigin,
  parentOrigin,
  demoAccounts,
  code,
}: {
  mfeOrigin: string;
  parentOrigin: () => string;
  demoAccounts: { email: string; name: string; password: string }[];
  code: string;
}) {
  const rpID = new URL(mfeOrigin).hostname;
  const accounts = new Map<string, RegisteredAccount>();
  const passkeyOwners = new Map<string, string>();
  for (const demo of demoAccounts) {
    const salt = randomBytes(16);
    accounts.set(demo.email, {
      subject: randomUUID(),
      name: demo.name,
      userId: randomBytes(32).toString("base64url"),
      password: { salt, hash: scryptSync(demo.password, salt, 32) },
    });
  }

  function canEnroll(email: string) {
    const account = accounts.get(email);
    return Boolean(account?.password && !account.credential);
  }

  function requestRegistration(
    email: string,
    name: string,
    userID: Uint8Array<ArrayBuffer>,
  ) {
    return generateRegistrationOptions({
      rpName: "DI Auth Playwright",
      rpID,
      userID,
      userName: email,
      userDisplayName: name,
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      attestationType: "none",
    });
  }

  async function verifiedCredential(
    input: Record<string, unknown>,
    challenge: string,
  ) {
    try {
      const response = input.credential as RegistrationResponseJSON;
      const data = JSON.parse(
        Buffer.from(response.response.clientDataJSON, "base64url").toString(
          "utf8",
        ),
      );
      if (data.crossOrigin !== true || data.topOrigin !== parentOrigin())
        return;
      const result = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: mfeOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      return result.verified ? result.registrationInfo?.credential : undefined;
    } catch {
      return;
    }
  }

  async function enrollPasskey(
    flow: AccountFlow,
    email: string,
    action: "options" | "verify" | "skip",
    input: Record<string, unknown>,
  ) {
    if (action === "skip") {
      flow.passkeyEnrollment = undefined;
      return next("ISSUE_SESSION");
    }
    const account = accounts.get(email);
    if (!account?.password || account.credential) return invalidTransition;
    if (action === "options") {
      const publicKey = await requestRegistration(
        email,
        account.name,
        new Uint8Array(Buffer.from(account.userId, "base64url")),
      );
      flow.passkeyEnrollment = {
        challenge: publicKey.challenge,
        expiresAt: Date.now() + 120_000,
      };
      return { status: 200, body: { publicKey } };
    }
    const pending = flow.passkeyEnrollment;
    flow.passkeyEnrollment = undefined;
    if (!pending || pending.expiresAt <= Date.now())
      return { status: 409, body: { code: "PASSKEY_CHALLENGE_INVALID" } };
    const credential = await verifiedCredential(input, pending.challenge);
    if (!credential || passkeyOwners.has(credential.id) || account.credential)
      return invalidPasskey;
    account.credential = credential;
    passkeyOwners.set(credential.id, email);
    return next("ISSUE_SESSION");
  }

  function passwordPrincipal(
    email: unknown,
    password: unknown,
  ): Principal | undefined {
    if (typeof email !== "string" || typeof password !== "string") return;
    const user = accounts.get(email.trim().toLowerCase());
    if (
      user?.password &&
      timingSafeEqual(
        scryptSync(password, user.password.salt, user.password.hash.length),
        user.password.hash,
      )
    )
      return { subject: user.subject, name: user.name, amr: ["pwd", "otp"] };
  }

  async function registration(
    flow: AccountFlow,
    action: string,
    input: Record<string, unknown>,
  ): Promise<{ status: number; body: object; principal?: Principal }> {
    const pending = flow.enrollment;
    if (action === "identify") {
      if (typeof input.email !== "string") return invalidTransition;
      const email = input.email.trim().toLowerCase();
      const existing = accounts.get(email);
      if (existing) {
        const nextAction = existing.password
          ? "ENTER_PASSWORD"
          : "ENTER_PASSKEY";
        return {
          status: 200,
          body: { nextAction, passkeyAvailable: Boolean(existing.credential) },
        };
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalidTransition;
      flow.enrollment = { email, stage: "VERIFY_EMAIL" };
      return next("VERIFY_EMAIL");
    }
    if (!pending) return invalidTransition;
    switch (action) {
      case "verify-email":
        if (pending.stage !== "VERIFY_EMAIL") break;
        if (input.code !== code)
          return { status: 401, body: { code: "INVALID_OTP" } };
        pending.stage = "PROFILE";
        return next("PROFILE");
      case "resend":
        if (pending.stage === "VERIFY_EMAIL" || pending.stage === "PHONE")
          return next(pending.stage);
        break;
      case "profile": {
        if (pending.stage !== "PROFILE" && pending.stage !== "PASSKEY") break;
        if (
          typeof input.firstName !== "string" ||
          !input.firstName.trim() ||
          typeof input.lastName !== "string" ||
          !input.lastName.trim() ||
          typeof input.phone !== "string"
        )
          break;
        const profile = {
          subject: randomUUID(),
          name: `${input.firstName.trim()} ${input.lastName.trim()}`,
          phone: input.phone,
          userId: new Uint8Array(randomBytes(32)),
        };
        if (input.signInMethod === "PASSKEY") {
          pending.profile = { ...profile, method: "PASSKEY" };
          pending.stage = "PASSKEY";
          pending.challenge = undefined;
          pending.credential = undefined;
        } else if (
          input.signInMethod === "PASSWORD" &&
          typeof input.password === "string" &&
          input.password.length >= 8
        ) {
          const salt = randomBytes(16);
          pending.profile = {
            ...profile,
            method: "PASSWORD",
            salt,
            hash: scryptSync(input.password, salt, 32),
          };
          pending.stage = profile.phone ? "PHONE" : "CONSENT";
        } else break;
        return next(pending.stage);
      }
      case "passkey-options": {
        const profile = pending.profile;
        if (pending.stage !== "PASSKEY" || profile?.method !== "PASSKEY") break;
        const publicKey = await requestRegistration(
          pending.email,
          profile.name,
          profile.userId,
        );
        pending.challenge = publicKey.challenge;
        return { status: 200, body: { publicKey } };
      }
      case "passkey-verify": {
        const profile = pending.profile;
        const challenge = pending.challenge;
        if (
          pending.stage !== "PASSKEY" ||
          profile?.method !== "PASSKEY" ||
          !challenge
        )
          break;
        pending.challenge = undefined;
        const credential = await verifiedCredential(input, challenge);
        if (!credential) return invalidPasskey;
        pending.credential = credential;
        pending.stage = profile.phone ? "PHONE" : "CONSENT";
        return next(pending.stage);
      }
      case "verify-phone":
      case "skip-phone":
        if (pending.stage !== "PHONE") break;
        if (action === "verify-phone" && input.code !== code)
          return { status: 401, body: { code: "INVALID_OTP" } };
        pending.stage = "CONSENT";
        return next("CONSENT");
      case "complete": {
        const profile = pending.profile;
        if (
          pending.stage !== "CONSENT" ||
          !profile ||
          input.termsAccepted !== true ||
          accounts.has(pending.email)
        )
          break;
        const identity = {
          subject: profile.subject,
          name: profile.name,
          userId: Buffer.from(profile.userId).toString("base64url"),
        };
        if (profile.method === "PASSKEY") {
          if (!pending.credential || passkeyOwners.has(pending.credential.id))
            return invalidPasskey;
          accounts.set(pending.email, {
            ...identity,
            credential: pending.credential,
          });
          passkeyOwners.set(pending.credential.id, pending.email);
        } else {
          accounts.set(pending.email, {
            ...identity,
            password: { salt: profile.salt, hash: profile.hash },
          });
        }
        flow.enrollment = undefined;
        return {
          ...next("COMPLETE"),
          principal: {
            subject: profile.subject,
            name: profile.name,
            amr: profile.method === "PASSKEY" ? ["fido", "uv"] : ["pwd", "otp"],
          },
        };
      }
    }
    return invalidTransition;
  }

  async function passkey(
    flow: AccountFlow,
    action: string,
    input: Record<string, unknown>,
  ): Promise<{ status: number; body: object; principal?: Principal }> {
    if (action === "options") {
      const email =
        typeof input.email === "string"
          ? input.email.trim().toLowerCase()
          : undefined;
      const owner = email ? accounts.get(email) : undefined;
      if (input.conditional !== true && !owner?.credential)
        return invalidPasskey;
      const publicKey = await generateAuthenticationOptions({
        rpID,
        userVerification: "required",
        allowCredentials: owner?.credential
          ? [{ id: owner.credential.id }]
          : undefined,
      });
      flow.assertion = { challenge: publicKey.challenge, email };
      return { status: 200, body: { publicKey } };
    }
    if (action !== "verify" || !flow.assertion) return invalidTransition;
    const pending = flow.assertion;
    flow.assertion = undefined;
    try {
      const response = input.credential as AuthenticationResponseJSON;
      const email = passkeyOwners.get(response.id);
      const owner = email ? accounts.get(email) : undefined;
      if (
        !owner?.credential ||
        (pending.email && pending.email !== email) ||
        (response.response.userHandle &&
          response.response.userHandle !== owner.userId)
      )
        return invalidPasskey;
      const result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: mfeOrigin,
        expectedTopOrigin: parentOrigin(),
        expectedRPID: rpID,
        credential: owner.credential,
        requireUserVerification: true,
      });
      if (!result.verified) return invalidPasskey;
      owner.credential.counter = result.authenticationInfo.newCounter;
      return {
        ...next("ISSUE_SESSION"),
        principal: {
          subject: owner.subject,
          name: owner.name,
          amr: ["fido", "uv"],
        },
      };
    } catch {
      return invalidPasskey;
    }
  }

  return { canEnroll, enrollPasskey, passwordPrincipal, registration, passkey };
}
