// Browser regressions for note editing focus, using isolated local boards.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { cloneDefaultBoard } from "../../src/features/campaign/domain/defaults.ts";
import { normalizeCustomPanel } from "../../src/features/campaign/domain/customPanels.ts";

const preview = process.env.HP_PREVIEW_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };

function fixture() {
  const board = cloneDefaultBoard();
  const now = new Date().toISOString();
  board.settings.hiddenSections = ["inventory", "tasks", "safety", "shifts", "index", "activity"];
  board.notes = ["甲", "乙"].map((title, index) => ({
    id: `note-${index}`, title: `便签${title}`, body: "原始证词", color: "yellow", pinColor: "red",
    x: 970 + index * 335, y: 420, rotation: 0, scale: 1, effect: null, createdAt: now,
    authorId: board.viewer.id, authorName: board.viewer.displayName, pinned: false, pinnedAt: null,
    layer: index + 1, imagePath: null,
  }));
  board.noteLinks = [];
  board.settings.customPanels = [normalizeCustomPanel({
    id: "region", title: "线索区域", x: 30, y: 30, w: 340, h: 300,
    blocks: [{ id: "text", type: "note_text", heading: "调查线索", text: "保留编辑前的区域视图" }],
  })];
  return board;
}

async function restored(page, expected, label) {
  await page.waitForFunction((transform) => {
    const world = document.querySelector(".world");
    if (!world || document.querySelector(".note-live-inspector")) return false;
    const actual = new DOMMatrixReadOnly(getComputedStyle(world).transform);
    const target = new DOMMatrixReadOnly(transform);
    return ["a", "d", "e", "f"].every((key) => Math.abs(actual[key] - target[key]) < 0.001);
  }, expected);
  check(await page.evaluate(() => window.visualViewport?.scale === 1), label);
}

try {
  for (const scenario of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844, touch: true },
    { name: "reduced", width: 1440, height: 900, reduced: true },
  ]) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      hasTouch: Boolean(scenario.touch),
      reducedMotion: scenario.reduced ? "reduce" : "no-preference",
    });
    await context.addInitScript((board) => localStorage.setItem("veilboard-board-v3", JSON.stringify(board)), fixture());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(preview);
    await page.waitForFunction(() => Boolean(document.querySelector(".world")?.style.transform));
    const overview = await page.locator(".world").evaluate((element) => element.style.transform);
    const inspector = page.getByRole("dialog", { name: "便签实时编辑" });
    const openNew = async () => {
      await page.getByRole("button", { name: "填写便签", exact: true }).click();
      await page.locator('[data-note-id="__draft_new__"]').waitFor();
      check(await page.locator(".world").evaluate((element) => element.style.transform) !== overview,
        `${scenario.name}: new notes focus the board while editing`);
    };
    const persisted = (title) => page.evaluate((value) =>
      JSON.parse(localStorage.getItem("veilboard-board-v3")).notes.some((note) => note.title === value), title);

    await page.locator('[data-note-id="note-0"] .user-note-content').click();
    await inspector.getByRole("textbox", { name: "便签标题", exact: true }).fill("已有便签更新");
    await inspector.getByRole("tab", { name: "全部", exact: true }).click();
    await inspector.locator(".note-inspector-directory button").filter({ hasText: "便签乙" }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="便签标题"]')?.value === "便签乙");
    check(await persisted("已有便签更新"), "switching notes saves the preceding draft");
    await inspector.getByRole("button", { name: "关闭便签编辑", exact: true }).click();
    await restored(page, overview, "closing existing notes restores the overview");

    for (let index = 0; index < 2; index++) {
      await openNew();
      const title = `新增视口回归${index}`;
      await inspector.getByRole("textbox", { name: "便签标题", exact: true }).fill(title);
      await inspector.getByRole("textbox", { name: "便签正文", exact: true }).fill("保存并退出后恢复原视图");
      if (index === 0) {
        await inspector.getByRole("button", { name: "保存", exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('[data-note-id="__draft_new__"]'));
        check(await inspector.count() === 1, "explicit save keeps the editor open");
      }
      await inspector.getByRole("button", { name: "关闭便签编辑", exact: true }).click();
      await restored(page, overview, "saving and closing a new note restores the overview");
      check(await persisted(title), "new note contents are persisted");
    }
    await openNew();
    await page.keyboard.press("Escape");
    await restored(page, overview, "Escape from an empty new note restores the overview");

    await openNew();
    await inspector.getByRole("textbox", { name: "便签标题", exact: true }).fill("应丢弃的草稿");
    await inspector.getByRole("button", { name: "删除便签", exact: true }).click();
    await restored(page, overview, "discarding a new note restores the overview");
    check(!(await persisted("应丢弃的草稿")), "discarded drafts are not persisted");

    await page.getByRole("button", { name: "编辑便签：新增视口回归1", exact: true }).click();
    await inspector.getByRole("button", { name: "删除便签", exact: true }).click();
    await inspector.getByRole("button", { name: "确认删除", exact: true }).click();
    await restored(page, overview, "deleting a saved note restores the overview");
    check(!(await persisted("新增视口回归1")), "confirmed deletion removes the saved note");

    if (scenario.touch) {
      await page.getByRole("navigation", { name: "公告板区域" })
        .getByRole("button", { name: "线索区域", exact: true }).click();
      const region = await page.locator(".world").evaluate((element) => element.style.transform);
      await openNew();
      await inspector.getByRole("button", { name: "关闭便签编辑", exact: true }).click();
      await restored(page, region, "closing a note restores the preceding mobile region");
      await page.getByRole("button", { name: "公告板全览", exact: true }).click();
      await restored(page, overview, "mobile overview navigation remains usable");
    }
    await page.setViewportSize({ width: scenario.width, height: scenario.height + 40 });
    await page.waitForFunction((transform) => document.querySelector(".world")?.style.transform !== transform, overview);
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await restored(page, overview, "resizing after closing does not revive note focus");
    check(errors.length === 0, `${scenario.name}: no uncaught errors: ${errors.join(", ")}`);
    await context.close();
    console.log(`${scenario.name} passed`);
  }
  console.log(`${checks} note viewport Chromium checks passed.`);
} finally {
  await browser.close();
}
