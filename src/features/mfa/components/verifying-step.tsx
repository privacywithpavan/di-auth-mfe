import { AuthStep } from "@/components/auth/form-layout";
import { VerificationProgress } from "@/components/auth/verification-progress";

export function VerifyingStep() {
  return (
    <AuthStep title="Two-step verification">
      <VerificationProgress>Verifying your code...</VerificationProgress>
    </AuthStep>
  );
}
