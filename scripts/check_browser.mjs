// Run against the production build. Requires Google Chrome (or BROWSER_CHANNEL).
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const server = spawn(
  "npm",
  ["run", "preview", "--", "--port", "4174", "--strictPort"],
  { stdio: "ignore", cwd: new URL("..", import.meta.url) },
);
const url = "http://127.0.0.1:4174/";
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (attempt === 50) throw new Error("Preview server did not start");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await mkdir("test-results", { recursive: true });
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    args: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await expect(page.locator(".total strong")).toHaveText("724,638");
  await expect(page.getByRole("button", { name: "Reset view" })).toBeEnabled({
    timeout: 30000,
  });
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(page.locator(".maplibregl-ctrl-scale")).toContainText("5 km");
  await page.getByRole("button", { name: "Reset view" }).click();
  await page.selectOption("#election", "2022");
  await expect(page.locator(".total strong")).toHaveText("551,890");
  await expect(page.locator(".outcome")).toContainText("John Tory elected");
  await page.selectOption("#election", "2023");
  await expect(page.locator(".total strong")).toHaveText("724,638");
  await page.selectOption("#election", "2018");
  await expect(page.locator(".total strong")).toHaveText("755,493");
  await page.selectOption("#election", "2023");
  await page.selectOption("#election", "2014");
  await expect(page.locator(".outcome")).toContainText("John Tory elected");
  await page.selectOption("#election", "2010");
  await expect(page.locator(".outcome")).toContainText("Rob Ford elected");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/2010.png" });
  await page.selectOption("#election", "2006");
  await expect(page.locator(".outcome")).toContainText("David Miller elected");
  await page.selectOption("#election", "2023");
  await page.waitForTimeout(6000);
  await page.screenshot({ path: "test-results/desktop.png" });
  const box = await page.locator(".map").boundingBox();
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await expect(page.locator(".results h3")).toBeVisible();
  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(page.locator(".results h3")).toHaveCount(0);
  await expect(page.locator(".candidate-list li")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  assert.deepEqual(errors, []);

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  mobile.on("pageerror", (error) => errors.push(error.message));
  await mobile.goto(url);
  await expect(mobile.getByRole("button", { name: "Reset view" })).toBeEnabled({
    timeout: 30000,
  });
  await expect(mobile.locator(".results")).toBeVisible();
  await expect(mobile.locator(".candidate-list li")).toHaveCount(3);
  await mobile.getByRole("button", { name: "Hide results" }).click();
  await expect(mobile.getByRole("button", { name: "Results" })).toBeVisible();
  await mobile.getByRole("button", { name: "Results" }).click();
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await mobile.locator(".map-frame").scrollIntoViewIfNeeded();
  await mobile.waitForTimeout(2000);
  await mobile.screenshot({ path: "test-results/mobile.png" });
  const mb = await mobile.locator(".map").boundingBox();
  await mobile.touchscreen.tap(mb.x + mb.width * 0.6, mb.y + mb.height * 0.4);
  await expect(mobile.locator(".results h3")).toBeVisible();
  assert.deepEqual(errors, []);

  const failed = await browser.newPage();
  await failed.route("**/data/results.json", (route) => route.abort());
  await failed.goto(url);
  await expect(failed.getByRole("alert")).toContainText(
    "Election data could not be loaded",
  );
  await expect(
    failed.getByRole("button", { name: "Reload", exact: true }),
  ).toBeVisible();
  const noStyle = await browser.newPage();
  await noStyle.route(
    "https://tiles.openfreemap.org/styles/positron",
    (route) => route.abort(),
  );
  await noStyle.goto(url);
  await expect(noStyle.getByRole("alert")).toContainText(
    "Street map unavailable",
  );
  await expect(
    noStyle.getByRole("button", { name: "Reset view" }),
  ).toBeEnabled();
  const noTiles = await browser.newPage();
  await noTiles.route("**/*.pbf", (route) => route.abort());
  await noTiles.goto(url);
  await expect(noTiles.getByRole("alert")).toContainText(
    "Some map resources could not load",
    { timeout: 30000 },
  );
  await expect(noTiles.locator(".total strong")).toHaveText("724,638");
  console.log(
    "PASS: production desktop/mobile, election switches, map clicks/taps, and data/style/tile failures",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
