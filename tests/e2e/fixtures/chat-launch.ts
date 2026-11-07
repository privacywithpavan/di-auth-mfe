import { expect, type Page, type Request } from "@playwright/test";
import { account } from "./iam";

export const launchButton = "Sign in or create an account";
export const iframe = 'iframe[title="Authentication"]';
export const identifier = "Email or phone number";
export const otp = "Enter 6-digit code";

export async function openChat(
  page: Page,
  hostOrigin: string,
  mfeOrigin: string,
) {
  const requestsBeforeSignIn: string[] = [];
  const observe = (request: Request) => {
    const url = new URL(request.url());
    if (url.origin === mfeOrigin) requestsBeforeSignIn.push(url.pathname);
  };
  page.on("request", observe);

  await page.goto(hostOrigin);
  await expect(
    page.getByRole("heading", { name: "Virtual Assistant" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Ask the assistant" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Signed out");
  await expect(page.locator(iframe)).toHaveCount(0);
  expect(requestsBeforeSignIn).toEqual([]);
  page.off("request", observe);
  const button = page.getByRole("button", { name: launchButton });
  await expect(button).toBeEnabled();
  return button;
}

export async function launch(
  page: Page,
  hostOrigin: string,
  mfeOrigin: string,
) {
  const button = await openChat(page, hostOrigin, mfeOrigin);
  await button.click();
  const frame = page.frameLocator(iframe);
  // The first click can trigger a cold Next.js compilation.
  await expect(frame.getByLabel(identifier)).toBeVisible({ timeout: 35_000 });
  return frame;
}

export async function reachMfa(
  page: Page,
  hostOrigin: string,
  mfeOrigin: string,
) {
  const frame = await launch(page, hostOrigin, mfeOrigin);
  const continueButton = frame.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  await frame.getByLabel(identifier).fill(account.email);
  await continueButton.click();
  await frame.getByLabel("Password", { exact: true }).fill(account.password);
  await continueButton.click();
  await expect(frame.getByLabel(otp)).toBeVisible();
  return frame;
}
