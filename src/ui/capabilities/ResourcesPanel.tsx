import type { CapabilityPanelProps } from "./types";
export function ResourcesPanel({
  data,
  readonly,
  onChange,
}: CapabilityPanelProps) {
  const items = data.items ?? [];
  return (
    <div>
      {items.map((item: any) => (
        <div className="resource-row" key={item.id}>
          <input
            aria-label="物资名"
            value={item.name}
            readOnly={readonly}
            onChange={(e) =>
              onChange({
                ...data,
                items: items.map((v: any) =>
                  v.id === item.id ? { ...v, name: e.target.value } : v,
                ),
              })
            }
          />
          <input
            aria-label="数量或属性"
            value={item.value}
            readOnly={readonly}
            onChange={(e) =>
              onChange({
                ...data,
                items: items.map((v: any) =>
                  v.id === item.id ? { ...v, value: e.target.value } : v,
                ),
              })
            }
          />
          {!readonly && (
            <button
              type="button"
              aria-label="删除物资"
              onClick={() =>
                onChange({
                  ...data,
                  items: items.filter((v: any) => v.id !== item.id),
                })
              }
            >
              ×
            </button>
          )}
        </div>
      ))}
      {!readonly && (
        <button
          type="button"
          onClick={() =>
            onChange({
              ...data,
              items: [
                ...items,
                { id: crypto.randomUUID(), name: "", value: "" },
              ],
            })
          }
        >
          ＋ 添加物资
        </button>
      )}
    </div>
  );
}
