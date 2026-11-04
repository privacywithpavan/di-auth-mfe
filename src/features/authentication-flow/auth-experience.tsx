"use client";

import { useMutation } from "@tanstack/react-query";
import { useMachine } from "@xstate/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import {
  type HostBridge,
  type InitializedContext,
  initializeContext,
} from "@/features/host-bridge/initialize-context";
import { IdentifierStep } from "@/features/login/components/identifier-step";
import { PasswordStep } from "@/features/login/components/password-step";
import { OtpStep } from "@/features/mfa/components/otp-step";
import { VerifyingStep } from "@/features/mfa/components/verifying-step";
import type { ChallengeResponse, Method } from "@/features/mfa/types";
import { signInWithPasskey } from "@/features/passkeys/login";
import { RegistrationExperience } from "@/features/registration/components/registration-experience";
import { api } from "./api";
import { CompleteStep } from "./components/complete-step";
import { Loading } from "./components/loading";
import { flowMachine } from "./machine";

type InitResponse = InitializedContext;

export function AuthExperience() {
  const [bridge, setBridge] = useState<HostBridge>();
  const post = useCallback(
    (type: string, extra: object = {}) => {
      if (bridge)
        window.parent.postMessage(
          { type, version: 1, state: bridge.state, ...extra },
          bridge.parentOrigin,
        );
    },
    [bridge],
  );
  const [flowState, send] = useMachine(flowMachine);
  const [init, setInit] = useState<InitResponse>();
  const [challenge, setChallenge] = useState<ChallengeResponse>();
  const [selectedMethod, setSelectedMethod] = useState<Method>();
  const [username, setUsername] = useState("");
  const [registration, setRegistration] = useState(false);
  const [error, setError] = useState<string>();
  const initialized = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const conditional = useRef<
    { controller: AbortController; task: Promise<void> } | undefined
  >(undefined);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [autofillAttempt, setAutofillAttempt] = useState(0);

  const initialize = useMutation({
    mutationFn: () => initializeContext(setBridge),
    onSuccess: (result) => {
      setInit(result);
      setError(undefined);
      send({ type: "READY" });
    },
    onError: () =>
      setError("This sign-in request is invalid, expired, or already used."),
  });

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initialize.mutate();
    }
  }, [initialize]);

  useEffect(() => {
    if (flowState.matches("complete")) {
      post("IAM_AUTH_COMPLETE");
    }
  }, [post, flowState]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: autofillAttempt intentionally restarts passkey autofill after an explicit sign-in error.
  useEffect(() => {
    if (
      !init ||
      !init.methods.includes("PASSKEY") ||
      registration ||
      flowState.value !== "identifier"
    )
      return;
    const controller = new AbortController();
    const task = (async () => {
      try {
        if (
          !window.PublicKeyCredential?.isConditionalMediationAvailable ||
          !(await PublicKeyCredential.isConditionalMediationAvailable()) ||
          controller.signal.aborted
        )
          return;
        await signInWithPasskey(init, true, controller.signal, undefined, () =>
          setPasskeyBusy(true),
        );
        if (!controller.signal.aborted) send({ type: "PASSKEY_VERIFIED" });
      } catch (reason) {
        // Conditional UI is progressive enhancement; explicit Continue remains available.
        if (
          !controller.signal.aborted &&
          reason instanceof Error &&
          !reason.message.includes("cancelled")
        )
          setError(reason.message);
      } finally {
        setPasskeyBusy(false);
      }
    })();
    conditional.current = { controller, task };
    return () => controller.abort();
  }, [init, registration, flowState.value, send, autofillAttempt]);

  const stopAutofill = async () => {
    const pending = conditional.current;
    pending?.controller.abort();
    await pending?.task;
  };

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new ResizeObserver(() =>
      post("IAM_AUTH_RESIZE", {
        height: Math.ceil(card.getBoundingClientRect().height),
      }),
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [post]);

  const cancel = async () => {
    if (!init) return;
    await stopAutofill();
    setError(undefined);
    try {
      await api(
        "/api/auth/cancel",
        { contextId: init.contextId },
        init.csrfToken,
      );
      post("IAM_AUTH_CANCELLED");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not cancel sign in.",
      );
    }
  };

  return (
    <main className="relative block min-h-0 overflow-visible bg-white p-0">
      <AuthCard ref={cardRef} aria-live="polite">
        {flowState.matches("starting") && (
          <Loading error={error} onClose={() => post("IAM_AUTH_CANCELLED")} />
        )}
        {registration && init && (
          <RegistrationExperience
            email={username}
            init={init}
            parentOrigin={init.parentOrigin}
            onCancel={cancel}
          />
        )}
        {!registration && flowState.matches("identifier") && init && (
          <IdentifierStep
            error={error}
            busy={passkeyBusy}
            onCancel={cancel}
            onGoogle={() =>
              setError("Google Sign In is not connected in this POC.")
            }
            onSubmit={async ({ username: value }) => {
              setError(undefined);
              await stopAutofill();
              try {
                const result = await api<{ nextAction: string }>(
                  "/api/auth/registration/identify",
                  { contextId: init.contextId, email: value },
                  init.csrfToken,
                );
                setUsername(value);
                if (result.nextAction === "ENTER_PASSKEY") {
                  setPasskeyBusy(true);
                  await signInWithPasskey(
                    init,
                    false,
                    new AbortController().signal,
                    value,
                  );
                  send({ type: "PASSKEY_VERIFIED" });
                } else if (result.nextAction === "VERIFY_EMAIL")
                  setRegistration(true);
                else send({ type: "IDENTIFIER_ACCEPTED" });
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Could not continue.",
                );
                setAutofillAttempt((value) => value + 1);
              } finally {
                setPasskeyBusy(false);
              }
            }}
          />
        )}
        {flowState.matches("password") && init && (
          <PasswordStep
            username={username}
            error={error}
            onCancel={cancel}
            onChangeIdentifier={() => {
              setError(undefined);
              send({ type: "BACK" });
            }}
            onResetPassword={() =>
              setError("Password reset is not connected in this POC.")
            }
            onSubmit={async (values) => {
              setError(undefined);
              try {
                const result = await api<
                  ChallengeResponse & { method: Method }
                >(
                  "/api/auth/password",
                  { ...values, username, contextId: init.contextId },
                  init.csrfToken,
                );
                setSelectedMethod(result.method);
                setChallenge(result);
                send({ type: "CHALLENGE_CREATED" });
              } catch (reason) {
                setError(
                  reason instanceof Error ? reason.message : "Sign in failed.",
                );
              }
            }}
          />
        )}
        {flowState.matches("otp") && init && challenge && (
          <OtpStep
            method={selectedMethod ?? "EMAIL_OTP"}
            allowMethodSwitch={init.mfaMethods.length > 1}
            challenge={challenge}
            error={error}
            onCancel={cancel}
            onSendCode={async (method) => {
              setError(undefined);
              try {
                const result = await api<ChallengeResponse>(
                  "/api/auth/mfa/challenge",
                  { method, contextId: init.contextId },
                  init.csrfToken,
                );
                setSelectedMethod(method);
                setChallenge(result);
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Could not send a code.",
                );
              }
            }}
            onSubmit={async ({ code }) => {
              setError(undefined);
              send({ type: "VERIFYING" });
              try {
                await api(
                  "/api/auth/mfa/verify",
                  { code, contextId: init.contextId },
                  init.csrfToken,
                );
                send({ type: "VERIFIED" });
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Verification failed.",
                );
                send({ type: "VERIFY_FAILED" });
              }
            }}
          />
        )}
        {flowState.matches("verifying") && <VerifyingStep />}
        {flowState.matches("complete") && <CompleteStep />}
      </AuthCard>
    </main>
  );
}
