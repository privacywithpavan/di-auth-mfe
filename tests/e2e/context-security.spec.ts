import { randomUUID } from "node:crypto";
import { type APIResponse, expect, type Page } from "@playwright/test";
import { identifier, launch, otp } from "./fixtures/chat-launch";
import { test } from "./fixtures/environment";
import { account, clientId, sessionCookie } from "./fixtures/iam";

type InitializedContext = {
  contextId: string;
  csrfToken: string;
  state: string;
};
type Origins = { hostOrigin: string; mfeOrigin: string };

async function start(page: Page, environment: Origins) {
  const initialized = page.waitForResponse(
    (response) =>
      response.url() === `${environment.mfeOrigin}/api/auth/contexts` &&
      response.request().method() === "POST",
  );
  const frame = await launch(
    page,
    environment.hostOrigin,
    environment.mfeOrigin,
  );
  const response = await initialized;
  expect(response.status()).toBe(201);
  return { frame, initialized: (await response.json()) as InitializedContext };
}

async function rejected(response: APIResponse, status: number, code: string) {
  expect(response.status()).toBe(status);
  expect(await response.json()).toMatchObject({ code });
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["set-cookie"] ?? "").not.toContain(sessionCookie);
}

function headers(environment: Origins, initialized: InitializedContext) {
  return {
    Origin: environment.mfeOrigin,
    "X-CSRF-Token": initialized.csrfToken,
  };
}

const securityCases = [
  {
    name: "missing CSRF token",
    expected: "CSRF_VALIDATION_FAILED",
    csrf: undefined,
    origin: "valid",
  },
  {
    name: "incorrect CSRF token",
    expected: "CSRF_VALIDATION_FAILED",
    csrf: "incorrect-csrf-token",
    origin: "valid",
  },
  {
    name: "missing Origin",
    expected: "UNTRUSTED_ORIGIN",
    csrf: "valid",
    origin: undefined,
  },
  {
    name: "incorrect Origin",
    expected: "UNTRUSTED_ORIGIN",
    csrf: "valid",
    origin: "unapproved",
  },
];

for (const scenario of securityCases) {
  test(`rejects a password request with ${scenario.name}`, async ({
    page,
    environment,
  }) => {
    const { initialized } = await start(page, environment);
    const requestHeaders: Record<string, string> = {};
    if (scenario.csrf)
      requestHeaders["X-CSRF-Token"] =
        scenario.csrf === "valid" ? initialized.csrfToken : scenario.csrf;
    if (scenario.origin)
      requestHeaders.Origin =
        scenario.origin === "valid"
          ? environment.mfeOrigin
          : environment.unapprovedOrigin;

    await rejected(
      await page.request.post(`${environment.mfeOrigin}/api/auth/password`, {
        headers: requestHeaders,
        data: {
          contextId: initialized.contextId,
          username: account.email,
          password: account.password,
        },
      }),
      403,
      scenario.expected,
    );
    expect(
      (await page.request.get(`${environment.hostOrigin}/session`)).status(),
    ).toBe(401);
  });
}

test("rejects a context belonging to another browser", async ({
  page,
  browser,
  environment,
}) => {
  const first = await start(page, environment);
  const other = await browser.newContext();
  try {
    const secondPage = await other.newPage();
    const second = await start(secondPage, environment);
    await rejected(
      await secondPage.request.post(
        `${environment.mfeOrigin}/api/auth/password`,
        {
          headers: headers(environment, second.initialized),
          data: {
            contextId: first.initialized.contextId,
            username: account.email,
            password: account.password,
          },
        },
      ),
      403,
      "BROWSER_BINDING_MISMATCH",
    );
    expect(
      (
        await secondPage.request.get(`${environment.hostOrigin}/session`)
      ).status(),
    ).toBe(401);
  } finally {
    await other.close();
  }
});

test("rejects a context after its browser-binding cookie is removed", async ({
  page,
  context,
  environment,
}) => {
  const { initialized } = await start(page, environment);
  await context.clearCookies({ name: "iam_poc_browser" });
  await rejected(
    await page.request.post(`${environment.mfeOrigin}/api/auth/password`, {
      headers: headers(environment, initialized),
      data: {
        contextId: initialized.contextId,
        username: account.email,
        password: account.password,
      },
    }),
    403,
    "BROWSER_BINDING_MISMATCH",
  );
});

test("rejects initialization with a previously consumed state", async ({
  page,
  environment,
}) => {
  const { frame, initialized } = await start(page, environment);
  await rejected(
    await page.request.post(`${environment.mfeOrigin}/api/auth/contexts`, {
      headers: headers(environment, initialized),
      data: { clientId, state: initialized.state },
    }),
    409,
    "STATE_ALREADY_USED",
  );

  await frame.getByLabel(identifier).fill(account.email);
  await frame.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(frame.getByLabel("Password", { exact: true })).toBeVisible();
});

test("rejects MFA verification before the password factor", async ({
  page,
  environment,
}) => {
  const { initialized } = await start(page, environment);
  await rejected(
    await page.request.post(`${environment.mfeOrigin}/api/auth/mfa/verify`, {
      headers: headers(environment, initialized),
      data: { contextId: initialized.contextId, code: account.code },
    }),
    409,
    "INVALID_CONTEXT_STATE",
  );
});

test("rejects an unknown context", async ({ page, environment }) => {
  const { initialized } = await start(page, environment);
  await rejected(
    await page.request.post(`${environment.mfeOrigin}/api/auth/password`, {
      headers: headers(environment, initialized),
      data: {
        contextId: randomUUID(),
        username: account.email,
        password: account.password,
      },
    }),
    410,
    "CONTEXT_EXPIRED",
  );
});

test("rejects an expired authentication context", async ({
  page,
  environment,
}) => {
  environment.setNextContextLifetime(2_000);
  const { initialized } = await start(page, environment);
  await expect
    .poll(
      async () => {
        const response = await page.request.post(
          `${environment.mfeOrigin}/api/auth/mfa/verify`,
          {
            headers: headers(environment, initialized),
            data: { contextId: initialized.contextId, code: account.code },
          },
        );
        return {
          status: response.status(),
          code: (await response.json()).code,
        };
      },
      { timeout: 10_000, intervals: [100, 250, 500] },
    )
    .toEqual({ status: 410, code: "CONTEXT_EXPIRED" });
  expect(
    (await page.request.get(`${environment.hostOrigin}/session`)).status(),
  ).toBe(401);
});

test("rejects continuing a cancelled context", async ({
  page,
  environment,
}) => {
  const { frame, initialized } = await start(page, environment);
  await frame.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Sign in cancelled");
  await rejected(
    await page.request.post(`${environment.mfeOrigin}/api/auth/password`, {
      headers: headers(environment, initialized),
      data: {
        contextId: initialized.contextId,
        username: account.email,
        password: account.password,
      },
    }),
    409,
    "INVALID_CONTEXT_STATE",
  );
});

test("rejects reusing a completed context and preserves the session", async ({
  page,
  environment,
}) => {
  const { frame, initialized } = await start(page, environment);
  const continueButton = frame.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  await frame.getByLabel(identifier).fill(account.email);
  await continueButton.click();
  await frame.getByLabel("Password", { exact: true }).fill(account.password);
  await continueButton.click();
  await frame.getByLabel(otp).fill(account.code);
  await continueButton.click();
  await expect(page.getByRole("status")).toHaveText(
    `Signed in as ${account.name}`,
  );
  await rejected(
    await page.request.post(`${environment.mfeOrigin}/api/auth/password`, {
      headers: headers(environment, initialized),
      data: {
        contextId: initialized.contextId,
        username: account.email,
        password: account.password,
      },
    }),
    409,
    "INVALID_CONTEXT_STATE",
  );
  expect(
    (await page.request.get(`${environment.hostOrigin}/session`)).status(),
  ).toBe(200);
});
