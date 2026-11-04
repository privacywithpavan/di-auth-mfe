import { type NextRequest, NextResponse } from "next/server";
import { getClientConfiguration } from "@/server/clients/configuration";
import { applySecurityHeaders } from "@/server/security/headers";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;
  let parentOrigin: string | undefined;
  if (pathname === "/") {
    try {
      parentOrigin = (
        await getClientConfiguration(
          request.nextUrl.searchParams.get("clientId") ?? "",
        )
      ).parentOrigin;
    } catch {
      /* Unknown, disabled or unavailable configuration must never broaden framing. */
    }
  }
  applySecurityHeaders(response.headers, {
    authenticationRoute:
      pathname === "/" || pathname === "/api" || pathname.startsWith("/api/"),
    parentOrigin,
  });
  return response;
}

// Baseline headers also cover assets. Only authentication responses receive
// framing/no-store headers; assets never trigger client configuration lookups.
export const config = { matcher: "/:path*" };
