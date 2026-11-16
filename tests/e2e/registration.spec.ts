import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { identifier, launch, otp } from "./fixtures/chat-launch";
import { test } from "./fixtures/environment";
import { account, clientId } from "./fixtures/iam";

test.use({ passkeysEnabled: true });

test("registers a password account and signs back in with password and MFA", async ({
  page,
  environment,
}) => {
  test.setTimeout(90_000);
  // Exercise password registration without starting a conditional passkey request.
  await page.addInitScript(() => {
    if (window.PublicKeyCredential) {
      PublicKeyCredential.isConditionalMediationAvailable = async () => false;
    }
  });
  const email = `password-${randomUUID()}@example.test`;
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

  await frame.getByLabel("First name").fill("Password");
  await frame.getByLabel("Last name").fill("Tester");
  await frame
    .getByText("Password with two-step verification", { exact: true })
    .click();
  await expect(
    frame.getByRole("radio", { name: /^Password with two-step verification/ }),
  ).toBeChecked();
  await frame.getByLabel("Password", { exact: true }).fill(account.password);
  await continueButton.click();

  const create = frame.getByRole("button", { name: "Create Account" });
  const terms = frame.getByRole("checkbox", {
    name: "I agree to the account terms and privacy statement.",
  });
  await expect(terms).not.toBeChecked();
  expect(
    (await page.request.get(`${environment.hostOrigin}/session`)).status(),
  ).toBe(401);
  await terms.check();
  await create.click();
  await expect(page.getByRole("status")).toHaveText(
    "Signed in as Password Tester",
  );

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("status")).toHaveText("Signed out");
  await launch(page, environment.hostOrigin, environment.mfeOrigin);
  await frame.getByLabel(identifier).fill(email);
  await continueButton.click();
  await expect(
    frame.getByRole("heading", { name: "Verify your identity" }),
  ).toBeVisible();
  await frame.getByLabel("Password", { exact: true }).fill(account.password);
  await continueButton.click();
  await frame.getByLabel(otp).fill(account.code);
  await continueButton.click();
  await frame.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Signed in as Password Tester",
  );

  const session = await page.request.get(
    `${environment.mfeOrigin}/api/auth/session?clientId=${clientId}`,
  );
  expect(session.ok()).toBe(true);
  expect(await session.json()).toMatchObject({
    authenticated: true,
    amr: ["pwd", "otp"],
  });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText(
    "Signed in as Password Tester",
  );
});
