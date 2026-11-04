import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/server/auth/session-cookie";
import { apiError } from "@/server/http";
import { requireCsrf } from "@/server/security/request-security";

export async function POST() {
  try {
    await requireCsrf();
    await clearSessionCookie();
    return NextResponse.json(
      { authenticated: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
