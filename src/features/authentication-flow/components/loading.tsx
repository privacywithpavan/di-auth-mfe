import { AuthButton as Button } from "@/components/auth/auth-button";
import { ErrorNotice } from "@/components/auth/error-notice";
import { AuthHeading } from "@/components/auth/form-layout";
import { Spinner, StatusPanel } from "@/components/auth/verification-progress";

export function Loading({
  error,
  onClose,
}: {
  error?: string;
  onClose: () => void;
}) {
  return (
    <StatusPanel>
      {!error && <Spinner />}
      <AuthHeading>
        {error ? "Start sign in from ChatHost" : "Preparing secure sign in"}
      </AuthHeading>
      {error ? (
        <>
          <ErrorNotice
            message={`${error} Start again from the approved ChatHost.`}
          />
          <Button type="button" variant="outline" onClick={onClose}>
            Close sign in
          </Button>
        </>
      ) : (
        <p>Creating a browser-bound authentication request…</p>
      )}
    </StatusPanel>
  );
}
