import { useEffect, type CSSProperties, type ReactNode } from "react";
import type { NormalizedRect } from "../domain/avoidance";
import type { IndentRect } from "./PaperDialog";

export type TrayMenuKey =
  | "roomMenu"
  | "dice"
  | "surface"
  | "clock"
  | "edge"
  | "account";

export const TRAY_MENU_ZONES: Record<TrayMenuKey, NormalizedRect> = {
  roomMenu: {
    left: -0.46,
    right: -0.17,
    top: -0.4,
    bottom: -0.1,
    preferDir: "right",
  },
  dice: {
    left: -0.25,
    right: 0.25,
    top: -0.38,
    bottom: 0.38,
    preferDir: "left",
  },
  surface: {
    left: -0.25,
    right: 0.25,
    top: -0.41,
    bottom: 0.41,
    preferDir: "left",
  },
  clock: {
    left: -0.24,
    right: 0.24,
    top: -0.31,
    bottom: 0.28,
    preferDir: "down",
  },
  edge: {
    left: -0.25,
    right: 0.25,
    top: -0.38,
    bottom: 0.38,
    preferDir: "left",
  },
  account: {
    left: -0.25,
    right: 0.25,
    top: -0.38,
    bottom: 0.38,
    preferDir: "left",
  },
};

export function TrayOverlay({
  menu,
  title,
  onClose,
  indentRect = null,
  hideHeader = false,
  headerContent,
  children,
}: {
  menu: TrayMenuKey;
  title: string;
  onClose: () => void;
  indentRect?: IndentRect | null;
  hideHeader?: boolean;
  headerContent?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const zone = TRAY_MENU_ZONES[menu];
  const stageStyle: CSSProperties | undefined = indentRect
    ? {
        left: `${indentRect.left}px`,
        top: `${indentRect.top}px`,
        width: `${indentRect.width}px`,
        height: `${indentRect.height}px`,
        right: "auto",
        bottom: "auto",
        borderRadius: `${indentRect.radius}px`,
      }
    : undefined;

  const panelStyle: CSSProperties = {
    left: `${(zone.left + 0.5) * 100}%`,
    top: `${(zone.top + 0.5) * 100}%`,
    width: `${(zone.right - zone.left) * 100}%`,
    maxHeight: `${(zone.bottom - zone.top) * 100}%`,
  };

  return (
    <div
      className="tray-overlay-stage"
      style={stageStyle}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`tray-overlay-panel tray-overlay-${menu}`}
        style={panelStyle}
        role="dialog"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!hideHeader && (
          <header className="tray-overlay-head">
            {headerContent ?? <h2>{title}</h2>}
            <button
              type="button"
              className="tray-overlay-close"
              aria-label="关闭"
              onClick={onClose}
            >
              ×
            </button>
          </header>
        )}
        <div className="tray-overlay-body">{children}</div>
      </section>
    </div>
  );
}
