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
  await expect(page.getByRole("checkbox", { name: "Auto zoom" })).toBeChecked();
  const settings = await page.locator(".auto-zoom").boundingBox();
  const drawer = await page.locator(".sidebar").boundingBox();
  assert.ok(
    Math.abs(settings.y + settings.height - drawer.y - drawer.height) <= 1,
  );
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Reset view" }).click();
  await page.getByRole("button", { name: /^Election/ }).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator(".total strong")).toHaveText("551,890");
  await expect(page.locator(".outcome")).toContainText("John Tory elected");
  await chooseElection(page, "2023");
  await expect(page.locator(".total strong")).toHaveText("724,638");
  await chooseElection(page, "2018");
  await expect(page.locator(".total strong")).toHaveText("755,493");
  await chooseElection(page, "2023");
  await chooseElection(page, "2014");
  await expect(page.locator(".outcome")).toContainText("John Tory elected");
  await chooseElection(page, "2010");
  await expect(page.locator(".outcome")).toContainText("Rob Ford elected");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/2010.png" });
  await chooseElection(page, "2006");
  await expect(page.locator(".outcome")).toContainText("David Miller elected");
  await chooseElection(page, "2003");
  await expect(page.locator(".total strong")).toHaveText("692,085");
  await expect(page.locator(".outcome")).toContainText("David Miller elected");
  await expect(page.locator(".result-scope")).toContainText("699,483 voted");
  await chooseElection(page, "2000");
  await expect(page.locator(".total strong")).toHaveText("604,394");
  await expect(page.locator(".outcome")).toContainText("Mel Lastman elected");
  await expect(page.locator(".scope-note")).toHaveText(
    "Citywide mayoral result · no polling-area data",
  );
  await chooseElection(page, "1997");
  await expect(page.locator(".total strong")).toHaveText("749,897");
  await expect(page.locator(".outcome")).toContainText("Mel Lastman elected");
  await chooseElection(page, "2023");
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
  // A plain basemap makes the selected boundary distinguishable from road labels.
  await mobile.route("https://tiles.openfreemap.org/styles/positron", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#eef0eb" },
          },
        ],
      },
    }),
  );
  await mobile.goto(url);
  await expect(mobile.getByRole("checkbox", { name: "Auto zoom" })).toHaveCount(
    0,
  );
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
  await expect(mobile.locator(".results")).toHaveClass(/is-collapsed/);
  assert.ok(Math.abs(Math.round((await reopen.boundingBox()).x) - 14) <= 1);
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
  const canvas = mobile.locator(".maplibregl-canvas");
  const screenshotOptions = {
    style:
      ".results, .map-topline, .maplibregl-control-container { visibility: hidden !important; }",
  };
  for (const [width, height, year, dismiss] of [
    [390, 844, "2023", "close"],
    [375, 667, "2003", "off"],
    [760, 1100, "2023", "unselect"],
    [1440, 1000, "2023", "unselect"],
  ]) {
    const desktop = width > 760;
    await mobile.setViewportSize({ width, height });
    await mobile.reload();
    await expect(mobile.locator(".reset")).toBeEnabled({ timeout: 30000 });
    if (desktop) await chooseElection(mobile, year);
    else await mobile.selectOption("select#election", year);
    await mobile.waitForTimeout(400);
    if (dismiss === "off")
      await mobile.getByRole("button", { name: "Hide results" }).click();
    const frame = await mobile.locator(".map").boundingBox();
    await mobile.getByRole("button", { name: "Zoom in", exact: true }).click();
    await mobile.waitForTimeout(400);
    await mobile.mouse.move(
      frame.x + frame.width * 0.5,
      frame.y + frame.height * 0.3,
    );
    await mobile.mouse.down();
    await mobile.mouse.move(
      frame.x + frame.width * 0.5 + 20,
      frame.y + frame.height * 0.3 - 15,
      { steps: 8 },
    );
    await mobile.mouse.up();
    await mobile.waitForTimeout(400);
    const before = await canvas.screenshot(screenshotOptions);
    await mobile.touchscreen.tap(
      frame.x + frame.width * 0.5,
      frame.y + frame.height * 0.4,
    );
    await expect(mobile.locator(".results h3")).toBeVisible();
    await mobile.waitForTimeout(800);
    const panel = await mobile.locator(".results").boundingBox();
    const visibleHeight = desktop
      ? frame.height
      : Math.min(panel.y, (height * 2) / 3) - frame.y;
    await mobile.screenshot({
      path: `test-results/${desktop ? "desktop" : "mobile"}-region-${year}-${width}.png`,
    });
    const png = await canvas.screenshot(screenshotOptions);
    const boundary = await mobile.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const bounds = {
        left: canvas.width,
        right: 0,
        top: canvas.height,
        bottom: 0,
        pixels: 0,
      };
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (
            Math.abs(data[i] - 25) <= 12 &&
            Math.abs(data[i + 1] - 53) <= 12 &&
            Math.abs(data[i + 2] - 47) <= 12
          ) {
            bounds.left = Math.min(bounds.left, x);
            bounds.right = Math.max(bounds.right, x);
            bounds.top = Math.min(bounds.top, y);
            bounds.bottom = Math.max(bounds.bottom, y);
            bounds.pixels++;
          }
        }
      }
      return bounds;
    }, png.toString("base64"));
    assert.ok(boundary.pixels > 100, "Selected boundary must render");
    const tolerance = 4; // The outline extends beyond the fitted geometry by two pixels.
    assert.ok(boundary.left >= frame.width * 0.2 - tolerance);
    assert.ok(boundary.right <= frame.width * 0.8 + tolerance);
    assert.ok(boundary.top >= visibleHeight * 0.2 - tolerance);
    assert.ok(boundary.bottom <= visibleHeight * 0.8 + tolerance);
    assert.ok(
      Math.abs((boundary.left + boundary.right) / 2 - frame.width / 2) <=
        tolerance,
    );
    assert.ok(
      Math.abs((boundary.top + boundary.bottom) / 2 - visibleHeight / 2) <=
        tolerance,
    );
    assert.ok(
      Math.min(
        Math.abs(boundary.left - frame.width * 0.2),
        Math.abs(boundary.top - visibleHeight * 0.2),
      ) <= tolerance,
      "Zoom must fit to the 20% margin",
    );
    if (dismiss === "close") {
      const heading = await mobile.locator(".results h3").textContent();
      await mobile.touchscreen.tap(
        frame.width * 0.85,
        frame.y + visibleHeight * 0.5,
      );
      await expect(mobile.locator(".results h3")).not.toHaveText(heading);
      await mobile.waitForTimeout(800);
      await mobile.getByRole("button", { name: "Hide results" }).click();
    } else if (dismiss === "off") {
      for (let i = 0; i < 8; i++) {
        // The narrow results panel covers the zoom control; this is test setup.
        await mobile
          .getByRole("button", { name: "Zoom out", exact: true })
          .evaluate((button) => button.click());
        await mobile.waitForTimeout(350);
      }
      await mobile.touchscreen.tap(frame.x + 5, frame.y + 5);
    } else {
      await mobile.touchscreen.tap(
        frame.x + frame.width / 2,
        frame.y + visibleHeight / 2,
      );
    }
    if (desktop) await expect(mobile.locator(".results h3")).toHaveCount(0);
    else await expect(mobile.locator(".results")).toHaveClass(/is-collapsed/);
    await mobile.waitForTimeout(800);
    assert.deepEqual(
      await canvas.screenshot(screenshotOptions),
      before,
      `${dismiss} must restore the original map view`,
    );
    if (desktop) {
      const autoZoom = mobile.getByRole("checkbox", { name: "Auto zoom" });
      await expect(autoZoom).toBeChecked();
      await autoZoom.uncheck();
      await mobile.mouse.click(
        frame.x + frame.width * 0.5,
        frame.y + frame.height * 0.4,
      );
      await expect(mobile.locator(".results h3")).toBeVisible();
      await mobile.waitForTimeout(800);
      assert.deepEqual(
        await canvas.screenshot(screenshotOptions),
        before,
        "Disabling auto zoom must leave the map view unchanged",
      );
      await mobile.mouse.click(
        frame.x + frame.width * 0.5,
        frame.y + frame.height * 0.4,
      );
      await expect(mobile.locator(".results h3")).toHaveCount(0);
      await autoZoom.check();
      await mobile.mouse.click(
        frame.x + frame.width * 0.5,
        frame.y + frame.height * 0.4,
      );
      await expect(mobile.locator(".results h3")).toBeVisible();
      await mobile.waitForTimeout(800);
      assert.notDeepEqual(
        await canvas.screenshot(screenshotOptions),
        before,
        "Re-enabling auto zoom must zoom to the region again",
      );
    }
  }
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
