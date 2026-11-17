import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { connect } from "node:net";
import { setTimeout } from "node:timers/promises";
import { test as base } from "@playwright/test";
import { buildChatHost, startChatHost } from "./chat-host";
import { listen, loopback } from "./http";
import { sessionCookie, startIam, subscriber } from "./iam";

function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: loopback, port });
    socket.setTimeout(1_000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForNext(port: number, running: () => boolean) {
  const deadline = Date.now() + 90_000;
  while (running() && Date.now() < deadline) {
    // Wait for the server socket without requesting a page or compiling a route.
    if (await isListening(port)) return;
    await setTimeout(250);
  }
  throw new Error(
    "The E2E Next.js server did not start listening. Check for an active Next.js dev server in this checkout.",
  );
}

type TestEnvironment = {
  mfeOrigin: string;
  hostOrigin: string;
  unapprovedOrigin: string;
  completionCounts: Awaited<ReturnType<typeof startIam>>["completionCounts"];
  expireMfaChallenges: () => void;
  setNextContextLifetime: (milliseconds: number) => void;
};

export const test = base.extend<
  object,
  { environment: TestEnvironment; passkeysEnabled: boolean }
>({
  passkeysEnabled: [false, { option: true, scope: "worker" }],
  environment: [
    async ({ passkeysEnabled }, use) => {
      const assets = await buildChatHost();
      const reservation = await listen((_request, response) => {
        response.end();
      });
      const { port, origin: mfeOrigin } = reservation;
      await reservation.close();

      const iam = await startIam(mfeOrigin, passkeysEnabled);
      const close = [iam.close];
      try {
        const host = await startChatHost(assets, mfeOrigin, iam.authenticate);
        close.push(host.close);
        iam.approve(host.origin);
        const unapproved = await startChatHost(
          assets,
          mfeOrigin,
          iam.authenticate,
        );
        close.push(unapproved.close);

        const resolve = createRequire(`${process.cwd()}/package.json`).resolve;
        const child = spawn(
          process.execPath,
          [
            resolve("next/dist/bin/next"),
            "dev",
            "--hostname",
            loopback,
            "--port",
            String(port),
          ],
          {
            stdio: ["ignore", "ignore", "inherit"],
            env: {
              ...process.env,
              NODE_ENV: "development",
              NEXT_TELEMETRY_DISABLED: "1",
              IDENTITY_ORIGIN: mfeOrigin,
              CHATBOT_ORIGIN: host.origin,
              IAM_API_URL: iam.origin,
              IAM_ISSUER: iam.origin,
              IAM_JWKS_URL: `${iam.origin}/.well-known/jwks.json`,
              CLIENT_CONFIGURATION_URL: iam.origin,
              SUBSCRIBER_ID: subscriber.id,
              SUBSCRIBER_SECRET: subscriber.secret,
              COOKIE_SECURE: "false",
              SESSION_COOKIE_NAME: sessionCookie,
              SESSION_COOKIE_DOMAIN: "",
              SESSION_COOKIE_SAME_SITE: "lax",
              TRANSACTION_STORE: "memory",
            },
          },
        );
        const stopped = once(child, "close");
        void stopped.catch(() => undefined);
        try {
          await Promise.race([
            waitForNext(
              port,
              () => child.exitCode === null && child.signalCode === null,
            ),
            stopped.then(() => {
              throw new Error("The E2E Next.js server exited during startup.");
            }),
          ]);
          await use({
            mfeOrigin,
            hostOrigin: host.origin,
            unapprovedOrigin: unapproved.origin,
            completionCounts: iam.completionCounts,
            expireMfaChallenges: iam.expireMfaChallenges,
            setNextContextLifetime: iam.setNextContextLifetime,
          });
        } finally {
          child.kill("SIGTERM");
          await stopped;
        }
      } finally {
        await Promise.all(close.map((stop) => stop()));
      }
    },
    { scope: "worker", timeout: 120_000 },
  ],
});
