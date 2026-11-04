import { connection, NextResponse } from "next/server";
import { getClientConfiguration } from "@/server/clients/configuration";
import { apiError } from "@/server/http";
import { establishBrowser } from "@/server/security/request-security";

// Only establishes host-only browser/CSRF cookies. Never starts an IAM context.
export async function GET(request: Request) {
  // Browser credentials must only be established for an incoming request.
  await connection();
  try {
    const client = await getClientConfiguration(
      new URL(request.url).searchParams.get("clientId") ?? "",
    );
    const { csrf } = await establishBrowser();
    return NextResponse.json(
      { csrfToken: csrf, parentOrigin: client.parentOrigin },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
