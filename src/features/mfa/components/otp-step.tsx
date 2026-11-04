"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { AuthButton as Button } from "@/components/auth/auth-button";
import { AuthInput as Input } from "@/components/auth/auth-input";
import { AuthLabel as Label } from "@/components/auth/auth-label";
import { ErrorNotice } from "@/components/auth/error-notice";
import {
  AuthForm,
  AuthStep,
  FieldError,
  FormActions,
  VerificationCopy,
} from "@/components/auth/form-layout";
import { type OtpValues, otpSchema } from "../schemas";
import type { ChallengeResponse, Method } from "../types";

export function OtpStep({
  challenge,
  method,
  allowMethodSwitch,
  error,
  onSubmit,
  onCancel,
  onSendCode,
}: {
  challenge: ChallengeResponse;
  method: Method;
  allowMethodSwitch: boolean;
  error?: string;
  onSubmit: (values: OtpValues) => Promise<void>;
  onCancel: () => Promise<void>;
  onSendCode: (method: Method) => Promise<void>;
}) {
  const codeId = useId();
  const errorId = `${codeId}-error`;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: "" },
  });
  const [seconds, setSeconds] = useState(28);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (seconds === 0) return;
    const timer = window.setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [seconds]);
  const sendCode = async (nextMethod: Method) => {
    setSending(true);
    await onSendCode(nextMethod);
    setSeconds(28);
    setSending(false);
  };
  return (
    <AuthStep title="Two-step verification">
      <VerificationCopy>
        Enter the code we sent to
        <br />
        <strong>{challenge.maskedDestination}</strong>
      </VerificationCopy>
      {error && <ErrorNotice message={error} />}
      <AuthForm onSubmit={handleSubmit(onSubmit)} noValidate>
        <Label htmlFor={codeId}>
          Enter 6-digit code
          <Input
            id={codeId}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            {...register("code")}
            aria-invalid={!!errors.code}
            aria-describedby={errors.code ? errorId : undefined}
          />
        </Label>
        {errors.code && (
          <FieldError id={errorId}>{errors.code.message}</FieldError>
        )}
        <Button
          variant="link"
          size="link"
          className="mt-0.5 mb-2"
          type="button"
          disabled={seconds > 0 || sending}
          onClick={() => void sendCode(method)}
        >
          {seconds > 0
            ? `Resend code in 00:${String(seconds).padStart(2, "0")}`
            : sending
              ? "Sending code…"
              : "Resend code"}
        </Button>
        {allowMethodSwitch && (
          <Button
            variant="link"
            size="link"
            className="mt-[5px] mb-0.5"
            type="button"
            disabled={sending}
            onClick={() =>
              void sendCode(method === "EMAIL_OTP" ? "SMS_OTP" : "EMAIL_OTP")
            }
          >
            {method === "EMAIL_OTP"
              ? "Text me a one-time code"
              : "Email me a one-time code"}
          </Button>
        )}
        <FormActions>
          <Button
            variant="outline"
            type="button"
            onClick={() => void onCancel()}
          >
            Cancel
          </Button>
          <Button variant="default" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Verifying…" : "Continue"}
          </Button>
        </FormActions>
      </AuthForm>
    </AuthStep>
  );
}
