import { createMachine } from "xstate";

type FlowEvent =
  | { type: "READY" }
  | { type: "IDENTIFIER_ACCEPTED" }
  | { type: "PASSKEY_VERIFIED" }
  | { type: "CHALLENGE_CREATED" }
  | { type: "BACK" }
  | { type: "VERIFYING" }
  | { type: "VERIFY_FAILED" }
  | { type: "VERIFIED" }
  | { type: "RESTART" };

export const flowMachine = createMachine({
  types: {} as { events: FlowEvent },
  id: "embedded-authentication",
  initial: "starting",
  states: {
    starting: { on: { READY: "identifier" } },
    identifier: {
      on: {
        IDENTIFIER_ACCEPTED: "password",
        PASSKEY_VERIFIED: "complete",
        RESTART: "starting",
      },
    },
    password: {
      on: { CHALLENGE_CREATED: "otp", BACK: "identifier", RESTART: "starting" },
    },
    otp: { on: { VERIFYING: "verifying", RESTART: "starting" } },
    verifying: {
      on: { VERIFIED: "complete", VERIFY_FAILED: "otp", RESTART: "starting" },
    },
    complete: { type: "final" },
  },
});
