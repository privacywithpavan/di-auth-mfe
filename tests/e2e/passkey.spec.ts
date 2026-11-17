import { randomUUID } from "node:crypto";
import { type BrowserContext, expect, type Page } from "@playwright/test";
import {
  identifier,
  iframe,
  launch,
  otp,
  reachMfa,
} from "./fixtures/chat-launch";
import { test } from "./fixtures/environment";
import {
  account,
  clientId,
  recoveryPasskeyAccount,
  sessionCookie,
  skipPasskeyAccount,
} from "./fixtures/iam";

test.use({ passkeysEnabled: true });

async function virtualAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  return { cdp, authenticatorId };
}

test.beforeEach(async ({ page }) => {
  // Drive the explicit Continue path even when the browser supports passkey autofill.
  await page.addInitScript(() => {
    if (window.PublicKeyCredential) {
      PublicKeyCredential.isConditionalMediationAvailable = async () => false;
    }
  });
});

test("registers a passkey, rejects a tampered assertion, and signs back in", async ({
  page,
  context,
  environment,
}) => {
  test.setTimeout(90_000);
  const { cdp, authenticatorId } = await virtualAuthenticator(context, page);

  const email = `passkey-${randomUUID()}@example.test`;
  const status = page.getByRole("status");
  const sessionUrl = `${environment.mfeOrigin}/api/auth/session?clientId=${clientId}`;
  const frame = await launch(
    page,
    environment.hostOrigin,
    environment.mfeOrigin,
  );
  const continueButton = frame.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  await frame.getByLabel(identifier).fill(email);
  await continueButton.click();
  await expect(
    frame.getByRole("heading", { name: "Verify your email" }),
  ).toBeVisible();
  await frame.getByLabel(otp).fill(account.code);
  await continueButton.click();
  await frame.getByLabel("First name").fill("Passkey");
  await frame.getByLabel("Last name").fill("Tester");
  await expect(frame.getByRole("radio", { name: /^Passkey/ })).toBeChecked();
  await continueButton.click();

  await frame
    .getByRole("checkbox", {
      name: "I agree to the account terms and privacy statement.",
    })
    .check();
  await expect(status).toHaveText("Signed out");
  await frame.getByRole("button", { name: "Create Account" }).click();
  await expect(status).toHaveText("Signed in as Passkey Tester");
  const { credentials } = await cdp.send("WebAuthn.getCredentials", {
    authenticatorId,
  });
  expect(credentials).toHaveLength(1);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(status).toHaveText("Signed out");

  const verifyPath = `${environment.mfeOrigin}/api/auth/passkey/verify`;
  await page.route(
    verifyPath,
    async (route) => {
      const input = route.request().postDataJSON();
      const signature = Buffer.from(
        input.credential.response.signature,
        "base64url",
      );
      signature[signature.length - 1] ^= 1;
      input.credential.response.signature = signature.toString("base64url");
      await route.continue({ postData: input });
    },
    { times: 1 },
  );

  await launch(page, environment.hostOrigin, environment.mfeOrigin);
  await frame.getByLabel(identifier).fill(email);
  const rejected = page.waitForResponse(
    (response) => response.url() === verifyPath,
  );
  await continueButton.click();
  expect((await rejected).status()).toBe(401);
  await expect(
    frame.getByText("Passkey verification failed. Please try again."),
  ).toBeVisible();
  expect((await page.request.get(sessionUrl)).status()).toBe(401);

  await continueButton.click();
  await expect(status).toHaveText("Signed in as Passkey Tester");
  await expect(page.locator(iframe)).toHaveCount(0);
  const session = await page.request.get(sessionUrl);
  expect(session.ok()).toBe(true);
  expect(await session.json()).toMatchObject({
    authenticated: true,
    amr: ["fido", "uv"],
  });

  await page.reload();
  await expect(status).toHaveText("Signed in as Passkey Tester");
  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  await cdp.detach();
});

test("adds a passkey after password and OTP and later signs in with either method", async ({
  page,
  context,
  environment,
}) => {
  test.setTimeout(90_000);
  const { cdp, authenticatorId } = await virtualAuthenticator(context, page);
  const status = page.getByRole("status");
  const sessionUrl = `${environment.mfeOrigin}/api/auth/session?clientId=${clientId}`;
  const frame = await reachMfa(
    page,
    environment.hostOrigin,
    environment.mfeOrigin,
  );
  const continueButton = frame.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  await frame.getByLabel(otp).fill(account.code);
  await continueButton.click();
  await expect(
    frame.getByRole("heading", { name: "Protect your account" }),
  ).toBeVisible();
  await expect(frame.getByText("Recommended", { exact: true })).toBeVisible();
  await expect(status).toHaveText("Signed out");
  expect((await page.request.get(sessionUrl)).status()).toBe(401);
  expect(
    (await cdp.send("WebAuthn.getCredentials", { authenticatorId }))
      .credentials,
  ).toHaveLength(0);

  await frame.getByRole("button", { name: "Add a Passkey" }).click();
  await expect(status).toHaveText(`Signed in as ${account.name}`);
  expect(
    (await cdp.send("WebAuthn.getCredentials", { authenticatorId }))
      .credentials,
  ).toHaveLength(1);
  expect(await (await page.request.get(sessionUrl)).json()).toMatchObject({
    authenticated: true,
    amr: ["pwd", "otp"],
  });

  await page.getByRole("button", { name: "Log out" }).click();
  await launch(page, environment.hostOrigin, environment.mfeOrigin);
  await frame.getByLabel(identifier).fill(account.email);
  await continueButton.click();
  await frame.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(status).toHaveText(`Signed in as ${account.name}`);
  expect(await (await page.request.get(sessionUrl)).json()).toMatchObject({
    authenticated: true,
    amr: ["fido", "uv"],
  });

  await page.getByRole("button", { name: "Log out" }).click();
  await reachMfa(page, environment.hostOrigin, environment.mfeOrigin);
  await frame.getByLabel(otp).fill(account.code);
  await continueButton.click();
  // The enrolled account still accepts password plus OTP and goes straight to the session.
  await expect(status).toHaveText(`Signed in as ${account.name}`);
});

test("skips adding a passkey and finishes password sign-in", async ({
  page,
  environment,
}) => {
  const status = page.getByRole("status");
  const frame = await reachMfa(
    page,
    environment.hostOrigin,
    environment.mfeOrigin,
    skipPasskeyAccount,
  );
  const continueButton = frame.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  const skip = frame.getByRole("button", { name: "Skip for now" });
  await frame.getByLabel(otp).fill(account.code);
  await continueButton.click();
  await expect(skip).toBeVisible();
  expect(
    (await page.request.get(`${environment.hostOrigin}/session`)).status(),
  ).toBe(401);
  await skip.click();
  await expect(status).toHaveText(`Signed in as ${skipPasskeyAccount.name}`);
  await expect(page.locator(iframe)).toHaveCount(0);

  await page.getByRole("button", { name: "Log out" }).click();
  await reachMfa(
    page,
    environment.hostOrigin,
    environment.mfeOrigin,
    skipPasskeyAccount,
  );
  await frame.getByLabel(otp).fill(account.code);
  await continueButton.click();
  await expect(skip).toBeVisible();
});

test("recovers a dropped enrollment response without creating another passkey or session", async ({
  browser,
  page,
  context,
  environment,
}) => {
  test.setTimeout(90_000);
  const { cdp, authenticatorId } = await virtualAuthenticator(context, page);
  const frame = await reachMfa(
    page,
    environment.hostOrigin,
    environment.mfeOrigin,
    recoveryPasskeyAccount,
  );
  await frame.getByLabel(otp).fill(account.code);
  await frame.getByRole("button", { name: "Continue", exact: true }).click();
  const add = frame.getByRole("button", { name: "Add a Passkey" });
  await expect(add).toBeEnabled();

  const before = environment.completionCounts();
  const endpoint = `${environment.mfeOrigin}/api/auth/passkey/enrollment`;
  let lostResponse: { status: number; issuedCookie: boolean } | undefined;
  let completion: { contextId: string; completionId: string } | undefined;
  await page.route(
    `${endpoint}/verify`,
    async (route) => {
      try {
        const request = route.request();
        const { contextId, completionId } = request.postDataJSON();
        completion = { contextId, completionId };
        // Node forwards the request without applying Set-Cookie to Chromium's cookie store.
        const headers = await request.allHeaders();
        const response = await fetch(request.url(), {
          method: request.method(),
          headers: {
            "Content-Type": "application/json",
            Cookie: headers.cookie,
            Origin: headers.origin,
            "X-CSRF-Token": headers["x-csrf-token"],
          },
          body: request.postData(),
          signal: AbortSignal.timeout(20_000),
        });
        lostResponse = {
          status: response.status,
          issuedCookie: response.headers
            .getSetCookie()
            .some((cookie) => cookie.startsWith(`${sessionCookie}=`)),
        };
        await response.arrayBuffer();
      } finally {
        await route.abort();
      }
    },
    { times: 1 },
  );

  await add.click();
  const retry = frame.getByRole("button", { name: "Retry sign-in" });
  await expect(retry).toBeEnabled();
  expect(lostResponse).toEqual({ status: 200, issuedCookie: true });
  const committed = {
    passkeyEnrollments: before.passkeyEnrollments + 1,
    sessionsIssued: before.sessionsIssued + 1,
  };
  expect(environment.completionCounts()).toEqual(committed);
  const status = page.getByRole("status");
  await expect(status).toHaveText("Signed out");
  expect(
    (await context.cookies(environment.hostOrigin)).some(
      ({ name }) => name === sessionCookie,
    ),
  ).toBe(false);
  if (!completion)
    throw new Error("The interrupted request did not have a completion ID.");

  const otherBrowser = await browser.newContext();
  try {
    const bootstrap = await otherBrowser.request.get(
      `${environment.mfeOrigin}/api/auth/bootstrap?clientId=${clientId}`,
    );
    expect(bootstrap.ok()).toBe(true);
    const { csrfToken } = await bootstrap.json();
    const denied = await otherBrowser.request.post(`${endpoint}/resume`, {
      headers: { Origin: environment.mfeOrigin, "X-CSRF-Token": csrfToken },
      data: completion,
    });
    expect(denied.status()).toBe(403);
    expect(await denied.json()).toMatchObject({
      code: "BROWSER_BINDING_MISMATCH",
    });
  } finally {
    await otherBrowser.close();
  }

  await retry.click();
  await expect(status).toHaveText(
    `Signed in as ${recoveryPasskeyAccount.name}`,
  );
  await expect(page.locator(iframe)).toHaveCount(0);
  expect(environment.completionCounts()).toEqual(committed);
  const { credentials } = await cdp.send("WebAuthn.getCredentials", {
    authenticatorId,
  });
  expect(credentials).toHaveLength(1);
  const session = await page.request.get(
    `${environment.mfeOrigin}/api/auth/session?clientId=${clientId}`,
  );
  expect(session.ok()).toBe(true);
  expect(await session.json()).toMatchObject({
    authenticated: true,
    amr: ["pwd", "otp"],
  });
});
