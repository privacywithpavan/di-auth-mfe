"use client";

import { Lock } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AuthButton as Button } from "./auth-button";
import { AuthInput as Input } from "./auth-input";
import { AuthLabel as Label } from "./auth-label";

export function PasswordLabel({
  htmlFor,
  visible,
  onToggle,
  compact = false,
}: {
  htmlFor: string;
  visible: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  return (
    <div className="mt-0.5 flex items-center justify-between">
      <Label
        className={cn("m-0 block", compact && "text-help")}
        htmlFor={htmlFor}
      >
        Password
      </Label>
      <Button
        className={compact ? "text-help" : undefined}
        type="button"
        variant="link"
        size="link"
        onClick={onToggle}
      >
        {visible ? "Hide" : "Show"}
      </Button>
    </div>
  );
}

export function PasswordInput({
  icon = <Lock aria-hidden="true" />,
  className,
  type = "password",
  ...props
}: ComponentProps<typeof Input> & { icon?: ReactNode }) {
  return (
    <div className="relative [&>svg]:absolute [&>svg]:top-1/2 [&>svg]:left-[15px] [&>svg]:z-[1] [&>svg]:w-[18px] [&>svg]:-translate-y-1/2 [&>svg]:fill-none [&>svg]:stroke-icon [&>svg]:stroke-[1.4]">
      {icon}
      <Input type={type} className={cn("pl-11", className)} {...props} />
    </div>
  );
}
