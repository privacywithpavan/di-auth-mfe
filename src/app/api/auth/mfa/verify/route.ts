import { NextResponse } from "next/server";
import { z } from "zod";
import { contextStore } from "@/server/auth/context-store";
import { confirmGateway, issueSession } from "@/server/auth/session-issuance";
import { apiError, withContext } from "@/server/http";
import { iamClient } from "@/server/infrastructure/iam";
import { requireCsrf, SecurityError } from "@/server/security/request-security";

const schema = z
  .object({ contextId: z.uuid(), code: z.string().regex(/^\d{6}$/) })
  .strict();
export async function POST(request: Request) {
  try {
    await requireCsrf();
    const input = schema.parse(await request.json());
    const response = await withContext(
      input.contextId,
      ["OTP"],
      async (context) => {
        if (!context.challengeId)
          throw new SecurityError("CHALLENGE_REQUIRED", 409);
        const gateway = await iamClient.getContext(context.gatewayContextId);
        if (gateway.status === "CONSUMED")
          confirmGateway(context, gateway, "COMPLETE");
        else if (gateway.nextAction !== "ISSUE_SESSION") {
          const result = await iamClient.verifyMfa(
            context.gatewayContextId,
            { challengeId: context.challengeId, code: input.code },
            `verify:${context.id}`,
          );
          confirmGateway(context, result, "ISSUE_SESSION");
        } else confirmGateway(context, gateway, "ISSUE_SESSION");
        context.confirmedFactors = ["pwd", "otp"];
        await contextStore.set(context);
        await issueSession(context);
        return NextResponse.json({
          nextAction: { type: "COMPLETE" },
          authenticated: true,
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
          message: "Enter the six-digit verification code.",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
