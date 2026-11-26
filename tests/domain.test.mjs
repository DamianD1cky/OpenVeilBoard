import { test } from "node:test";
import assert from "node:assert/strict";
import {
  legacyToNormalized,
  normalizedToLegacy,
  visibleEdges,
  settlePosition,
  overlap,
  findFreePosition,
  paperAspect,
} from "../src/domain/geometry.js";
import { createBoardStore } from "../src/domain/boardStore.ts";
import {
  canReadNote,
  capabilityRegistry,
} from "../src/domain/capabilityRegistry.ts";
import { defaultCampaignClock } from "../src/features/campaign/domain/campaignClock.ts";
import { computeAvoidanceOffsets } from "../src/domain/avoidance.ts";
import { createPolaroidRig } from "../src/features/polaroids/polaroidRig.js";
import { WiggleRig } from "../src/features/polaroids/wiggle.js";
import {
  configurePolaroidWiggle,
  createPolaroidWiggleUpdater,
} from "../src/features/polaroids/polaroidWiggle.js";
import { Group } from "../src/engine/index.js";
import { setImmediate as nextTurn } from "node:timers/promises";
const note = {
  id: "a",
  title: "线索",
  x: 0,
  y: 0,
  capabilities: [],
  version: 0,
};
function harness() {
  let data = {
      notes: [note],
      edges: [],
      members: [],
      clock: defaultCampaignClock(),
    },
    notify;
  const writes = [];
  const repo = {
    load: async () => structuredClone(data),
    subscribe: (fn) => {
      notify = fn;
      return () => {};
    },
    save: (_note, patch, expected) =>
      new Promise((resolve, reject) =>
        writes.push({
          expected,
          patch,
          reject,
          resolve: () => {
            const saved = { ...data.notes[0], ...patch };
            data.notes[0] = saved;
            resolve(saved);
          },
        }),
      ),
  };
  return {
    store: createBoardStore(repo, "room", { id: "gm", name: "GM" }),
    writes,
    notify: () => notify(),
    data,
  };
}
test("旧像素坐标往返不会改变，超界数据有界", () => {
  for (const [x, y] of [
    [44, 44],
    [1098, 605],
    [2100, 1162],
  ]) {
    const p = legacyToNormalized(x, y);
    assert.deepEqual(normalizedToLegacy(p.x, p.y), { x, y });
  }
  assert.deepEqual(legacyToNormalized(-1000, 9999), { x: -0.5, y: 0.5 });
});
test("归档便签会清除关联连线，取回台面不再带回旧关系", async () => {
  const removedEdges = [];
  const serverNotes = [
    { ...note, id: "a", title: "甲", archivedAt: null },
    { ...note, id: "b", title: "乙", archivedAt: null },
    { ...note, id: "c", title: "丙", archivedAt: null },
  ];
  let serverEdges = [
    { id: "e1", fromNoteId: "a", toNoteId: "b", label: "仇人", color: "#b83227", style: "rope" },
    { id: "e2", fromNoteId: "b", toNoteId: "c", label: "情人", color: "#bc984d", style: "gold" },
  ];
  const store = createBoardStore(
    {
      async load() {
        return {
          notes: serverNotes.map((n) => ({ ...n })),
          edges: serverEdges.map((e) => ({ ...e })),
          clock: { mode: "paused", baseIso: "", anchorIso: "", speed: 1, running: false },
          members: [],
        };
      },
      async save(n, patch) {
        const idx = serverNotes.findIndex((item) => item.id === n.id);
        serverNotes[idx] = { ...serverNotes[idx], ...patch, version: serverNotes[idx].version + 1 };
        return { ...serverNotes[idx] };
      },
      async create(n) {
        return n;
      },
      async remove() {},
      async saveEdge(e) {
        return e;
      },
      async removeEdge(id) {
        removedEdges.push(id);
        serverEdges = serverEdges.filter((e) => e.id !== id);
      },
      async saveClock(c) {
        return c;
      },
      async roll() {
        throw new Error("unused");
      },
      subscribe() {
        return () => {};
      },
      async imageUrl(p) {
        return p;
      },
      async upload() {
        return "";
      },
      async comment() {
        throw new Error("unused");
      },
    },
    "c",
    { id: "u", name: "测试" },
  );
  await store.refresh();
  assert.equal(store.getSnapshot().edges.length, 2);
  // Archiving note "a" removes edge e1, keeps unrelated edge e2
  await store.patch("a", { archivedAt: "2026-11-26T17:00:00Z" });
  assert.deepEqual(removedEdges, ["e1"]);
  assert.deepEqual(
    store.getSnapshot().edges.map((e) => e.id),
    ["e2"],
  );
  // Restoring note "a" back to tabletop does NOT bring back e1
  await store.patch("a", { archivedAt: null });
  assert.deepEqual(
    store.getSnapshot().edges.map((e) => e.id),
    ["e2"],
  );
});
test("SAT 避让旋转纸卡", () => {
  const a = { id: "a", x: 0, y: 0, width: 0.12, height: 0.15, rotation: 30 },
    b = { id: "b", x: 0.02, y: 0, width: 0.12, height: 0.15, rotation: -20 };
  assert.ok(overlap(a, b));
  const next = { ...a, ...settlePosition(a, [b]) };
  assert.equal(overlap(next, b), null);
});
test("落桌空位避开既有纸卡与台面保留区", () => {
  const card = { id: "new", x: 0, y: 0, width: 0.2, height: 0.2, rotation: 0 };
  const existing = [{ ...card, id: "old" }];
  const reserved = [
    { id: "clock", x: 0, y: -0.3, width: 0.3, height: 0.1, rotation: 0 },
  ];
  const point = findFreePosition(card, existing, { x: 0.4, y: 0.35 }, reserved);
  assert.equal(overlap({ ...card, ...point }, existing[0]), null);
  assert.equal(overlap({ ...card, ...point }, reserved[0]), null);
});
test("Realtime 重查不会抹掉待写回坐标", async () => {
  const h = harness();
  await h.store.refresh();
  const writing = h.store.patch("a", { x: 0.25 });
  await nextTurn();
  await h.store.refresh();
  assert.equal(h.store.getSnapshot().notes[0].x, 0.25);
  h.writes[0].resolve();
  await writing;
  assert.equal(h.store.getSnapshot().notes[0].x, 0.25);
  h.store.dispose();
});
test("实时重查保留待确认连线，并丢弃写入前发出的整板快照", async () => {
  const snapshot = {
    notes: [note],
    edges: [],
    members: [],
    clock: defaultCampaignClock(),
  };
  let releaseRead,
    confirmLink,
    deferRead = false;
  const repository = {
    load() {
      const selected = structuredClone(snapshot);
      if (!deferRead) return Promise.resolve(selected);
      deferRead = false;
      return new Promise((resolve) => {
        releaseRead = () => resolve(selected);
      });
    },
    subscribe: () => () => {},
    saveEdge(item) {
      return new Promise((resolve) => {
        confirmLink = () => {
          const canonical = { ...item, id: "server-edge" };
          snapshot.edges = [canonical];
          resolve(canonical);
        };
      });
    },
  };
  const store = createBoardStore(repository, "room", { id: "gm", name: "GM" });
  await store.refresh();
  const writing = store.edge("a", "b");
  const optimisticId = store.getSnapshot().edges[0].id;
  await store.refresh();
  assert.equal(store.getSnapshot().edges[0].id, optimisticId);
  deferRead = true;
  const staleRead = store.refresh();
  confirmLink();
  await writing;
  releaseRead();
  await staleRead;
  assert.deepEqual(
    store.getSnapshot().edges.map((edge) => edge.id),
    ["server-edge"],
  );
  store.dispose();
});
test("同一对象的两次写入有序且保留后一次乐观值", async () => {
  const h = harness();
  await h.store.refresh();
  const first = h.store.patch("a", { x: 0.1 }),
    second = h.store.patch("a", { x: 0.3 });
  await nextTurn();
  assert.equal(h.writes.length, 1);
  h.writes[0].resolve();
  await first;
  assert.equal(h.store.getSnapshot().notes[0].x, 0.3);
  await nextTurn();
  assert.equal(h.writes[1].expected.x, 0.1);
  h.writes[1].resolve();
  await second;
  assert.equal(h.store.getSnapshot().notes[0].x, 0.3);
  h.store.dispose();
});
test("失败后显示服务器状态与明确错误", async () => {
  const h = harness();
  await h.store.refresh();
  const write = h.store.patch("a", { title: "修改" });
  await nextTurn();
  h.writes[0].reject(new Error("NOTE_CONFLICT"));
  await assert.rejects(write);
  assert.equal(h.store.getSnapshot().notes[0].title, "线索");
  h.store.dispose();
});
test("能力契约保留三类核心机制，权限占位与 GM 读取一致", () => {
  assert.deepEqual(
    capabilityRegistry.all().map((p) => p.type),
    ["event_clock", "dice_action", "secret"],
  );
  const n = {
    capabilities: [
      {
        enabled: true,
        type: "secret",
        data: { scope: "selected", users: ["player"] },
      },
    ],
  };
  assert.ok(canReadNote(n, "gm", "gm"));
  assert.ok(canReadNote(n, "player", "player"));
  assert.equal(canReadNote(n, "other", "player"), false);
});
test("编辑期间已收到远端更新，保存仍使用编辑起点比较", async () => {
  const h = harness();
  await h.store.refresh();
  const baseline = { ...h.store.getSnapshot().notes[0] };
  h.data.notes[0] = { ...h.data.notes[0], title: "别人先保存的标题" };
  await h.store.refresh();
  const write = h.store.patch("a", { title: "我的修改" }, baseline);
  await nextTurn();
  assert.equal(h.writes[0].expected.title, "线索");
  h.writes[0].reject(new Error("NOTE_CONFLICT"));
  await assert.rejects(write);
  assert.equal(h.store.getSnapshot().notes[0].title, "别人先保存的标题");
  h.store.dispose();
});
test("浮空菜单避让仅推开遮挡便签，关闭后归零", () => {
  const cards = [
    { id: "block", x: 0.28, y: -0.05, halfW: 0.1, halfH: 0.12 },
    { id: "far", x: -0.34, y: 0.25, halfW: 0.1, halfH: 0.12 },
  ];
  const zone = {
    left: 0.08,
    right: 0.48,
    top: -0.38,
    bottom: 0.26,
    preferDir: "left",
  };
  const offsets = computeAvoidanceOffsets(cards, zone);
  const blockOff = offsets.get("block");
  assert.ok(blockOff, "遮挡卡片应产生避让位移");
  const movedRight = cards[0].x + blockOff.dx + cards[0].halfW;
  const movedBottom = cards[0].y + blockOff.dy + cards[0].halfH;
  const movedTop = cards[0].y + blockOff.dy - cards[0].halfH;
  assert.ok(
    movedRight <= zone.left + 0.01 ||
      movedBottom <= zone.top + 0.01 ||
      movedTop >= zone.bottom - 0.01,
    "避让后的卡片应移出浮空菜单区域",
  );
  assert.equal(offsets.has("far"), false, "不遮挡的卡片不应移动");
  assert.equal(computeAvoidanceOffsets(cards, null).size, 0);
});
test("短内容便签自适应收窄高度，拍立得保持经典比例", () => {
  const shortNote = {
    cardStyle: "note",
    title: "码头暗号",
    body: "407",
    capabilities: [],
  };
  const longNote = {
    cardStyle: "note",
    title: "钟表匠留下的长篇调查记录",
    body: "第一段线索说明\n第二段目击证词与地址信息\n第三段潮汐时间推演与地下室入口分析\n第四段补充附注说明",
    capabilities: [
      { type: "event_clock", enabled: true, data: { segments: 6, value: 2 } },
    ],
  };
  const polaroid = {
    cardStyle: "polaroid",
    title: "短标题",
    body: "",
    capabilities: [],
  };
  assert.ok(
    paperAspect(shortNote) > paperAspect(longNote) + 0.25,
    "短便签应明显比长便签更紧凑（宽高比更大）",
  );
  assert.equal(paperAspect(polaroid), 0.8);
});
test("高刷新率（240Hz）下纸卡骨骼摆动不会卡死变形，静止后完全恢复平整", () => {
  const host = new Group();
  const rig = createPolaroidRig(0.72, 0.56, { segmentsX: 10, segmentsY: 12 });
  host.add(rig.root);
  host.position.set(-2.4, 0.28, 0.1);
  host.updateMatrixWorld(true);
  const wiggle = new WiggleRig(rig.skeleton);
  configurePolaroidWiggle(wiggle, 0.24, 0.24);
  const update = createPolaroidWiggleUpdater(wiggle, rig.root);
  wiggle.reset();
  for (const wb of wiggle.wiggleBones) {
    assert.equal(wb.target.position.length(), 0);
  }
  // Simulate enterFromLeft rapid flight + stopping at rest, driven at 240Hz (dt ≈ 0.00417s < 0.006s)
  const dt240 = 1 / 240;
  for (let i = 0; i < 40; i++) {
    host.position.x = -2.4 + (i / 39) * 2.4;
    host.position.y = 0.28 * (1 - i / 39);
    host.updateMatrixWorld(true);
    update(dt240);
  }
  // Confirm bones actually flexed during flight
  const flexed = wiggle.wiggleBones.some(
    (wb) => Math.abs(wb.target.quaternion.w - 1) > 1e-4,
  );
  assert.ok(flexed, "高速入场过程中四角骨骼应有弹性弯曲");
  // Now card is stationary; run 240Hz frames for 0.8s and verify complete flat recovery
  let lastMoved = true;
  for (let i = 0; i < 192; i++) {
    lastMoved = update(dt240);
  }
  assert.equal(lastMoved, false, "静止足够时间后应收敛并允许休眠");
  for (const wb of wiggle.wiggleBones) {
    assert.ok(
      Math.abs(wb.target.quaternion.w - 1) < 1e-6,
      `静止后骨骼四元数应完全归位，实际 w=${wb.target.quaternion.w}`,
    );
    assert.equal(wb.target.position.length(), 0);
  }
});
