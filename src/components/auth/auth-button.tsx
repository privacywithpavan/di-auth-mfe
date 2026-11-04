"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const authButtonVariants = cva(
  "h-auto gap-2 rounded-lg text-field font-emphasis leading-[normal] [font-family:inherit] cursor-pointer whitespace-normal active:translate-y-0 disabled:pointer-events-auto disabled:opacity-[0.58]",
  {
    variants: {
      variant: {
        default:
          "border-0 bg-primary text-primary-foreground shadow-none hover:bg-primary-hover disabled:cursor-wait",
        destructive: "border-0 bg-destructive text-white hover:bg-destructive",
        outline:
          "inline-block border-[1.5px] border-primary bg-white text-outline-foreground hover:bg-white hover:text-outline-foreground",
        secondary: "border-0 bg-secondary text-foreground hover:bg-secondary",
        ghost: "border-0 bg-transparent text-foreground hover:bg-transparent",
        link: "inline-block w-fit rounded-none border-0 bg-transparent text-body font-normal text-link hover:bg-transparent hover:underline disabled:cursor-default disabled:text-link-disabled disabled:no-underline",
        google:
          "flex gap-2.5 border-[1.5px] border-primary bg-white text-content hover:bg-white",
      },
      size: {
        default: "min-h-action px-[6px] py-px",
        sm: "min-h-action-compact px-[6px] py-px text-body",
        lg: "min-h-[50px] px-[22px] py-px",
        icon: "size-9",
        link: "min-h-0 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type AuthButtonProps = Omit<
  ComponentProps<typeof Button>,
  "variant" | "size" | "className"
> &
  VariantProps<typeof authButtonVariants> & { className?: string };

// Keep Base UI's safe default. Form actions must explicitly use type="submit".
function AuthButton({
  variant = "default",
  size = "default",
  type = "button",
  className,
  ...props
}: AuthButtonProps) {
  return (
    <Button
      {...props}
      type={type}
      variant={variant === "google" ? "outline" : (variant ?? "default")}
      data-variant={variant}
      data-size={size}
      className={cn(authButtonVariants({ variant, size }), className)}
    />
  );
}

export { AuthButton, authButtonVariants };
export type { AuthButtonProps };
