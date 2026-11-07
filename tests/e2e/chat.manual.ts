import { openChat } from "./fixtures/chat-launch";
import { test } from "./fixtures/environment";

test.use({ passkeysEnabled: true });

test("opens the chat for manual sign-in", async ({ page, environment }) => {
  await openChat(page, environment.hostOrigin, environment.mfeOrigin);

  process.stdout.write(
    "The chat is ready. Click Sign in or create an account in Chromium. Close the tab when finished.\n",
  );
  await page.waitForEvent("close", { timeout: 0 });
});
