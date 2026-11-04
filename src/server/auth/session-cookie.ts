import "server-only";
import { cookies } from "next/headers";
import { config } from "@/server/config";

export function sessionCookieOptions(maxAge: number) {
  return { ...config.sessionCookieOptions, maxAge };
}

export async function setSessionCookie(value: string, maxAge: number) {
  (await cookies()).set(
    config.sessionCookieName,
    value,
    sessionCookieOptions(maxAge),
  );
}

export async function clearSessionCookie() {
  await setSessionCookie("", 0);
}
