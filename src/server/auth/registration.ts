import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { type ContextStage, contextStore } from "@/server/auth/context-store";
import { issueSession } from "@/server/auth/session-issuance";
import { apiError, withContext } from "@/server/http";
import { iamClient } from "@/server/infrastructure/iam";
import { requireCsrf, SecurityError } from "@/server/security/request-security";

interface RegistrationOperation {
  allowedStages: ContextStage[];
  allowedFields: string[];
}

const operations = {
  identify: { allowedStages: ["PASSWORD"], allowedFields: ["email"] },
  "verify-email": { allowedStages: ["REG_EMAIL"], allowedFields: ["code"] },
  resend: { allowedStages: ["REG_EMAIL", "REG_PHONE"], allowedFields: [] },
  profile: {
    allowedStages: ["REG_PROFILE", "REG_PASSKEY"],
    allowedFields: [
      "firstName",
      "lastName",
      "phone",
      "password",
      "signInMethod",
    ],
  },
  "passkey-options": { allowedStages: ["REG_PASSKEY"], allowedFields: [] },
  "passkey-verify": {
    allowedStages: ["REG_PASSKEY"],
    allowedFields: ["credential"],
  },
  "verify-phone": { allowedStages: ["REG_PHONE"], allowedFields: ["code"] },
  "skip-phone": { allowedStages: ["REG_PHONE"], allowedFields: [] },
  complete: {
    allowedStages: ["REG_CONSENT"],
    allowedFields: ["termsAccepted", "marketing", "rewards", "locale"],
  },
} satisfies Record<string, RegistrationOperation>;

export type RegistrationAction = keyof typeof operations;

const requestSchema = z.object({ contextId: z.uuid() }).passthrough();
const nextStages = new Map<string, ContextStage>([
  ["VERIFY_EMAIL", "REG_EMAIL"],
  ["PROFILE", "REG_PROFILE"],
  ["PASSKEY", "REG_PASSKEY"],
  ["PHONE", "REG_PHONE"],
  ["CONSENT", "REG_CONSENT"],
]);

export async function handleRegistrationAction(
  request: Request,
  action: RegistrationAction,
) {
  try {
    await requireCsrf();
    const { contextId, ...input } = requestSchema.parse(await request.json());
    const operation: RegistrationOperation = operations[action];
    if (
      Object.keys(input).some((key) => !operation.allowedFields.includes(key))
    )
      throw new SecurityError("INVALID_REQUEST", 400);
    const response = await withContext(
      contextId,
      operation.allowedStages,
      async (context) => {
        // Identification also selects existing-user login when registration is disabled.
        if (action !== "identify" && !context.policy.registrationEnabled)
          throw new SecurityError("REGISTRATION_NOT_ALLOWED", 403);
        if (
          action === "profile" &&
          typeof input.signInMethod === "string" &&
          !context.policy.methods.some(
            (method) => method === input.signInMethod,
          )
        )
          throw new SecurityError("METHOD_NOT_ALLOWED", 403);
        const result = await iamClient.registration(
          context.gatewayContextId,
          action,
          input,
          randomUUID(),
        );
        const nextStage = result.nextAction
          ? nextStages.get(result.nextAction)
          : undefined;
        if (nextStage) context.stage = nextStage;
        if (action === "complete") await issueSession(context);
        await contextStore.set(context);
        return NextResponse.json(result);
      },
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          code: "INVALID_REQUEST",
          message: "The registration request is invalid.",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
