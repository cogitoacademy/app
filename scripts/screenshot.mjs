import puppeteer from "puppeteer";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const BASE = "http://localhost:3000";
const OUT = join(import.meta.dir, "screenshots");
mkdirSync(OUT, { recursive: true });

const EMAIL = "testuser@cogito.test";
const PASS = "TestPass123!";

const pages = [
  { route: "/login", name: "01-login" },
  { route: "/dashboard", name: "02-dashboard" },
  { route: "/balance", name: "03-balance" },
  { route: "/bookings", name: "04-bookings" },
  { route: "/achievements", name: "05-achievements" },
  { route: "/tutors", name: "06-tutors" },
  { route: "/profile", name: "07-profile" },
];

const browser = await puppeteer.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// Login first
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.waitForSelector('input[name="email"]', { timeout: 10000 });
await page.type('input[name="email"]', EMAIL);
await page.type('input[name="password"]', PASS);
await page.click('button[type="submit"]');
await new Promise(r => setTimeout(r, 3000));

// Screenshot each page
for (const p of pages) {
  try {
    await page.goto(`${BASE}${p.route}`, { waitUntil: "networkidle0", timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    const path = join(OUT, `${p.name}.png`);
    await page.screenshot({ path, fullPage: true });
    console.log(`✅ ${p.name}.png`);
  } catch (e) {
    console.log(`❌ ${p.name}: ${e.message}`);
  }
}

await browser.close();
console.log("Done!");
