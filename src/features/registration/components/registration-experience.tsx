"use client";

import { useEffect, useId, useState } from "react";
import { AuthButton as Button } from "@/components/auth/auth-button";
import { AuthInput as Input } from "@/components/auth/auth-input";
import { AuthLabel as Label } from "@/components/auth/auth-label";
import { AuthNativeSelect as NativeSelect } from "@/components/auth/auth-native-select";
import { ErrorNotice } from "@/components/auth/error-notice";
import {
  AuthForm,
  AuthStep,
  CheckboxField,
  FormActions,
  FormHint,
  VerificationCopy,
} from "@/components/auth/form-layout";
import { PasswordInput, PasswordLabel } from "@/components/auth/password-field";
import { VerificationProgress } from "@/components/auth/verification-progress";
import {
  type CreationOptions,
  createPasskey,
} from "@/features/passkeys/registration";
import { PhoneField } from "./phone-field";
import { SignInMethodCard } from "./sign-in-method-card";

type Stage =
  | "email"
  | "profile"
  | "phone"
  | "consent"
  | "verifying"
  | "creating";
export function RegistrationExperience({
  email,
  init,
  parentOrigin,
  onCancel,
}: {
  email: string;
  init: {
    contextId: string;
    csrfToken: string;
    state: string;
    methods: string[];
  };
  parentOrigin: string;
  onCancel: () => Promise<void>;
}) {
  const fieldId = useId();
  const [stage, setStage] = useState<Stage>("email");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(28);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [method, setMethod] = useState<"PASSKEY" | "PASSWORD">(
    init.methods.includes("PASSKEY") ? "PASSKEY" : "PASSWORD",
  );
  const [dialCode, setDialCode] = useState("+1");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    const timer = window.setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  async function request(action: string, input: object = {}) {
    const response = await fetch(`/api/auth/registration/${action}`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": init.csrfToken,
      },
      body: JSON.stringify({ ...input, contextId: init.contextId }),
    });
    const result = (await response.json()) as {
      message?: string;
      nextAction?: string;
      publicKey?: CreationOptions;
    };
    if (!response.ok) throw new Error(result.message ?? "Unable to continue.");
    return result;
  }
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to continue.",
      );
    } finally {
      setBusy(false);
    }
  }
  const title =
    stage === "email"
      ? "Verify your email"
      : stage === "phone"
        ? "Verify your phone number"
        : stage === "verifying"
          ? "Verify your identity"
          : "Create an account";
  const actions = (
    primary = "Continue",
    secondary = "Cancel",
    onSecondary = onCancel,
  ) => (
    <FormActions compact>
      <Button
        size="sm"
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => void act(onSecondary)}
      >
        {secondary}
      </Button>
      <Button size="sm" variant="default" type="submit" disabled={busy}>
        {primary}
      </Button>
    </FormActions>
  );
  return (
    <AuthStep title={title} density="compact">
      {error && <ErrorNotice message={error} showIcon={false} />}
      {stage === "verifying" || stage === "creating" ? (
        <VerificationProgress>
          {stage === "creating"
            ? "Creating your account..."
            : "Verifying your code..."}
        </VerificationProgress>
      ) : stage === "email" || stage === "phone" ? (
        <AuthForm
          spacing="registration"
          key={stage}
          onSubmit={(event) => {
            event.preventDefault();
            const previous = stage;
            void act(async () => {
              setStage("verifying");
              try {
                await request(
                  previous === "email" ? "verify-email" : "verify-phone",
                  { code },
                );
                setCode("");
                setStage(previous === "email" ? "profile" : "consent");
              } catch (reason) {
                setStage(previous);
                throw reason;
              }
            });
          }}
        >
          <VerificationCopy compact>
            Enter the code we sent to
            <br />
            <strong>{stage === "email" ? email : phone}</strong>
            {stage === "email" && (
              <Button
                type="button"
                variant="link"
                size="link"
                className="ml-2.5"
                onClick={() =>
                  void act(async () => {
                    await onCancel();
                    window.location.reload();
                  })
                }
              >
                Change
              </Button>
            )}
          </VerificationCopy>
          <Label htmlFor={`${fieldId}-code`}>
            Enter 6-digit code
            <Input
              id={`${fieldId}-code`}
              density="registration"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Label>
          <Button
            type="button"
            variant="link"
            size="link"
            className="mt-0.5 mb-2"
            disabled={seconds > 0 || busy}
            onClick={() =>
              void act(async () => {
                await request("resend");
                setSeconds(28);
              })
            }
          >
            {seconds
              ? `Resend code in 00:${String(seconds).padStart(2, "0")}`
              : "Resend code"}
          </Button>
          {stage === "phone"
            ? actions("Continue", "Skip", async () => {
                await request("skip-phone");
                setStage("consent");
              })
            : actions()}
        </AuthForm>
      ) : stage === "profile" ? (
        <AuthForm
          spacing="registration"
          key="profile"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void act(async () => {
              const number = String(data.get("phone") ?? "").trim();
              const fullPhone = number
                ? number.startsWith("+")
                  ? number
                  : dialCode + number
                : "";
              let result = await request("profile", {
                firstName: data.get("firstName"),
                lastName: data.get("lastName"),
                phone: fullPhone,
                ...(method === "PASSWORD"
                  ? { password: data.get("password") }
                  : {}),
                signInMethod: method,
              });
              if (method === "PASSKEY") {
                const options = await request("passkey-options");
                if (!options.publicKey)
                  throw new Error(
                    "Unable to prepare your passkey. Please try again.",
                  );
                const credential = await createPasskey(options.publicKey);
                result = await request("passkey-verify", { credential });
              }
              setPhone(fullPhone);
              setSeconds(28);
              setStage(result.nextAction === "PHONE" ? "phone" : "consent");
            });
          }}
        >
          <VerificationCopy compact>
            Email
            <br />
            <strong>{email}</strong>
          </VerificationCopy>
          <Label htmlFor={`${fieldId}-first-name`}>
            First name
            <Input
              id={`${fieldId}-first-name`}
              density="registration"
              name="firstName"
              autoComplete="given-name"
              required
              maxLength={80}
            />
          </Label>
          <Label htmlFor={`${fieldId}-last-name`}>
            Last name
            <Input
              id={`${fieldId}-last-name`}
              density="registration"
              name="lastName"
              autoComplete="family-name"
              required
              maxLength={80}
            />
          </Label>
          <PhoneField
            countryCode={dialCode}
            onCountryChange={(event) => setDialCode(event.target.value)}
          />
          <FormHint attached>
            We’ll send a verification code. Message and data rates may apply.
          </FormHint>
          <fieldset className="mt-1 mr-0 mb-0 ml-0 grid min-w-0 gap-3.5 border-0 p-0">
            <legend className="pb-2.5 text-field">
              Select a sign in method
            </legend>
            {init.methods.includes("PASSKEY") && (
              <SignInMethodCard
                value="PASSKEY"
                checked={method === "PASSKEY"}
                onChange={() => setMethod("PASSKEY")}
                title="Passkey"
                recommended
                icon={<FingerprintIcon />}
                description="Sign in quickly and securely with your face, fingerprint, or PIN. No password needed."
              />
            )}
            {init.methods.includes("PASSWORD") && (
              <SignInMethodCard
                value="PASSWORD"
                checked={method === "PASSWORD"}
                onChange={() => setMethod("PASSWORD")}
                title="Password with two-step verification"
                icon={<LockIcon />}
                description="Create a password and verify your identity with a 6-digit code every time you sign in."
              >
                {method === "PASSWORD" && (
                  <div className="mt-[17px] grid gap-field-gap">
                    <PasswordLabel
                      htmlFor={`${fieldId}-password`}
                      compact
                      visible={showPassword}
                      onToggle={() => setShowPassword(!showPassword)}
                    />
                    <PasswordInput
                      icon={<LockIcon />}
                      density="registration"
                      id={`${fieldId}-password`}
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      maxLength={256}
                    />
                    <small className="mt-2 flex gap-[6px] text-caption leading-[1.55] text-password-hint">
                      <span className="text-info" aria-hidden="true">
                        ⓘ
                      </span>
                      Passwords must be 8 or more characters in length and
                      contain at least 1 uppercase letter, 1 lowercase letter,
                      and 1 number.
                    </small>
                  </div>
                )}
              </SignInMethodCard>
            )}
          </fieldset>
          {actions(
            busy && method === "PASSKEY" ? "Creating passkey…" : "Continue",
          )}
        </AuthForm>
      ) : (
        <AuthForm
          spacing="registration"
          key="consent"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void act(async () => {
              setStage("creating");
              try {
                await request("complete", {
                  termsAccepted: data.has("terms"),
                  marketing: data.has("marketing"),
                  rewards: data.has("rewards"),
                  locale: data.get("locale"),
                });
                window.parent.postMessage(
                  {
                    type: "IAM_AUTH_COMPLETE",
                    version: 1,
                    state: init.state,
                    accountCreated: true,
                  },
                  parentOrigin,
                );
              } catch (reason) {
                setStage("consent");
                throw reason;
              }
            });
          }}
        >
          <VerificationCopy compact>
            Creating account for <strong>{email}</strong>
          </VerificationCopy>
          <Label htmlFor={`${fieldId}-locale`}>
            Country / language
            <NativeSelect id={`${fieldId}-locale`} name="locale">
              <option value="en-US">United States / English</option>
              <option value="en-IN">India / English</option>
            </NativeSelect>
          </Label>
          <p className="text-body leading-[1.6]">
            Choose whether you’d like to receive product news, offers, and
            updates. You can unsubscribe at any time.
          </p>
          <CheckboxField name="marketing">
            Yes, I would like to receive email communications.
          </CheckboxField>
          <CheckboxField name="rewards">
            Yes, I would like to register for Dell Rewards.
          </CheckboxField>
          <CheckboxField name="terms" required>
            I agree to the account terms and privacy statement.
          </CheckboxField>
          <FormHint>
            Demo preferences are stored only in the mock IAM service.
          </FormHint>
          {actions("Create Account")}
        </AuthForm>
      )}
    </AuthStep>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </svg>
  );
}
function FingerprintIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11a8 8 0 0 1 16 0M7 12v-1a5 5 0 0 1 10 0v3M10 15v-4a2 2 0 0 1 4 0v6M4 14v3M7 15v5M10 18v3M17 17v3M20 14v3" />
    </svg>
  );
}
