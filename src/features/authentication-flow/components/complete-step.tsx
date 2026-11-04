import { AuthHeading } from "@/components/auth/form-layout";
import { StatusPanel } from "@/components/auth/verification-progress";

export function CompleteStep() {
  return (
    <StatusPanel>
      <div className="mb-[26px] grid size-[74px] place-items-center rounded-full bg-success text-[34px] text-white shadow-success">
        ✓
      </div>
      <div className="mb-3 text-caption font-extrabold tracking-[.12em] text-success uppercase">
        Identity verified
      </div>
      <AuthHeading>You’re all set</AuthHeading>
      <p className="mt-[14px] mr-0 mb-7 ml-0 text-method-title leading-[1.6] text-muted-foreground">
        Your secure session is ready. Returning you to the conversation now.
      </p>
      <div className="mt-[5px] flex gap-[9px] [&>span]:rounded-lg [&>span]:bg-muted [&>span]:px-2.5 [&>span]:py-2 [&>span]:text-[10px] [&>span]:text-muted-foreground [&_b]:text-foreground">
        <span>
          <b>2</b> factors verified
        </span>
        <span>
          <b>15</b> minute session
        </span>
      </div>
    </StatusPanel>
  );
}
