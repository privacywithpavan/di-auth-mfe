import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatusPanel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-status flex-1 animate-auth-enter flex-col items-center justify-center p-6 text-center",
        className,
      )}
      {...props}
    />
  );
}

export function Spinner({ large = false }: { large?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-full",
        large
          ? "mb-5 size-verification-spinner animate-verification-spin border-[7px] border-verification-track border-t-verification-active"
          : "mb-[26px] size-9 animate-auth-spin border-[3px] border-success-track border-t-success",
      )}
    />
  );
}

export function VerificationProgress({ children }: { children: ReactNode }) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-verification flex-col items-center justify-center text-black"
    >
      <Spinner large />
      <p className="m-0 text-method-title">{children}</p>
    </div>
  );
}
