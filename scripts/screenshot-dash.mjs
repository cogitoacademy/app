import puppeteer from "puppeteer";
import { join, dirname } from "path";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3000";
const OUT = join(__dirname, "screenshots");
mkdirSync(OUT, { recursive: true });

const EMAIL = "testuser@cogito.test";
const PASS = "TestPass123!";

const browser = await puppeteer.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.waitForSelector('input[name="email"]', { timeout: 10000 });
await page.type('input[name="email"]', EMAIL);
await page.type('input[name="password"]', PASS);
await page.click('button[type="submit"]');
await new Promise(r => setTimeout(r, 3000));

try {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  const path = join(OUT, "02-dashboard.png");
  await page.screenshot({ path, fullPage: true });
  console.log("✅ 02-dashboard.png");
} catch (e) {
  console.log(`❌ dashboard: ${e.message}`);
}

await browser.close();
