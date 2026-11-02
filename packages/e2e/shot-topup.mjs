import fs from "node:fs";
import { chromium } from "@playwright/test";

const envText = fs.readFileSync("../../apps/server/.env", "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto("http://localhost:3000/login");
await page.getByLabel("Email").fill("admin@cogitoacademy.id");
await page
  .getByLabel("Password", { exact: true })
  .fill(env.SEED_ADMIN_PASSWORD);
await page.getByRole("button", { name: "Sign In", exact: true }).click();
await page.waitForURL(/\/(dashboard|verify-email)/, { timeout: 30_000 });
await page.goto("http://localhost:3000/admin-economy");
await page.getByRole("heading", { name: "Rate card" }).waitFor();
await page.getByRole("heading", { name: "Price example" }).scrollIntoViewIfNeeded();
await page.screenshot({
  path: "test-results/finance-layout/economy-topup.png",
});
await browser.close();
console.log("ok");
