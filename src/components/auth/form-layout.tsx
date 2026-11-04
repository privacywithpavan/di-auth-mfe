import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AuthLabel as Label } from "./auth-label";

type Density = "default" | "compact";

export function AuthHeading({
  compact = false,
  className,
  ...props
}: ComponentProps<"h1"> & { compact?: boolean }) {
  return (
    <h1
      className={cn(
        "m-0 tracking-normal",
        compact ? "text-field font-semibold" : "text-step-title font-emphasis",
        "leading-[1.3]",
        className,
      )}
      {...props}
    />
  );
}

export function AuthStep({
  title,
  density = "default",
  children,
}: {
  title: ReactNode;
  density?: Density;
  children: ReactNode;
}) {
  const compact = density === "compact";
  return (
    <div
      className={cn(
        "min-h-0 flex-1 animate-auth-enter",
        compact ? "p-step-compact text-content" : "p-step",
      )}
    >
      <AuthHeading compact={compact}>{title}</AuthHeading>
      <div
        className={cn(
          "h-px bg-divider",
          compact ? "mt-2.5 mb-3.5" : "mt-3 mb-step-compact",
        )}
      />
      {children}
    </div>
  );
}

const formVariants = cva("grid", {
  variants: {
    spacing: {
      default: "gap-field-gap",
      identifier: "gap-identifier-gap",
      registration: "gap-4",
    },
  },
  defaultVariants: { spacing: "default" },
});

export function AuthForm({
  spacing = "default",
  className,
  ...props
}: ComponentProps<"form"> & {
  spacing?: "default" | "identifier" | "registration";
}) {
  return (
    <form className={cn(formVariants({ spacing }), className)} {...props} />
  );
}

export function FormActions({
  compact = false,
  className,
  ...props
}: ComponentProps<"div"> & { compact?: boolean }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2",
        compact ? "mt-0 gap-2.5" : "mt-2.5 gap-3",
        className,
      )}
      {...props}
    />
  );
}

export function VerificationCopy({
  compact = false,
  className,
  ...props
}: ComponentProps<"p"> & { compact?: boolean }) {
  return (
    <p
      className={cn(
        "m-0 text-body text-content [&_strong]:font-emphasis",
        compact ? "mb-0.5 leading-[1.7]" : "mb-3.5 leading-[1.55]",
        className,
      )}
      {...props}
    />
  );
}

export function FieldError(props: ComponentProps<"span">) {
  return <span className="text-caption text-destructive" {...props} />;
}

export function FormHint({
  attached = false,
  className,
  ...props
}: ComponentProps<"small"> & { attached?: boolean }) {
  return (
    <small
      className={cn(
        "block text-caption leading-[1.5] text-hint",
        attached && "-mt-[11px]",
        className,
      )}
      {...props}
    />
  );
}

export function CheckboxField({
  children,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { children: ReactNode }) {
  return (
    <Label className="flex items-start gap-identifier-gap text-body leading-[1.5]">
      <input
        {...props}
        type="checkbox"
        className={cn(
          "mt-[3px] mr-0 mb-0 ml-0 size-4 shrink-0 appearance-auto rounded-none border-0 p-0 accent-link",
          className,
        )}
      />
      {children}
    </Label>
  );
}
