import { NextResponse } from "next/server";
import { z } from "zod";
import { contextStore } from "@/server/auth/context-store";
import { confirmGateway } from "@/server/auth/session-issuance";
import { apiError, withContext } from "@/server/http";
import { iamClient } from "@/server/infrastructure/iam";
import { requireCsrf, SecurityError } from "@/server/security/request-security";

const schema = z
  .object({
    contextId: z.uuid(),
    username: z.string().trim().min(3).max(254),
    password: z.string().min(1).max(256),
  })
  .strict();
export async function POST(request: Request) {
  try {
    await requireCsrf();
    const input = schema.parse(await request.json());
    const response = await withContext(
      input.contextId,
      ["PASSWORD", "MFA_METHOD"],
      async (context) => {
        if (!context.policy.methods.includes("PASSWORD"))
          throw new SecurityError("METHOD_NOT_ALLOWED", 403);
        if (context.stage === "PASSWORD") {
          const result = await iamClient.verifyPassword(
            context.gatewayContextId,
            { username: input.username, password: input.password },
            `password:${context.id}`,
          );
          confirmGateway(context, result, "SELECT_MFA_METHOD");
          context.confirmedFactors = ["pwd"];
          context.stage = "MFA_METHOD";
          await contextStore.set(context);
        }
        const method = context.policy.mfaMethods[0];
        const challenge = await iamClient.createMfaChallenge(
          context.gatewayContextId,
          method,
          `challenge:${context.id}`,
        );
        context.stage = "OTP";
        context.challengeId = challenge.challengeId;
        context.method = method;
        await contextStore.set(context);
        return NextResponse.json({
          nextAction: { type: "ENTER_OTP" },
          method,
          maskedDestination: challenge.maskedDestination,
          expiresAt: challenge.expiresAt,
        });
      },
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          code: "INVALID_REQUEST",
          message: "Enter a valid email and password.",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
