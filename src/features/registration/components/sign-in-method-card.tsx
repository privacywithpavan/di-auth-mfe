import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { AuthLabel as Label } from "@/components/auth/auth-label";

const methodVariants = cva(
  "group min-w-0 rounded-xl border-[1.5px] border-method-border bg-white p-3.5 text-content focus-within:outline-[3px] focus-within:outline-method-focus focus-within:outline-offset-[3px]",
  {
    variants: {
      selected: {
        true: "border-transparent [background:var(--background-method-selected)]",
        false: "",
      },
    },
  },
);

type MethodCardProps = Pick<
  ComponentProps<"input">,
  "value" | "checked" | "onChange"
> & {
  title: string;
  description: string;
  icon: ReactNode;
  recommended?: boolean;
  children?: ReactNode;
};

export function SignInMethodCard({
  value,
  checked,
  onChange,
  title,
  description,
  icon,
  recommended,
  children,
}: MethodCardProps) {
  return (
    <div
      data-selected={checked}
      className={methodVariants({ selected: checked })}
    >
      <Label className="relative flex cursor-pointer items-start gap-3 text-body">
        <input
          className="absolute mt-[3px] mr-[3px] mb-0 ml-[5px] h-control-compact w-px appearance-auto rounded-full border-0 p-0 opacity-0"
          type="radio"
          name="signInMethod"
          value={value}
          checked={checked}
          onChange={onChange}
        />
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-method-icon-background text-method-icon group-data-[selected=true]:bg-white group-data-[selected=true]:text-method-active-icon [&>svg]:size-[22px] [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:stroke-[1.7] [&>svg]:[stroke-linecap:round]">
          {icon}
        </span>
        <span className="grid min-w-0 flex-1 gap-identifier-gap">
          <span className="flex items-center justify-between gap-2 text-method-title leading-[1.4] text-content">
            {title}
            {recommended && (
              <span className="shrink-0 rounded-[20px] border border-recommended-border bg-white px-[5px] py-px text-badge text-recommended-foreground">
                Recommended
              </span>
            )}
          </span>
          <small className="block text-help leading-[1.55] text-method-description group-data-[selected=true]:text-method-active-description">
            {description}
          </small>
        </span>
      </Label>
      {children}
    </div>
  );
}
