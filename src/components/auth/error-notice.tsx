import { Alert } from "@/components/ui/alert";

export function ErrorNotice({
  message,
  showIcon = true,
}: {
  message: string;
  showIcon?: boolean;
}) {
  return (
    <Alert
      variant="destructive"
      className="mb-3 flex w-auto items-center gap-identifier-gap rounded-notice border border-notice-border bg-notice px-3 py-[11px] text-message leading-[normal] text-notice-foreground"
      role="alert"
    >
      {showIcon && (
        <span
          aria-hidden="true"
          className="grid size-[18px] place-items-center rounded-full bg-destructive text-caption font-extrabold text-white"
        >
          !
        </span>
      )}
      {message}
    </Alert>
  );
}
