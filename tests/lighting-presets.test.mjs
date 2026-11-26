import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LIGHTING_STATE,
  GOBO_PATTERNS,
  LIGHTING_PRESETS,
  computeLightingRig,
  kelvinToKeyHex,
  resolveLightingState,
} from "../src/scene/lightingPresets.js";

test("默认午后树影预设还原出厂光位与树影参数", () => {
  const rig = computeLightingRig(DEFAULT_LIGHTING_STATE);
  assert.equal(rig.gobo.pattern, "flora");
  assert.equal(rig.gobo.enabled, true);
  assert.equal(rig.gobo.opacity, 0.75);
  assert.ok(Math.abs(rig.key.x - 3.4) < 0.15);
  assert.ok(Math.abs(rig.key.y - 6.0) < 0.15);
  assert.ok(Math.abs(rig.key.z - -4.5) < 0.15);
  assert.equal(rig.key.color, "#fff1df");
});

test("仰角、色温与滑块越界会被安全钳制", () => {
  const state = resolveLightingState({
    presetId: "custom",
    azimuth: 410,
    elevation: 5,
    warmth: 99999,
    brightness: 9,
    contrast: 0.1,
    goboPattern: "invalid_pattern",
    goboOpacity: 2,
    goboSoft: 12,
    goboSway: -3,
  });
  assert.equal(state.azimuth, 50);
  assert.equal(state.elevation, 24);
  assert.equal(state.warmth, 8200);
  assert.equal(state.brightness, 1.45);
  assert.equal(state.contrast, 0.55);
  assert.equal(state.goboPattern, "flora");
  assert.equal(state.goboOpacity, 1);
  assert.equal(state.goboSoft, 3.6);
  assert.equal(state.goboSway, 0);
});

test("非植物窗影自动关闭微风扭曲，避免窗框变形", () => {
  for (const pattern of ["blinds", "window", "lamp", "none"]) {
    const rig = computeLightingRig({
      ...DEFAULT_LIGHTING_STATE,
      goboPattern: pattern,
      goboSway: 0.9,
      goboOpacity: 0.8,
    });
    assert.equal(rig.gobo.sway, 0, `${pattern} should zero out breeze sway`);
    assert.equal(rig.gobo.downOpacity, 0, `${pattern} should disable secondary leaf layer`);
  }
});

test("所有氛围预设与窗影图案都能生成有效 6 层光影参数", () => {
  assert.equal(LIGHTING_PRESETS.length, 6);
  assert.equal(GOBO_PATTERNS.length, 5);
  for (const preset of LIGHTING_PRESETS) {
    const rig = computeLightingRig(preset.state);
    assert.ok(rig.key.intensity > 0);
    assert.ok(rig.ambient.intensity > 0);
    assert.ok(rig.post.exposure >= 0.7 && rig.post.exposure <= 1.35);
    assert.match(kelvinToKeyHex(preset.state.warmth), /^#[0-9a-f]{6}$/);
  }
});
