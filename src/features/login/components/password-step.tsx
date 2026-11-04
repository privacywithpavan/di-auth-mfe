"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { AuthButton as Button } from "@/components/auth/auth-button";
import { ErrorNotice } from "@/components/auth/error-notice";
import {
  AuthForm,
  AuthStep,
  FieldError,
  FormActions,
} from "@/components/auth/form-layout";
import { PasswordInput, PasswordLabel } from "@/components/auth/password-field";
import { type PasswordValues, passwordSchema } from "../schemas";

export function PasswordStep({
  username,
  onSubmit,
  onCancel,
  onChangeIdentifier,
  onResetPassword,
  error,
}: {
  username: string;
  error?: string;
  onCancel: () => Promise<void>;
  onChangeIdentifier: () => void;
  onResetPassword: () => void;
  onSubmit: (values: PasswordValues) => Promise<void>;
}) {
  const passwordId = useId();
  const errorId = `${passwordId}-error`;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });
  const [showPassword, setShowPassword] = useState(false);
  return (
    <AuthStep title="Verify your identity">
      <div className="mb-[17px] grid gap-[5px] text-body text-identity">
        <span>Sign in as</span>
        <div className="flex items-center gap-2.5">
          <strong className="text-body">{username}</strong>
          <Button
            type="button"
            variant="link"
            size="link"
            onClick={onChangeIdentifier}
          >
            Change
          </Button>
        </div>
      </div>
      {error && <ErrorNotice message={error} />}
      <AuthForm onSubmit={handleSubmit(onSubmit)} noValidate>
        <PasswordLabel
          htmlFor={passwordId}
          visible={showPassword}
          onToggle={() => setShowPassword((value) => !value)}
        />
        <PasswordInput
          id={passwordId}
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          {...register("password")}
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? errorId : undefined}
        />
        {errors.password && (
          <FieldError id={errorId}>{errors.password.message}</FieldError>
        )}
        <Button
          variant="link"
          size="link"
          className="mt-0.5"
          type="button"
          onClick={onResetPassword}
        >
          Create or reset password
        </Button>
        <FormActions>
          <Button
            variant="outline"
            type="button"
            onClick={() => void onCancel()}
          >
            Cancel
          </Button>
          <Button variant="default" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Checking…" : "Continue"}
          </Button>
        </FormActions>
      </AuthForm>
    </AuthStep>
  );
}
