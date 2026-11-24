import type { CSSProperties } from "react";
import {
  SURFACE_MATERIALS,
  SURFACE_THEME_PRESETS,
} from "../scene/surfacePresets.js";
import type { SurfaceTheme } from "../domain/types";
import type { IndentRect } from "./PaperDialog";

const MATERIAL_OPTIONS = Object.values(SURFACE_MATERIALS);

export function SurfaceThemeDrawer({
  theme,
  onChange,
  onClose,
  indentRect = null,
}: {
  theme: SurfaceTheme;
  onChange: (next: SurfaceTheme) => void;
  onClose: () => void;
  indentRect?: IndentRect | null;
}) {
  const drawerStyle: CSSProperties | undefined = indentRect
    ? {
        top: `${indentRect.top + 52}px`,
        right: `${Math.max(16, window.innerWidth - (indentRect.left + indentRect.width) + 20)}px`,
      }
    : undefined;
  return (
    <aside
      className="surface-theme-drawer"
      style={drawerStyle}
      role="dialog"
      aria-label="台面外框与内槽纹理"
    >
      <div className="surface-drawer-head">
        <h3>台面纹理与材质</h3>
        <button type="button" aria-label="关闭" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="surface-preset-grid">
        {SURFACE_THEME_PRESETS.map((preset) => {
          const active =
            theme.framePreset === preset.frameId &&
            theme.trayPreset === preset.trayId;
          return (
            <button
              key={preset.id}
              type="button"
              className={`surface-preset-card ${active ? "active" : ""}`}
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
              <span className="surface-preset-meta">
                <strong>{preset.label}</strong>
                <small>{preset.subtitle}</small>
              </span>
            </button>
          );
        })}
      </div>

      <div className="surface-slot-mix">
        <label>
          <span>外框材质</span>
          <select
            value={theme.framePreset ?? "plaster_frame"}
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
            value={theme.trayPreset ?? "plaster_tray"}
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
    </aside>
  );
}
