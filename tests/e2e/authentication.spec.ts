import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import {
  identifier,
  iframe,
  launch,
  launchButton,
  otp,
  reachMfa,
} from "./fixtures/chat-launch";
import { test } from "./fixtures/environment";
import { account, clientId, sessionCookie } from "./fixtures/iam";

test("signs in inline, recognizes the session after reload, and logs out", async ({
  page,
  context,
  environment,
}) => {
  const frame = await reachMfa(
    page,
    environment.hostOrigin,
    environment.mfeOrigin,
  );
  await expect(page.getByRole("status")).toHaveText("Signed out");
  expect(
    (await context.cookies(environment.hostOrigin)).some(
      ({ name }) => name === sessionCookie,
    ),
  ).toBe(false);

  await frame.getByLabel(otp).fill(account.code);
  await frame.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("status")).toHaveText(
    `Signed in as ${account.name}`,
  );
  await expect(page.locator(iframe)).toHaveCount(0);
  const cookie = (await context.cookies(environment.hostOrigin)).find(
    ({ name }) => name === sessionCookie,
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.path).toBe("/");

  await page.reload();
  await expect(page.getByRole("status")).toHaveText(
    `Signed in as ${account.name}`,
  );
  await expect(page.getByRole("heading", { name: "Hi Test" })).toBeVisible();
  await expect(page.getByRole("button", { name: launchButton })).toBeHidden();
  await page.getByRole("button", { name: "Join Dell Rewards" }).click();
  await expect(
    page.getByText(/Your IAM session was independently verified/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("status")).toHaveText("Signed out");
  await expect(page.getByRole("button", { name: launchButton })).toBeVisible();
  expect(
    (await context.cookies(environment.hostOrigin)).some(
      ({ name }) => name === sessionCookie,
    ),
  ).toBe(false);
});

test("rejects an invalid OTP without issuing a session", async ({
  page,
  environment,
}) => {
  const frame = await reachMfa(
    page,
    environment.hostOrigin,
    environment.mfeOrigin,
  );
  await frame.getByLabel(otp).fill("000000");
  await frame.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    frame.getByText("That verification code is incorrect."),
  ).toBeVisible();

  const session = await page.request.get(`${environment.hostOrigin}/session`);
  expect(session.status()).toBe(401);
});

test("cancels the inline flow and allows a fresh launch", async ({
  page,
  environment,
}) => {
  const frame = await launch(
    page,
    environment.hostOrigin,
    environment.mfeOrigin,
  );
  await frame.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Sign in cancelled");
  await expect(
    page.getByRole("heading", { name: "Sign in or new account canceled" }),
  ).toBeVisible();
  await expect(page.locator(iframe)).toHaveCount(0);

  await page.getByRole("button", { name: launchButton }).click();
  await expect(frame.getByLabel(identifier)).toBeVisible();
});

test("blocks framing from an unapproved origin", async ({
  page,
  environment,
}) => {
  await page.goto(environment.unapprovedOrigin);
  const blocked = page.waitForEvent("console", {
    predicate: (message) =>
      message.type() === "error" && message.text().includes("frame-ancestors"),
  });
  await page.getByRole("button", { name: launchButton }).click();
  await blocked;
  await expect(page.frameLocator(iframe).getByLabel(identifier)).toHaveCount(0);
});

test("shows the approved-host screen on direct navigation", async ({
  page,
  environment,
}) => {
  const url = new URL(environment.mfeOrigin);
  url.search = new URLSearchParams({
    clientId,
    state: randomUUID(),
  }).toString();
  await page.goto(url.href);
  await expect(
    page.getByText(/Start again from the approved ChatHost/),
  ).toBeVisible();
  await expect(page.getByLabel(identifier)).toHaveCount(0);
});
