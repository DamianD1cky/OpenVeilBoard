import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  DEFAULT_SURFACE_THEME,
  SURFACE_MATERIALS,
  SURFACE_THEME_PRESETS,
} from "../scene/surfacePresets.js";
import {
  DEFAULT_LIGHTING_STATE,
  GOBO_PATTERNS,
  LIGHTING_PRESETS,
  kelvinToKeyHex,
  normalizeAzimuth,
} from "../scene/lightingPresets.js";
import type { GoboPattern, LightingState, SurfaceTheme } from "../domain/types";
import type { IndentRect } from "./PaperDialog";
import { TrayOverlay } from "./TrayOverlay";

const MATERIAL_OPTIONS = Object.values(SURFACE_MATERIALS);

export type SurfaceDrawerTab = "surface" | "lighting";

const MIN_ELEVATION = 24;
const MAX_ELEVATION = 78;

function LightDomeCompass({
  azimuth,
  elevation,
  warmth,
  onChange,
}: {
  azimuth: number;
  elevation: number;
  warmth: number;
  onChange: (azimuth: number, elevation: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);

  const cx = 64;
  const cy = 64;
  const outerR = 52;

  // Map elevation (MAX -> center, MIN -> outer ring) and azimuth (0=top, +90=right)
  const normR =
    (MAX_ELEVATION - Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, elevation))) /
    (MAX_ELEVATION - MIN_ELEVATION);
  const azRad = (azimuth * Math.PI) / 180;
  const handleX = cx + Math.sin(azRad) * normR * outerR;
  const handleY = cy - Math.cos(azRad) * normR * outerR;
  // Shadow points opposite the light source through the center
  const shadowX = cx - Math.sin(azRad) * Math.min(1, normR * 0.72 + 0.14) * outerR;
  const shadowY = cy + Math.cos(azRad) * Math.min(1, normR * 0.72 + 0.14) * outerR;
  const keyHex = kelvinToKeyHex(warmth);

  const updateFromClient = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / Math.max(rect.width, 1)) * 128 - cx;
    const py = ((clientY - rect.top) / Math.max(rect.height, 1)) * 128 - cy;
    const dist = Math.hypot(px, py);
    const clampedR = Math.min(outerR, dist) / outerR;
    const nextEl = Math.round(
      MAX_ELEVATION - clampedR * (MAX_ELEVATION - MIN_ELEVATION),
    );
    const nextAz =
      dist > 2.5 ? normalizeAzimuth((Math.atan2(px, -py) * 180) / Math.PI) : azimuth;
    onChange(nextAz, nextEl);
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClient(e.clientX, e.clientY);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    updateFromClient(e.clientX, e.clientY);
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div className="lighting-compass-wrap">
      <svg
        ref={svgRef}
        className="lighting-compass"
        viewBox="0 0 128 128"
        role="slider"
        aria-label="主光方位与仰角罗盘"
        aria-valuetext={`方位 ${azimuth}度，仰角 ${elevation}度`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Concentric elevation rings */}
        <circle cx={cx} cy={cy} r={outerR} className="compass-ring outer" />
        <circle cx={cx} cy={cy} r={outerR * 0.66} className="compass-ring" />
        <circle cx={cx} cy={cy} r={outerR * 0.33} className="compass-ring" />
        {/* Hairline crosshairs */}
        <line x1={cx} y1={cy - outerR} x2={cx} y2={cy + outerR} className="compass-axis" />
        <line x1={cx - outerR} y1={cy} x2={cx + outerR} y2={cy} className="compass-axis" />
        {/* Cast shadow direction ray */}
        <line
          x1={handleX}
          y1={handleY}
          x2={shadowX}
          y2={shadowY}
          className="compass-ray"
        />
        {/* Tabletop center marker */}
        <circle cx={cx} cy={cy} r={2.2} className="compass-center" />
        {/* Key light handle */}
        <circle
          cx={handleX}
          cy={handleY}
          r={10}
          fill={keyHex}
          opacity={0.28}
          pointerEvents="none"
        />
        <circle
          cx={handleX}
          cy={handleY}
          r={5.5}
          fill={keyHex}
          className="compass-handle"
        />
      </svg>
      <div className="lighting-compass-readout">
        <span>方位 {azimuth}°</span>
        <span>仰角 {elevation}°</span>
      </div>
    </div>
  );
}

export function SurfaceThemeDrawer({
  theme,
  lighting,
  initialTab = "surface",
  onTabChange,
  onChange,
  onChangeLighting,
  onClose,
  indentRect = null,
  exiting = false,
}: {
  theme: SurfaceTheme;
  lighting: LightingState;
  initialTab?: SurfaceDrawerTab;
  onTabChange?: (next: SurfaceDrawerTab) => void;
  onChange: (next: SurfaceTheme) => void;
  onChangeLighting: (next: LightingState, immediate?: boolean) => void;
  onClose: () => void;
  indentRect?: IndentRect | null;
  exiting?: boolean;
}) {
  const [tab, setTab] = useState<SurfaceDrawerTab>(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const selectTab = (next: SurfaceDrawerTab) => {
    setTab(next);
    onTabChange?.(next);
  };

  const patchLighting = (
    patch: Partial<LightingState>,
    immediate = true,
  ) => {
    onChangeLighting(
      {
        ...lighting,
        presetId: "custom",
        ...patch,
      },
      immediate,
    );
  };

  const selectPattern = (pattern: GoboPattern) => {
    const nextPatch: Partial<LightingState> = { goboPattern: pattern };
    if (pattern === "none") {
      nextPatch.goboOpacity = 0;
    } else {
      if (lighting.goboOpacity < 0.08) {
        nextPatch.goboOpacity = pattern === "lamp" ? 0.82 : 0.74;
      }
      if (pattern === "flora" && lighting.goboSway < 0.05) {
        nextPatch.goboSway = 0.43;
      }
      if (pattern !== "flora") {
        nextPatch.goboSway = 0;
      }
    }
    patchLighting(nextPatch, false);
  };

  const isFlora = lighting.goboPattern === "flora";
  const hasGobo = lighting.goboPattern !== "none";

  const headerTabs = (
    <div className="tray-tabs" role="tablist" aria-label="台面与光影">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "surface"}
        className={`tray-tab ${tab === "surface" ? "active" : ""}`}
        onClick={() => selectTab("surface")}
      >
        台面材质
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "lighting"}
        className={`tray-tab ${tab === "lighting" ? "active" : ""}`}
        onClick={() => selectTab("lighting")}
      >
        光影氛围
      </button>
    </div>
  );

  return (
    <TrayOverlay
      menu="surface"
      title={tab === "surface" ? "台面材质" : "光影氛围"}
      headerContent={headerTabs}
      onClose={onClose}
      indentRect={indentRect}
    >
      {tab === "surface" ? (
        <>
          <div className="surface-floating-list">
            {SURFACE_THEME_PRESETS.map((preset) => {
              const active =
                theme.framePreset === preset.frameId &&
                theme.trayPreset === preset.trayId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`surface-floating-row ${active ? "active" : ""}`}
                  aria-pressed={active}
                  onClick={() =>
                    onChange({
                      presetId: preset.id,
                      framePreset: preset.frameId,
                      trayPreset: preset.trayId,
                    })
                  }
                >
                  <span className="surface-swatches" aria-hidden="true">
                    <i style={{ background: preset.swatches[0] }} />
                    <i style={{ background: preset.swatches[1] }} />
                  </span>
                  <span className="surface-floating-meta">
                    <strong>{preset.label}</strong>
                    <small>{preset.subtitle}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="surface-floating-mix">
            <label>
              <span>外框材质</span>
              <select
                value={theme.framePreset ?? DEFAULT_SURFACE_THEME.framePreset}
                onChange={(e) =>
                  onChange({
                    ...theme,
                    presetId: "custom",
                    framePreset: e.target.value,
                  })
                }
              >
                {MATERIAL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>内槽材质</span>
              <select
                value={theme.trayPreset ?? DEFAULT_SURFACE_THEME.trayPreset}
                onChange={(e) =>
                  onChange({
                    ...theme,
                    presetId: "custom",
                    trayPreset: e.target.value,
                  })
                }
              >
                {MATERIAL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      ) : (
        <div className="lighting-tab-body">
          {/* 6 Atmosphere Presets */}
          <div className="lighting-preset-grid" role="group" aria-label="氛围预设">
            {LIGHTING_PRESETS.map((preset) => {
              const active = lighting.presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`lighting-preset-card ${active ? "active" : ""}`}
                  aria-pressed={active}
                  onClick={() =>
                    onChangeLighting({ ...(preset.state as LightingState) }, false)
                  }
                >
                  <span className="surface-swatches" aria-hidden="true">
                    <i style={{ background: preset.swatches[0] }} />
                    <i style={{ background: preset.swatches[1] }} />
                  </span>
                  <span className="lighting-preset-meta">
                    <strong>{preset.label}</strong>
                    <small>{preset.subtitle}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Dome Light Compass + Tone Sliders */}
          <div className="lighting-stage-row">
            <LightDomeCompass
              azimuth={lighting.azimuth}
              elevation={lighting.elevation}
              warmth={lighting.warmth}
              onChange={(azimuth, elevation) =>
                patchLighting({ azimuth, elevation }, true)
              }
            />
            <div className="lighting-sliders-col">
              <label className="lighting-slider-field">
                <div className="lighting-slider-head">
                  <span>色温</span>
                  <em>{lighting.warmth}K</em>
                </div>
                <input
                  type="range"
                  className="lighting-range warmth"
                  min={2700}
                  max={8200}
                  step={50}
                  value={lighting.warmth}
                  onChange={(e) =>
                    patchLighting({ warmth: Number(e.target.value) }, true)
                  }
                />
              </label>

              <label className="lighting-slider-field">
                <div className="lighting-slider-head">
                  <span>亮度</span>
                  <em>{Math.round(lighting.brightness * 100)}%</em>
                </div>
                <input
                  type="range"
                  className="lighting-range"
                  min={0.55}
                  max={1.45}
                  step={0.01}
                  value={lighting.brightness}
                  onChange={(e) =>
                    patchLighting({ brightness: Number(e.target.value) }, true)
                  }
                />
              </label>

              <label className="lighting-slider-field">
                <div className="lighting-slider-head">
                  <span>明暗反差</span>
                  <em>{Math.round(lighting.contrast * 100)}%</em>
                </div>
                <input
                  type="range"
                  className="lighting-range"
                  min={0.55}
                  max={1.6}
                  step={0.01}
                  value={lighting.contrast}
                  onChange={(e) =>
                    patchLighting({ contrast: Number(e.target.value) }, true)
                  }
                />
              </label>
            </div>
          </div>

          {/* Gobo Projection Pattern & Controls */}
          <div className="lighting-section">
            <div className="lighting-section-head">
              <span>窗影投影</span>
              <small>
                {GOBO_PATTERNS.find((p) => p.id === lighting.goboPattern)?.hint}
              </small>
            </div>
            <div className="lighting-pattern-row" role="group" aria-label="投影图案">
              {GOBO_PATTERNS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="tray-chip"
                  aria-pressed={lighting.goboPattern === item.id}
                  onClick={() => selectPattern(item.id as GoboPattern)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {hasGobo && (
              <div className={`lighting-gobo-sliders ${isFlora ? "cols-3" : "cols-2"}`}>
                <label className="lighting-slider-field">
                  <div className="lighting-slider-head">
                    <span>浓度</span>
                    <em>{Math.round(lighting.goboOpacity * 100)}%</em>
                  </div>
                  <input
                    type="range"
                    className="lighting-range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={lighting.goboOpacity}
                    onChange={(e) =>
                      patchLighting({ goboOpacity: Number(e.target.value) }, true)
                    }
                  />
                </label>

                <label className="lighting-slider-field">
                  <div className="lighting-slider-head">
                    <span>柔化</span>
                    <em>{lighting.goboSoft.toFixed(1)}</em>
                  </div>
                  <input
                    type="range"
                    className="lighting-range"
                    min={0}
                    max={3.6}
                    step={0.05}
                    value={lighting.goboSoft}
                    onChange={(e) =>
                      patchLighting({ goboSoft: Number(e.target.value) }, true)
                    }
                  />
                </label>

                {isFlora && (
                  <label className="lighting-slider-field">
                    <div className="lighting-slider-head">
                      <span>微风</span>
                      <em>{Math.round((lighting.goboSway / 1.2) * 100)}%</em>
                    </div>
                    <input
                      type="range"
                      className="lighting-range"
                      min={0}
                      max={1.2}
                      step={0.02}
                      value={lighting.goboSway}
                      onChange={(e) =>
                        patchLighting({ goboSway: Number(e.target.value) }, true)
                      }
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Atmosphere Toggles + Reset */}
          <div className="lighting-footer-row">
            <div className="lighting-toggle-group">
              <button
                type="button"
                className="tray-chip"
                aria-pressed={lighting.dustEnabled}
                onClick={() =>
                  patchLighting({ dustEnabled: !lighting.dustEnabled }, true)
                }
              >
                浮尘粒子
              </button>
              <button
                type="button"
                className="tray-chip"
                aria-pressed={lighting.clouds}
                onClick={() => patchLighting({ clouds: !lighting.clouds }, true)}
              >
                云影掠过
              </button>
            </div>
            <button
              type="button"
              className="tray-ghost-btn"
              onClick={() =>
                onChangeLighting(
                  { ...(DEFAULT_LIGHTING_STATE as LightingState) },
                  false,
                )
              }
            >
              恢复默认
            </button>
          </div>
        </div>
      )}
    </TrayOverlay>
  );
}
