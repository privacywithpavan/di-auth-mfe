import { createRemoteJWKSet, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";
import { getClientConfiguration } from "@/server/clients/configuration";
import { config } from "@/server/config";

let jwks: ReturnType<typeof createRemoteJWKSet>;

function signedOut() {
  return NextResponse.json(
    { authenticated: false },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  // Session cookies must be inspected only for an incoming request.
  await connection();
  try {
    const token = (await cookies()).get(config.sessionCookieName)?.value;
    if (!token) return signedOut();
    const client = await getClientConfiguration(
      new URL(request.url).searchParams.get("clientId") ?? "",
    );
    jwks ??= createRemoteJWKSet(new URL(config.jwksUrl));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.iamIssuer,
      audience: client.clientId,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "sub"],
    });
    const methods = Array.isArray(payload.amr) ? payload.amr : [];
    if (
      payload.token_use !== "session" ||
      !(
        (methods.includes("pwd") && methods.includes("otp")) ||
        (methods.includes("fido") &&
          (methods.includes("uv") || methods.includes("otp")))
      )
    )
      return signedOut();
    return NextResponse.json(
      {
        authenticated: true,
        user: { subject: payload.sub, name: payload.name },
        amr: payload.amr,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return signedOut();
  }
}
