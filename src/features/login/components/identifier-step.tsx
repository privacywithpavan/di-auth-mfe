"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
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
} from "@/components/auth/form-layout";
import { type IdentifierValues, identifierSchema } from "../schemas";

export function IdentifierStep({
  onSubmit,
  onCancel,
  onGoogle,
  error,
  busy,
}: {
  onSubmit: (values: IdentifierValues) => Promise<void>;
  onCancel: () => Promise<void>;
  onGoogle: () => void;
  error?: string;
  busy: boolean;
}) {
  const identifierId = useId();
  const errorId = `${identifierId}-error`;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<IdentifierValues>({
    resolver: zodResolver(identifierSchema),
    defaultValues: { username: "" },
  });
  return (
    <AuthStep title="Sign in or create an account">
      {error && <ErrorNotice message={error} />}
      <Button
        variant="google"
        className="w-full"
        type="button"
        disabled={isSubmitting || busy}
        onClick={onGoogle}
      >
        <GoogleMark /> Google Sign In
      </Button>
      <div className="mt-[18px] mb-[14px] flex items-center gap-2.5 text-divider-label before:h-px before:flex-1 before:bg-divider-line before:content-[''] after:h-px after:flex-1 after:bg-divider-line after:content-['']">
        <span className="px-0.5">or</span>
      </div>
      <AuthForm
        spacing="identifier"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <Label htmlFor={identifierId}>
          Email or phone number
          <Input
            id={identifierId}
            autoComplete="username webauthn"
            disabled={isSubmitting || busy}
            {...register("username")}
            aria-invalid={!!errors.username}
            aria-describedby={errors.username ? errorId : undefined}
          />
        </Label>
        {errors.username && (
          <FieldError id={errorId}>{errors.username.message}</FieldError>
        )}
        <FormActions>
          <Button
            variant="outline"
            type="button"
            disabled={isSubmitting || busy}
            onClick={() => void onCancel()}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            type="submit"
            disabled={isSubmitting || busy}
          >
            {busy ? "Signing in…" : isSubmitting ? "Continuing…" : "Continue"}
          </Button>
        </FormActions>
      </AuthForm>
    </AuthStep>
  );
}

function GoogleMark() {
  return (
    <span
      className="text-[0px] before:bg-google-mark before:bg-clip-text before:text-[22px] before:font-[850] before:text-transparent before:content-['G']"
      aria-hidden="true"
    >
      G
    </span>
  );
}
