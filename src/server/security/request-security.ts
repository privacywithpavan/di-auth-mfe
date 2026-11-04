import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { config } from "@/server/config";

export const BROWSER_COOKIE = "iam_poc_browser";
export const CSRF_COOKIE = "iam_poc_csrf";

const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  secure: config.secureCookies,
};

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function bindingHash(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url");
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function assertTrustedOrigin(): Promise<void> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin !== config.identityOrigin)
    throw new SecurityError("UNTRUSTED_ORIGIN", 403);
}

export async function requireCsrf(): Promise<void> {
  await assertTrustedOrigin();
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(CSRF_COOKIE)?.value;
  const headerValue = (await headers()).get("x-csrf-token");
  if (!cookieValue || !headerValue || !safeEqual(cookieValue, headerValue)) {
    throw new SecurityError("CSRF_VALIDATION_FAILED", 403);
  }
}

export async function establishBrowser(): Promise<{
  secret: string;
  csrf: string;
}> {
  const cookieStore = await cookies();
  const secret = cookieStore.get(BROWSER_COOKIE)?.value ?? randomToken();
  const csrf = cookieStore.get(CSRF_COOKIE)?.value ?? randomToken();
  cookieStore.set(BROWSER_COOKIE, secret, {
    ...cookieOptions,
    httpOnly: true,
    maxAge: 600,
  });
  cookieStore.set(CSRF_COOKIE, csrf, {
    ...cookieOptions,
    httpOnly: false,
    maxAge: 600,
  });
  return { secret, csrf };
}

export async function browserCredentials(): Promise<{
  secret: string;
  csrf: string;
}> {
  await requireCsrf();
  const cookieStore = await cookies();
  const secret = cookieStore.get(BROWSER_COOKIE)?.value;
  const csrf = cookieStore.get(CSRF_COOKIE)?.value;
  if (!secret || !csrf)
    throw new SecurityError("BROWSER_BINDING_MISMATCH", 403);
  return { secret, csrf };
}

export async function requireBrowserBinding(
  expectedHash: string,
): Promise<void> {
  const secret = (await cookies()).get(BROWSER_COOKIE)?.value;
  if (!secret || !safeEqual(bindingHash(secret), expectedHash)) {
    throw new SecurityError("BROWSER_BINDING_MISMATCH", 403);
  }
}

export class SecurityError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}
