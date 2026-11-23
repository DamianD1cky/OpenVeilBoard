import type { CapabilityPanelProps } from "./types";
export function TagsPanel({ data, readonly, onChange }: CapabilityPanelProps) {
  return (
    <input
      aria-label="标签，以逗号分隔"
      placeholder="标签，以逗号分隔"
      readOnly={readonly}
      value={(data.tags ?? []).join(", ")}
      onChange={(e) =>
        onChange({
          ...data,
          tags: e.target.value
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean),
        })
      }
    />
  );
}
