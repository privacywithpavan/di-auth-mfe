import "server-only";

const baselineHeaders = {
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

interface SecurityHeaderOptions {
  authenticationRoute?: boolean;
  parentOrigin?: string;
}

export function applySecurityHeaders(
  headers: Headers,
  { authenticationRoute = false, parentOrigin }: SecurityHeaderOptions = {},
) {
  for (const [name, value] of Object.entries(baselineHeaders))
    headers.set(name, value);

  if (authenticationRoute) {
    headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${parentOrigin ?? "'none'"}`,
    );
    headers.set("Cache-Control", "no-store");
  }
}
