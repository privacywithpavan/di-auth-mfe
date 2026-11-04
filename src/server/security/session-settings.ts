export type Environment = Record<string, string | undefined>;

export function configuredOrigin(value: string, label: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== value ||
    url.username ||
    url.password ||
    url.hostname.includes("*")
  )
    throw new Error(`${label} must be an exact HTTP(S) origin without a path`);
  return url.origin;
}

export function sessionSettings(env: Environment = process.env) {
  const production = env.NODE_ENV === "production";
  const secure = production || env.COOKIE_SECURE === "true";
  if (production && env.COOKIE_SECURE === "false")
    throw new Error("Production cookies must use Secure");
  const name = env.SESSION_COOKIE_NAME || "iam_poc_session";
  const domain =
    env.SESSION_COOKIE_DOMAIN?.trim().replace(/^\./, "").toLowerCase() ||
    undefined;
  if (
    domain &&
    (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(domain) ||
      domain === "localhost")
  )
    throw new Error(
      "SESSION_COOKIE_DOMAIN must be a DNS parent domain, without a scheme, port or path",
    );
  if (domain && (name.startsWith("__Host-") || name.startsWith("__Host-Http-")))
    throw new Error("A shared domain cookie cannot use a __Host- prefix");
  if (name.startsWith("__Secure-") && !secure)
    throw new Error("__Secure- cookies require Secure");
  const sameSite = env.SESSION_COOKIE_SAME_SITE || "lax";
  if (sameSite !== "lax" && sameSite !== "strict" && sameSite !== "none")
    throw new Error("SESSION_COOKIE_SAME_SITE must be lax, strict or none");
  if (sameSite === "none" && !secure)
    throw new Error("SameSite=None requires Secure");
  for (const [label, value] of Object.entries({
    IDENTITY_ORIGIN: env.IDENTITY_ORIGIN,
    CHATBOT_ORIGIN: env.CHATBOT_ORIGIN,
  })) {
    if (!value) continue;
    const origin = configuredOrigin(value, label);
    const url = new URL(origin);
    if (production && url.protocol !== "https:")
      throw new Error(`${label} must use HTTPS in production`);
    if (
      domain &&
      url.hostname !== domain &&
      !url.hostname.endsWith(`.${domain}`)
    )
      throw new Error(`${label} is outside SESSION_COOKIE_DOMAIN`);
  }
  return {
    name,
    options: {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      ...(domain ? { domain } : {}),
    } as const,
  };
}
