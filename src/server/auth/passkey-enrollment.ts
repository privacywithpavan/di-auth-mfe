import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { contextStore } from "@/server/auth/context-store";
import { confirmGateway, issueSession } from "@/server/auth/session-issuance";
import { apiError, withContext } from "@/server/http";
import { iamClient } from "@/server/infrastructure/iam";
import {
  bindingHash,
  requireCsrf,
  SecurityError,
  safeEqual,
} from "@/server/security/request-security";

const contextSchema = z.object({ contextId: z.uuid() }).strict();
const choiceSchema = contextSchema.extend({
  completionId: z.uuid().optional(),
});
const verificationSchema = choiceSchema.extend({
  credential: z.record(z.string(), z.unknown()),
});
const recoverySchema = contextSchema.extend({ completionId: z.uuid() });
const recoveryWindowMs = 60_000;
type Action = "options" | "verify" | "skip";

export async function handlePasskeyEnrollment(
  request: Request,
  action: Action,
) {
  try {
    await requireCsrf();
    const body = await request.json();
    const { contextId, completionId, ...input } =
      action === "verify"
        ? verificationSchema.parse(body)
        : action === "skip"
          ? choiceSchema.parse(body)
          : { ...contextSchema.parse(body), completionId: undefined };
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

      let confirmed = gateway;
      if (gateway.nextAction === "OFFER_PASSKEY") {
        confirmGateway(context, gateway, "OFFER_PASSKEY");
        const keyHash = completionId ? bindingHash(completionId) : undefined;
        if (keyHash !== context.sessionCompletion?.keyHash) {
          context.sessionCompletion = keyHash
            ? {
                keyHash,
                expiresAt: Math.min(
                  context.expiresAt,
                  Date.now() + recoveryWindowMs,
                ),
              }
            : undefined;
          await contextStore.set(context);
        }
        confirmed = await iamClient.enrollPasskey(
          context.gatewayContextId,
          action,
          input,
          randomUUID(),
        );
        confirmGateway(context, confirmed, "ISSUE_SESSION");
      } else if (context.sessionCompletion) {
        throw new SecurityError("SESSION_COMPLETION_PENDING", 409);
      }
      await issueSession(context, { gateway: confirmed });
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

export async function recoverPasskeySession(request: Request) {
  try {
    await requireCsrf();
    const { contextId, completionId } = recoverySchema.parse(
      await request.json(),
    );
    return await withContext(
      contextId,
      ["PASSKEY_OFFER", "COMPLETED"],
      async (context) => {
        const completion = context.sessionCompletion;
        if (!completion && context.stage === "PASSKEY_OFFER")
          throw new SecurityError("SESSION_COMPLETION_NOT_READY", 409);
        if (
          !completion ||
          completion.expiresAt <= Date.now() ||
          !safeEqual(bindingHash(completionId), completion.keyHash)
        )
          throw new SecurityError("SESSION_COMPLETION_UNAVAILABLE", 409);
        const gateway = await iamClient.getContext(context.gatewayContextId);
        if (gateway.nextAction === "OFFER_PASSKEY")
          throw new SecurityError("SESSION_COMPLETION_NOT_READY", 409);
        await issueSession(context, { gateway, recovering: true });
        return NextResponse.json({
          nextAction: { type: "COMPLETE" },
          authenticated: true,
        });
      },
    );
  } catch (error) {
    return apiError(
      error instanceof z.ZodError
        ? new SecurityError("INVALID_REQUEST", 400)
        : error,
    );
  }
}
