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
      ["OTP", "PASSKEY_OFFER"],
      async (context) => {
        if (context.stage === "PASSKEY_OFFER")
          return NextResponse.json({ nextAction: { type: "OFFER_PASSKEY" } });
        if (!context.challengeId)
          throw new SecurityError("CHALLENGE_REQUIRED", 409);
        const gateway = await iamClient.getContext(context.gatewayContextId);
        const canOfferPasskey = context.policy.methods.includes("PASSKEY");
        const result =
          gateway.nextAction === "ENTER_OTP"
            ? await iamClient.verifyMfa(
                context.gatewayContextId,
                {
                  challengeId: context.challengeId,
                  code: input.code,
                  ...(canOfferPasskey ? { offerPasskey: true } : {}),
                },
                `verify:${context.id}`,
              )
            : gateway;
        context.confirmedFactors = ["pwd", "otp"];
        if (canOfferPasskey && result.nextAction === "OFFER_PASSKEY") {
          confirmGateway(context, result, "OFFER_PASSKEY");
          context.stage = "PASSKEY_OFFER";
          await contextStore.set(context);
          return NextResponse.json({ nextAction: { type: "OFFER_PASSKEY" } });
        }
        confirmGateway(
          context,
          result,
          result.status === "CONSUMED" ? "COMPLETE" : "ISSUE_SESSION",
        );
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
