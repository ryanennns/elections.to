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
  const chooseElection = async (page, label) => {
    await page.getByRole("button", { name: /^Election/ }).click();
    await page.getByRole("option", { name: label, exact: true }).click();
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await expect(page.locator(".total strong")).toHaveText("724,638");
  await expect(page.getByRole("button", { name: "Reset view" })).toBeEnabled({
    timeout: 30000,
  });
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Reset view" }).click();
  await page.getByRole("button", { name: /^Election/ }).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator(".total strong")).toHaveText("551,890");
  await expect(page.locator(".outcome")).toContainText("John Tory elected");
  await chooseElection(page, "2023 · Mayoral by-election");
  await expect(page.locator(".total strong")).toHaveText("724,638");
  await chooseElection(page, "2018 · Municipal election");
  await expect(page.locator(".total strong")).toHaveText("755,493");
  await chooseElection(page, "2023 · Mayoral by-election");
  await chooseElection(page, "2014 · Municipal election");
  await expect(page.locator(".outcome")).toContainText("John Tory elected");
  await chooseElection(page, "2010 · Municipal election");
  await expect(page.locator(".outcome")).toContainText("Rob Ford elected");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/2010.png" });
  await chooseElection(page, "2006 · Municipal election");
  await expect(page.locator(".outcome")).toContainText("David Miller elected");
  await chooseElection(page, "2003 · Municipal election");
  await expect(page.locator(".total strong")).toHaveText("692,085");
  await expect(page.locator(".outcome")).toContainText("David Miller elected");
  await expect(page.locator(".result-scope")).toContainText("699,483 voted");
  await chooseElection(page, "2000 · Municipal election");
  await expect(page.locator(".total strong")).toHaveText("604,394");
  await expect(page.locator(".outcome")).toContainText("Mel Lastman elected");
  await expect(page.locator(".scope-note")).toHaveText(
    "Citywide mayoral result · no polling-area data",
  );
  await chooseElection(page, "1997 · Municipal election");
  await expect(page.locator(".total strong")).toHaveText("749,897");
  await expect(page.locator(".outcome")).toContainText("Mel Lastman elected");
  await chooseElection(page, "2023 · Mayoral by-election");
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
  await expect(mobile.locator(".reset")).toBeHidden();
  await expect(mobile.locator(".maplibregl-ctrl-attrib")).toBeHidden();
  await expect(mobile.locator(".results")).toBeVisible();
  await expect(mobile.locator(".candidate-list li")).toHaveCount(3);
  await expect(mobile.locator("select#election")).toBeVisible();
  const mapFrame = await mobile.locator(".map-frame").boundingBox();
  assert.equal(Math.round(mapFrame.y + mapFrame.height), 844);
  await mobile.selectOption("select#election", "2022");
  await expect(mobile.locator(".total strong")).toHaveText("551,890");
  await mobile.selectOption("select#election", "2023");
  await expect(mobile.locator(".total strong")).toHaveText("724,638");
  await mobile.getByRole("button", { name: "Hide results" }).click();
  const reopen = mobile.getByRole("button", { name: "Results", exact: true });
  await mobile.waitForTimeout(90);
  assert.equal(
    Math.round((await mobile.locator(".results").boundingBox()).width),
    320,
  );
  await expect(reopen).toBeVisible();
  assert.ok(
    Math.abs(
      Math.round(
        (await reopen.boundingBox()).x + (await reopen.boundingBox()).width,
      ) - 376,
    ) <= 1,
  );
  await reopen.click();
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await mobile.locator(".map-frame").scrollIntoViewIfNeeded();
  await mobile.waitForTimeout(2000);
  await mobile.screenshot({ path: "test-results/mobile.png" });
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
