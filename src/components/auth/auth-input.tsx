"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AuthInputProps = ComponentProps<typeof Input> & {
  density?: "default" | "registration";
};

function AuthInput({
  className,
  density = "default",
  ...props
}: AuthInputProps) {
  return (
    <Input
      {...props}
      className={cn(
        "h-control w-full min-w-0 rounded-md border border-input bg-white px-[14px] py-0 text-[length:inherit] md:text-[length:inherit] text-foreground [font-family:inherit] [font-weight:inherit] leading-[normal] outline-none transition-[border-color,box-shadow] duration-200 ease-[ease] focus:border-ring focus:shadow-input-focus focus-visible:ring-0",
        density === "registration" && "h-control-compact rounded-sm",
        className,
      )}
    />
  );
}

export { AuthInput };
export type { AuthInputProps };
