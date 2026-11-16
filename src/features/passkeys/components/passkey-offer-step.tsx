"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  FingerprintPattern,
  KeyRound,
  ScanFace,
  UserRoundPlus,
} from "lucide-react";
import { AuthButton } from "@/components/auth/auth-button";
import { ErrorNotice } from "@/components/auth/error-notice";
import { AuthStep } from "@/components/auth/form-layout";
import { Card } from "@/components/ui/card";
import { api } from "@/features/authentication-flow/api";
import { type CreationOptions, createPasskey } from "../registration";

const enrollmentPath = "/api/auth/passkey/enrollment";
const examples = [
  { label: "Face", Icon: ScanFace },
  { label: "Fingerprint", Icon: FingerprintPattern },
  { label: "PIN", Icon: KeyRound },
];

export function PasskeyOfferStep({
  init: { contextId, csrfToken },
  onComplete,
}: {
  init: { contextId: string; csrfToken: string };
  onComplete: () => void;
}) {
  const supported = Boolean(
    window.PublicKeyCredential && navigator.credentials?.create,
  );
  const options = useQuery({
    queryKey: ["passkey-enrollment", contextId],
    queryFn: () =>
      api<{ publicKey: CreationOptions }>(
        `${enrollmentPath}/options`,
        { contextId },
        csrfToken,
      ),
    enabled: supported,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const choice = useMutation({
    mutationFn: async (action: "add" | "skip") => {
      if (action === "skip") {
        await api(`${enrollmentPath}/skip`, { contextId }, csrfToken);
        return true;
      }
      const publicKey = options.data?.publicKey;
      if (!publicKey || options.isError) {
        const refreshed = await options.refetch();
        if (refreshed.error) throw refreshed.error;
        return false;
      }

      // Options are ready before the click so WebAuthn can use its user activation.
      const credential = await createPasskey(publicKey, "skip for now");
      await api(
        `${enrollmentPath}/verify`,
        { contextId, credential },
        csrfToken,
      );
      return true;
    },
    onSuccess: (completed) => {
      if (completed) onComplete();
    },
    onError: (_, action) => {
      if (action === "add" && options.data) void options.refetch();
    },
  });
  const error = choice.error ?? options.error;

  return (
    <AuthStep title="Protect your account" density="compact">
      <div aria-busy={choice.isPending}>
        {error && <ErrorNotice message={error.message} />}
        <Card className="gap-0 rounded-md px-4 pt-5 pb-6 text-center text-content shadow-sm ring-0">
          <span className="mx-auto mb-2 w-fit rounded-full border border-recommended-border px-2 py-0.5 text-caption font-semibold text-recommended-foreground">
            Recommended
          </span>
          <h2 className="text-step-title font-medium">
            Simpler sign in with Passkey
          </h2>
          <p className="mt-2 text-help">
            Sign in faster and more securely by creating a passkey.
            <br />
            No password to remember. No one-time codes to verify.
          </p>
          <ul className="my-7 flex justify-center gap-4 sm:gap-9">
            {examples.map(({ label, Icon }) => (
              <li
                key={label}
                className="grid justify-items-center gap-2 text-caption text-hint"
              >
                <span className="grid size-12 place-items-center rounded-full bg-method-icon-background text-verification-active sm:size-14">
                  <Icon size={23} aria-hidden="true" />
                </span>
                {label}
              </li>
            ))}
          </ul>
          {!supported && (
            <p className="mb-3 text-help">
              Passkeys are unavailable in this browser.
            </p>
          )}
          <AuthButton
            size="sm"
            className="w-full"
            disabled={!supported || choice.isPending || options.isFetching}
            onClick={() => choice.mutate("add")}
          >
            <UserRoundPlus aria-hidden="true" />
            {choice.isPending && choice.variables === "add"
              ? "Adding a passkey…"
              : "Add a Passkey"}
          </AuthButton>
        </Card>
        <AuthButton
          variant="ghost"
          size="sm"
          className="mx-auto mt-2 flex min-w-28 text-content underline-offset-4 hover:underline"
          disabled={choice.isPending || options.isFetching}
          onClick={() => choice.mutate("skip")}
        >
          {choice.isPending && choice.variables === "skip"
            ? "Signing in…"
            : "Skip for now"}
        </AuthButton>
      </div>
    </AuthStep>
  );
}
