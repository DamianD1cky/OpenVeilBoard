import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadEnv } from "vite";
const output =
  process.env.OUTPUT_DIR ??
  join(tmpdir(), "open-veilboard-browser-verification");
await mkdir(output, { recursive: true });
const base = process.env.BASE_URL ?? "http://127.0.0.1:5188";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu"],
});
const checks = [],
  errors = [];
async function observe(page) {
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /webgpu|shader|validation|wgsl/i.test(message.text())
    )
      errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().startsWith(base))
      errors.push(`${response.status()} ${response.url()}`);
  });
}
async function verifyFallback(viewport) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await observe(page);
  await page.goto(`${base}/?demo=1&fallback=1`);
  await page
    .getByRole("button", { name: "便签：灰雾港 · 第七夜", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "＋ 便签", exact: true }).click();
  await page.getByLabel("便签标题", { exact: true }).fill("中文验收便签");
  await page
    .getByLabel("便签正文", { exact: true })
    .fill("归档后取回，内容与连线都保留。");
  await page.getByLabel("添加能力", { exact: true }).selectOption("checklist");
  await page.getByLabel("新清单项", { exact: true }).fill("找到第二把钥匙");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "找到第二把钥匙", exact: true })
    .check();
  await page.getByRole("button", { name: "保存便签", exact: true }).click();
  const card = page.getByRole("button", {
    name: "便签：中文验收便签",
    exact: true,
  });
  await card.waitFor();
  await page.getByRole("button", { name: "连线", exact: true }).click();
  await card.click();
  await page
    .getByRole("button", { name: "便签：潮水正在上涨", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".fallback-edges path").length === 1,
  );
  await card.click();
  await page.getByRole("button", { name: "编辑连线", exact: true }).click();
  await page.getByLabel("纸签", { exact: true }).fill("因果关系");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await card.click();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "找到第二把钥匙", exact: true })
      .isChecked(),
    true,
  );
  await page.getByRole("button", { name: "归档", exact: true }).click();
  await card.waitFor({ state: "hidden" });
  assert.equal(await page.locator(".fallback-edges path").count(), 0);
  await page.locator(".archive-well-2d").click();
  await page.getByRole("button", { name: "放回台面", exact: true }).click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await card.waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".fallback-edges path").length === 1,
  );
  await page.getByRole("button", { name: "投骰", exact: true }).click();
  await page.getByLabel("骰子公式", { exact: true }).fill("2d6+3");
  await page.getByRole("button", { name: "投掷", exact: true }).click();
  await page.locator(".dice-result").waitFor();
  const result = Number(
    await page.locator(".dice-result strong").textContent(),
  );
  assert.ok(result >= 5 && result <= 15);
  await page.getByRole("button", { name: "贴成便签", exact: true }).click();
  await page
    .getByRole("button", { name: "便签：投骰记录", exact: true })
    .waitFor();
  await page.reload();
  await card.waitFor();
  await page.locator(".surface-clock-2d").click();
  await page.getByRole("button", { name: "＋15m", exact: true }).click();
  await page.getByRole("button", { name: "保存时钟", exact: true }).click();
  assert.ok(
    (await page.locator(".surface-clock-2d").textContent()).includes("1893"),
  );
  assert.ok(
    (await page.locator(".surface-clock-2d").textContent()).includes("22:30"),
  );
  await page.locator(".surface-clock-2d").click();
  await page.getByLabel("模式", { exact: true }).selectOption("countdown");
  await page.getByLabel("时长（分钟）", { exact: true }).fill("0.05");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.getByRole("button", { name: "保存时钟", exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".surface-clock-2d")
        ?.textContent.includes("00:00:00"),
    null,
    { timeout: 10_000 },
  );
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth > innerWidth,
    y: document.documentElement.scrollHeight > innerHeight,
  }));
  assert.deepEqual(overflow, { x: false, y: false });
  await page.screenshot({
    path: join(output, `fallback-${viewport.width}.png`),
  });
  checks.push({
    scenario: "中文新建、清单、连线纸签、归档取回、投骰成签、刷新持久化",
    viewport,
    passed: true,
  });
  await context.close();
}
async function verifyGPU() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await observe(page);
  await page.goto(`${base}/?demo=1`);
  await page.waitForFunction(
    () =>
      window.__veilboardDiagnostics?.()?.cards.length === 4 ||
      document.documentElement.hasAttribute("data-scene-fallback"),
    null,
    { timeout: 30_000 },
  );
  const gpu = await page.evaluate(
    () =>
      !document.documentElement.hasAttribute("data-scene-fallback") &&
      Boolean(window.__veilboardDiagnostics),
  );
  assert.ok(gpu, "本机 Chrome 应进入 WebGPU 场景");
  const cards = () =>
    page.evaluate(() => window.__veilboardDiagnostics().cards);
  const clickCard = async (title) => {
    const card = (await cards()).find((c) => c.title === title);
    assert.ok(card);
    await page.mouse.click(card.x, card.y);
  };
  await clickCard("灰雾港 · 第七夜");
  await page.getByRole("dialog", { name: "检视便签" }).waitFor();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "连线", exact: true }).click();
  await clickCard("灰雾港 · 第七夜");
  await clickCard("失踪的钟表匠");
  await page.waitForFunction(
    () => window.__veilboardDiagnostics().ropes.count === 1,
  );
  await page.waitForFunction(
    () => window.__veilboardDiagnostics().ropes.awake === 0,
    null,
    { timeout: 10_000 },
  );
  const still = await page.evaluate(() => ({
    time: performance.now(),
    ...window.__veilboardDiagnostics(),
  }));
  await page.waitForFunction(
    (frame) => window.__veilboardDiagnostics().frame > frame + 30,
    still.frame,
  );
  const next = await page.evaluate(() => ({
    time: performance.now(),
    ...window.__veilboardDiagnostics(),
  }));
  assert.equal(next.ropes.uploads, still.ropes.uploads, "静止绳索不上传顶点");
  assert.equal(
    next.ropes.endpointSamples,
    still.ropes.endpointSamples,
    "静止绳索不采样端点",
  );
  const fps = ((next.frame - still.frame) * 1000) / (next.time - still.time);
  await page.getByRole("button", { name: "投骰", exact: true }).click();
  await page
    .getByLabel("骰子公式", { exact: true })
    .fill("1d4+1d6+1d8+1d10+1d12+1d20+1d100");
  await page.getByRole("button", { name: "投掷", exact: true }).click();
  await page.locator(".dice-result").waitFor({ timeout: 15_000 });
  assert.equal(
    await page.evaluate(() => window.__veilboardDiagnostics().dice.stepping),
    false,
  );
  await page.getByRole("button", { name: "收起", exact: true }).click();
  const pick = (await cards()).find((c) => c.title === "灰雾港 · 第七夜");
  const archive = await page.evaluate(
    () => window.__veilboardDiagnostics().archive,
  );
  await page.mouse.move(pick.x, pick.y);
  await page.waitForFunction(
    () => window.__veilboardDiagnostics().ropes.awake > 0,
  );
  await page.mouse.down();
  await page.mouse.move(archive.x, archive.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(
    () => window.__veilboardDiagnostics().cards.length === 3,
  );
  assert.equal(
    await page.evaluate(() => window.__veilboardDiagnostics().ropes.count),
    0,
  );
  await page.mouse.click(archive.x, archive.y);
  await page.getByRole("button", { name: "放回台面", exact: true }).click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.waitForFunction(
    () =>
      window.__veilboardDiagnostics().cards.length === 4 &&
      window.__veilboardDiagnostics().ropes.count === 1,
  );
  await page.screenshot({ path: join(output, "webgpu-desktop.png") });
  checks.push({
    scenario: "WebGPU 着色器、纸卡点击拖拽归档、绳索休眠与恢复、直投骰子",
    passed: true,
    measuredHeadlessFps: Math.round(fps),
  });
  await context.close();
}
async function verifyAuth() {
  const env = loadEnv("development", process.cwd(), "VITE_"),
    origin = new URL(env.VITE_SUPABASE_URL).origin;
  const authId = "10000000-0000-4000-8000-000000000001",
    actorId = "20000000-0000-4000-8000-000000000001",
    campaignId = "30000000-0000-4000-8000-000000000001";
  const user = {
    id: authId,
    aud: "authenticated",
    role: "authenticated",
    email: "test_user@gm.local",
    is_anonymous: false,
    user_metadata: {},
    app_metadata: { provider: "email", providers: ["email"] },
    created_at: new Date().toISOString(),
  };
  const claims = Buffer.from(
    JSON.stringify({
      sub: authId,
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  const session = {
    access_token: `e30.${claims}.test`,
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    if (context.routeWebSocket)
      await context.routeWebSocket(
        origin.replace(/^http/, "ws") + "/**",
        (socket) => socket.close(),
      );
    await context.route(origin + "/**", async (route) => {
      const url = new URL(route.request().url());
      let data = [];
      if (url.pathname.endsWith("/token")) data = session;
      else if (url.pathname.endsWith("/user")) data = user;
      else if (url.pathname.endsWith("/ensure_actor"))
        data = { id: actorId, display_name: "验收用户", disabled: false };
      else if (url.pathname.endsWith("/campaign_members"))
        data = [
          {
            campaign_id: campaignId,
            role: "gm",
            character_name: "验收用户",
            job_title: "主持人",
            joined_at: new Date().toISOString(),
            campaign: {
              name: "登录验收房间",
              join_code: "ABC123",
              status: "active",
            },
          },
        ];
      else if (url.pathname.endsWith("/get_gm_access"))
        data = {
          user_id: actorId,
          account_name: "test_user",
          display_name: "验收用户",
          status: "approved",
          requested_at: new Date().toISOString(),
          reviewed_at: null,
          review_note: "",
        };
      else if (url.pathname.endsWith("/get_veilboard"))
        data = { notes: [], edges: [], clock: null, members: [] };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    const page = await context.newPage();
    await observe(page);
    await page.goto(base + "/?fallback=1");
    await page.getByRole("button", { name: "登录", exact: true }).waitFor();
    await page.screenshot({ path: join(output, `auth-${viewport.width}.png`) });
    await page.getByLabel("账号", { exact: true }).fill("test_user");
    await page
      .getByLabel("密码", { exact: true })
      .fill("test password for fixture only");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.locator(".room-name").waitFor();
    assert.ok(
      (await page.locator(".room-name").textContent()).includes("登录验收房间"),
    );
    await page.reload();
    await page.locator(".room-name").waitFor();
    await page.locator(".room-name").click();
    await page.getByRole("menuitem", { name: "切换房间", exact: true }).click();
    await page.getByRole("button", { name: /登录验收房间/ }).waitFor();
    checks.push({
      scenario: "登录、恢复登录态、进入最近房间、切换房间",
      viewport,
      passed: true,
      backend: "explicit Auth/RPC fixtures; no cloud accounts created",
    });
    await context.close();
  }
}
try {
  await verifyAuth();
  await verifyFallback({ width: 1440, height: 900 });
  await verifyFallback({ width: 390, height: 844 });
  await verifyGPU();
  assert.deepEqual(errors, []);
  await writeFile(
    join(output, "results.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, output }, null, 2));
} finally {
  await browser.close();
}
