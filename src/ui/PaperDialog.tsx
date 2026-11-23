import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
export interface IndentRect {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
  well?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
}
export function PaperDialog({
  title,
  onClose,
  children,
  wide = false,
  page = false,
  backLabel = "← 返回台面",
  indentRect = null,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  page?: boolean;
  backLabel?: string;
  indentRect?: IndentRect | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const node = ref.current!;
    (
      node.querySelector("input,button,select,textarea") as HTMLElement
    )?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (!page && e.key === "Tab") {
        const controls = [
          ...node.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex='0']",
          ),
        ].filter((n) => n.offsetParent !== null);
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [page]);
  if (page) {
    const stageStyle: CSSProperties = indentRect
      ? ({
          left: `${indentRect.left}px`,
          top: `${indentRect.top}px`,
          width: `${indentRect.width}px`,
          height: `${indentRect.height}px`,
          borderRadius: `${indentRect.radius}px`,
          "--frame-safe-top": `${Math.max(20, 56 - indentRect.top)}px`,
          "--well-h": `${indentRect.well ? indentRect.well.height + 24 : 88}px`,
          "--well-w": `${indentRect.well ? indentRect.well.width + 24 : 180}px`,
        } as CSSProperties)
      : ({
          "--frame-safe-top": "24px",
          "--well-h": "110px",
          "--well-w": "180px",
        } as CSSProperties);
    return (
      <section
        ref={ref}
        role="region"
        aria-label={title}
        className={`in-frame-stage ${wide ? "wide" : ""} ${indentRect ? "projected" : ""}`}
        style={stageStyle}
      >
        <div className="in-frame-corners">
          <button
            type="button"
            className="in-frame-back"
            onClick={onClose}
          >
            {backLabel}
          </button>
          <button
            type="button"
            className="in-frame-close"
            aria-label="关闭"
            onClick={onClose}
          >
            X
          </button>
        </div>
        <div className="in-frame-scroll">{children}</div>
      </section>
    );
  }
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`paper-dialog ${wide ? "wide" : ""}`}
      >
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
