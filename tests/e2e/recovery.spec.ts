import { expect } from "@playwright/test";
import { identifier, launch, otp, reachMfa } from "./fixtures/chat-launch";
import { test } from "./fixtures/environment";
import { account } from "./fixtures/iam";

test("recovers from an incorrect password and completes MFA", async ({
  page,
  environment,
}) => {
  const frame = await launch(
    page,
    environment.hostOrigin,
    environment.mfeOrigin,
  );
  const continueButton = frame.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  await frame.getByLabel(identifier).fill(account.email);
  await continueButton.click();
  await frame
    .getByLabel("Password", { exact: true })
    .fill("WrongFixturePassword1!");
  const rejected = page.waitForResponse(
    (response) =>
      response.url() === `${environment.mfeOrigin}/api/auth/password`,
  );
  await continueButton.click();
  expect((await rejected).status()).toBe(401);
  await expect(
    frame.getByText("The email or password is incorrect."),
  ).toBeVisible();
  await expect(frame.getByLabel(otp)).toHaveCount(0);
  expect(
    (await page.request.get(`${environment.hostOrigin}/session`)).status(),
  ).toBe(401);

  await frame.getByLabel("Password", { exact: true }).fill(account.password);
  await continueButton.click();
  await frame.getByLabel(otp).fill(account.code);
  await continueButton.click();
  await expect(page.getByRole("status")).toHaveText(
    `Signed in as ${account.name}`,
  );
});

test("resends MFA after the countdown and rejects the replaced code", async ({
  page,
  environment,
}) => {
  await page.clock.install();
  const frame = await reachMfa(
    page,
    environment.hostOrigin,
    environment.mfeOrigin,
  );
  const resend = frame.getByRole("button", { name: /Resend code/ });
  await expect(resend).toBeDisabled();
  await page.clock.runFor(29_000);
  await expect(resend).toBeEnabled();
  const resent = page.waitForResponse(
    (response) =>
      response.url() === `${environment.mfeOrigin}/api/auth/mfa/challenge`,
  );
  await resend.click();
  expect((await resent).status()).toBe(201);
  await expect(resend).toBeDisabled();

  await frame.getByLabel(otp).fill(account.code);
  const continueButton = frame.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  await continueButton.click();
  await expect(
    frame.getByText("That verification code is incorrect."),
  ).toBeVisible();
  expect(
    (await page.request.get(`${environment.hostOrigin}/session`)).status(),
  ).toBe(401);

  await frame.getByLabel(otp).fill("381650");
  await continueButton.click();
  await expect(page.getByRole("status")).toHaveText(
    `Signed in as ${account.name}`,
  );
});

test("rejects an expired MFA code and recovers by resending", async ({
  page,
  environment,
}) => {
  await page.clock.install();
  const frame = await reachMfa(
    page,
    environment.hostOrigin,
    environment.mfeOrigin,
  );
  environment.expireMfaChallenges();
  await frame.getByLabel(otp).fill(account.code);
  const continueButton = frame.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  const rejected = page.waitForResponse(
    (response) =>
      response.url() === `${environment.mfeOrigin}/api/auth/mfa/verify`,
  );
  await continueButton.click();
  expect((await rejected).status()).toBe(410);
  await expect(
    frame.getByText("That verification code has expired."),
  ).toBeVisible();
  expect(
    (await page.request.get(`${environment.hostOrigin}/session`)).status(),
  ).toBe(401);

  await page.clock.runFor(29_000);
  await frame.getByRole("button", { name: "Resend code", exact: true }).click();
  await frame.getByLabel(otp).fill("381650");
  await continueButton.click();
  await expect(page.getByRole("status")).toHaveText(
    `Signed in as ${account.name}`,
  );
});
