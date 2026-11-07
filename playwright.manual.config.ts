import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  testMatch: "**/chat.manual.ts",
  timeout: 0,
  use: {
    headless: false,
    launchOptions: {
      ignoreDefaultArgs: ["--use-mock-keychain", "--password-store=basic"],
    },
  },
});
