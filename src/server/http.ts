import "server-only";
import { NextResponse } from "next/server";
import {
  type AuthContext,
  type ContextStage,
  contextStore,
} from "@/server/auth/context-store";
import { getClientConfiguration } from "@/server/clients/configuration";
import { isIamClientError } from "@/server/infrastructure/iam-client";
import {
  requireBrowserBinding,
  SecurityError,
} from "@/server/security/request-security";

export function apiError(error: unknown): NextResponse {
  if (error instanceof SyntaxError)
    return NextResponse.json(
      { code: "INVALID_REQUEST", message: "The request body is invalid." },
      { status: 400 },
    );
  if (error instanceof SecurityError) {
    return NextResponse.json(
      { code: error.code, message: "The request could not be validated." },
      { status: error.status },
    );
  }
  if (isIamClientError(error)) {
    const publicMessage: Record<string, string> = {
      INVALID_CREDENTIALS: "The email or password is incorrect.",
      INVALID_OTP: "That verification code is incorrect.",
      CHALLENGE_EXPIRED: "That verification code has expired.",
      CHALLENGE_REPLAYED: "That verification code has already been used.",
      CONTEXT_EXPIRED: "This sign-in attempt has expired. Start again.",
      EMAIL_REQUIRED: "Use an email address to create an account.",
      PROFILE_INVALID: "Enter your first and last name.",
      PASSWORD_POLICY:
        "Use at least 8 characters including an uppercase letter, lowercase letter, and number.",
      PHONE_INVALID: "Enter a valid mobile phone number.",
      TERMS_REQUIRED: "Accept the terms to create your account.",
      ACCOUNT_EXISTS: "An account already exists. Start again to sign in.",
      CODE_EXPIRED: "This code has expired. Start again to request a new code.",
      RESEND_TOO_SOON: "Please wait before requesting another code.",
      PASSKEY_INVALID: "Passkey verification failed. Please try again.",
      PASSKEY_CHALLENGE_INVALID:
        "This passkey request has expired or was already used. Please try again.",
    };
    return NextResponse.json(
      {
        code: error.code,
        message:
          publicMessage[error.code] ?? "Authentication could not continue.",
      },
      { status: error.status >= 500 ? 502 : error.status },
    );
  }
  console.error("Unhandled BFF error");
  return NextResponse.json(
    {
      code: "INTERNAL_ERROR",
      message: "Authentication is temporarily unavailable.",
    },
    { status: 500 },
  );
}

export async function requireContext(
  id: string,
  allowed: ContextStage[],
): Promise<AuthContext> {
  const context = await contextStore.get(id);
  if (!context) throw new SecurityError("CONTEXT_EXPIRED", 410);
  await requireBrowserBinding(context.browserBindingHash);
  const client = await getClientConfiguration(context.clientId);
  if (
    client.parentOrigin !== context.parentOrigin ||
    client.policy.version !== context.policy.version
  )
    throw new SecurityError("CLIENT_CONFIGURATION_CHANGED", 409);
  if (!allowed.includes(context.stage))
    throw new SecurityError("INVALID_CONTEXT_STATE", 409);
  return context;
}

export async function withContext<T>(
  id: string,
  allowed: ContextStage[],
  work: (context: AuthContext) => Promise<T>,
): Promise<T> {
  return contextStore.withLock(id, async () =>
    work(await requireContext(id, allowed)),
  );
}
