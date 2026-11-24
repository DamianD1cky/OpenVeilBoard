import {
  SURFACE_MATERIALS,
  SURFACE_THEME_PRESETS,
} from "../scene/surfacePresets.js";
import type { SurfaceTheme } from "../domain/types";
import type { IndentRect } from "./PaperDialog";
import { TrayOverlay } from "./TrayOverlay";

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
  return (
    <TrayOverlay
      menu="surface"
      title="台面纹理"
      onClose={onClose}
      indentRect={indentRect}
    >
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
    </TrayOverlay>
  );
}
