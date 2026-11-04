import type { ComponentProps } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export function AuthNativeSelect({
  className,
  size = "default",
  ...props
}: ComponentProps<typeof NativeSelect>) {
  // The generated component applies className to a wrapper, not the select itself.
  return (
    <NativeSelect
      {...props}
      size={size}
      className={cn(
        "block w-full [&>select]:h-[42px] [&>select]:appearance-auto [&>select]:rounded-md [&>select]:bg-white [&>select]:p-2 [&>select]:text-content [&>svg]:hidden",
        size === "sm" && "[&>select]:h-8",
        className,
      )}
    />
  );
}
