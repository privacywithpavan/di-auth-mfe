import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmGateway, issueSession } from "@/server/auth/session-issuance";
import { apiError, withContext } from "@/server/http";
import { iamClient } from "@/server/infrastructure/iam";
import { requireCsrf, SecurityError } from "@/server/security/request-security";

const contextSchema = z.object({ contextId: z.uuid() }).strict();
const verificationSchema = contextSchema.extend({
  credential: z.record(z.string(), z.unknown()),
});
type Action = "options" | "verify" | "skip";

export async function handlePasskeyEnrollment(
  request: Request,
  action: Action,
) {
  try {
    await requireCsrf();
    const body = await request.json();
    const { contextId, ...input } =
      action === "verify"
        ? verificationSchema.parse(body)
        : contextSchema.parse(body);
    return await withContext(contextId, ["PASSKEY_OFFER"], async (context) => {
      if (!context.policy.methods.includes("PASSKEY"))
        throw new SecurityError("METHOD_NOT_ALLOWED", 403);
      const gateway = await iamClient.getContext(context.gatewayContextId);
      if (action === "options") {
        confirmGateway(context, gateway, "OFFER_PASSKEY");
        const { publicKey } = await iamClient.enrollPasskey(
          context.gatewayContextId,
          action,
          {},
          randomUUID(),
        );
        if (!publicKey) throw new SecurityError("PASSKEY_OPTIONS_INVALID", 502);
        return NextResponse.json({ publicKey });
      }

      if (gateway.nextAction === "OFFER_PASSKEY") {
        confirmGateway(context, gateway, "OFFER_PASSKEY");
        const result = await iamClient.enrollPasskey(
          context.gatewayContextId,
          action,
          input,
          randomUUID(),
        );
        confirmGateway(context, result, "ISSUE_SESSION");
      }
      // Recover session delivery if IAM already accepted the enrollment choice.
      await issueSession(context);
      return NextResponse.json({
        nextAction: { type: "COMPLETE" },
        authenticated: true,
      });
    });
  } catch (error) {
    return apiError(
      error instanceof z.ZodError
        ? new SecurityError("INVALID_REQUEST", 400)
        : error,
    );
  }
}
