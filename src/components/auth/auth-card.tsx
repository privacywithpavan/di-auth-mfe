import type { ComponentProps } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AuthCard({ className, ...props }: ComponentProps<typeof Card>) {
  return (
    <Card
      {...props}
      className={cn(
        "relative min-h-0 w-full gap-0 overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none ring-0",
        className,
      )}
    />
  );
}
