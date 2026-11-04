import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { contextStore } from "@/server/auth/context-store";
import {
  clientIdSchema,
  getClientConfiguration,
  stateSchema,
} from "@/server/clients/configuration";
import { apiError } from "@/server/http";
import { iamClient } from "@/server/infrastructure/iam";
import {
  bindingHash,
  browserCredentials,
  SecurityError,
} from "@/server/security/request-security";

const schema = z
  .object({ clientId: clientIdSchema, state: stateSchema })
  .strict();
export async function POST(request: Request) {
  try {
    const { secret, csrf } = await browserCredentials();
    const input = schema.parse(await request.json());
    const client = await getClientConfiguration(input.clientId);
    const now = Date.now();
    const expiresAt = now + client.policy.contextTtlSeconds * 1000;
    const browserBindingHash = bindingHash(secret);
    const replayKey = bindingHash(
      JSON.stringify([browserBindingHash, input.clientId, input.state]),
    );
    if (!(await contextStore.consumeState(replayKey, expiresAt)))
      throw new SecurityError("STATE_ALREADY_USED", 409);
    const contextId = randomUUID();
    const gateway = await iamClient.createContext(
      client.clientId,
      `initialize:${contextId}`,
    );
    if (
      gateway.clientId !== client.clientId ||
      gateway.nextAction !== "ENTER_PASSWORD" ||
      !z.uuid().safeParse(gateway.contextId).success ||
      !(Date.parse(gateway.expiresAt) > now)
    )
      throw new SecurityError("GATEWAY_CONFIRMATION_INVALID", 502);
    await contextStore.set({
      id: contextId,
      gatewayContextId: gateway.contextId,
      clientId: client.clientId,
      state: input.state,
      parentOrigin: client.parentOrigin,
      policy: client.policy,
      confirmedFactors: [],
      browserBindingHash,
      stage: "PASSWORD",
      createdAt: now,
      expiresAt: Math.min(expiresAt, Date.parse(gateway.expiresAt)),
    });
    return NextResponse.json(
      {
        contextId,
        csrfToken: csrf,
        state: input.state,
        parentOrigin: client.parentOrigin,
        methods: client.policy.methods,
        mfaMethods: client.policy.mfaMethods,
        registrationEnabled: client.policy.registrationEnabled,
        nextAction: { type: "ENTER_PASSWORD" },
        expiresAt: new Date(
          Math.min(expiresAt, Date.parse(gateway.expiresAt)),
        ).toISOString(),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json(
        {
          code: "INVALID_REQUEST",
          message: "A registered clientId and valid state are required.",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
