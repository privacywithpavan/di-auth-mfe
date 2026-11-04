import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { contextStore } from "@/server/auth/context-store";
import { apiError, withContext } from "@/server/http";
import { iamClient } from "@/server/infrastructure/iam";
import { requireCsrf, SecurityError } from "@/server/security/request-security";

const schema = z
  .object({ contextId: z.uuid(), method: z.enum(["EMAIL_OTP", "SMS_OTP"]) })
  .strict();
export async function POST(request: Request) {
  try {
    await requireCsrf();
    const input = schema.parse(await request.json());
    const response = await withContext(
      input.contextId,
      ["MFA_METHOD", "OTP"],
      async (context) => {
        if (!context.policy.mfaMethods.includes(input.method))
          throw new SecurityError("METHOD_NOT_ALLOWED", 403);
        const challenge = await iamClient.createMfaChallenge(
          context.gatewayContextId,
          input.method,
          randomUUID(),
        );
        context.stage = "OTP";
        context.challengeId = challenge.challengeId;
        context.method = input.method;
        await contextStore.set(context);
        return NextResponse.json(
          {
            nextAction: { type: "ENTER_OTP" },
            maskedDestination: challenge.maskedDestination,
            expiresAt: challenge.expiresAt,
          },
          { status: 201 },
        );
      },
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { code: "INVALID_REQUEST", message: "Choose a supported MFA method." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
