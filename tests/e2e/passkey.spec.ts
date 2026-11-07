import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { identifier, iframe, launch, otp } from "./fixtures/chat-launch";
import { test } from "./fixtures/environment";
import { account, clientId } from "./fixtures/iam";

test.use({ passkeysEnabled: true });

test("registers a passkey, rejects a tampered assertion, and signs back in", async ({
  page,
  context,
  environment,
}) => {
  test.setTimeout(90_000);
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
  // Drive the explicit Continue path even when the browser supports passkey autofill.
  await page.addInitScript(() => {
    if (window.PublicKeyCredential) {
      PublicKeyCredential.isConditionalMediationAvailable = async () => false;
    }
  });

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
