import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, withContext } from "@/server/http";
import { iamClient } from "@/server/infrastructure/iam";
import { requireCsrf, SecurityError } from "@/server/security/request-security";

export async function POST(request: Request) {
  try {
    await requireCsrf();
    const { contextId, ...input } = z
      .object({
        contextId: z.uuid(),
        conditional: z.boolean().default(false),
        email: z.string().max(254).optional(),
        credential: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await request.json());
    const response = await withContext(
      contextId,
      ["PASSWORD"],
      async (context) => {
        if (!context.policy.methods.includes("PASSKEY"))
          throw new SecurityError("METHOD_NOT_ALLOWED", 403);
        const result = await iamClient.passkey(
          context.gatewayContextId,
          "options",
          input,
          randomUUID(),
        );
        return NextResponse.json(result);
      },
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { message: "The passkey request is invalid." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
