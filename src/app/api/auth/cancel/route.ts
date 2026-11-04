import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { contextStore } from "@/server/auth/context-store";
import { apiError, withContext } from "@/server/http";
import { iamClient } from "@/server/infrastructure/iam";
import { requireCsrf } from "@/server/security/request-security";

const schema = z.object({ contextId: z.uuid() });

export async function POST(request: Request) {
  try {
    await requireCsrf();
    const input = schema.parse(await request.json());
    const response = await withContext(
      input.contextId,
      [
        "PASSWORD",
        "MFA_METHOD",
        "OTP",
        "REG_EMAIL",
        "REG_PROFILE",
        "REG_PASSKEY",
        "REG_PHONE",
        "REG_CONSENT",
      ],
      async (context) => {
        await iamClient.cancelContext(context.gatewayContextId, randomUUID());
        context.stage = "CANCELLED";
        await contextStore.set(context);
        return NextResponse.json({ cancelled: true });
      },
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          code: "INVALID_REQUEST",
          message: "The authentication request is invalid.",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
