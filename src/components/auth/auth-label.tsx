import type { ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function AuthLabel({
  className,
  ...props
}: ComponentProps<typeof Label>) {
  return (
    <Label
      {...props}
      className={cn(
        "grid gap-2 text-field font-medium leading-[normal] text-label",
        className,
      )}
    />
  );
}
