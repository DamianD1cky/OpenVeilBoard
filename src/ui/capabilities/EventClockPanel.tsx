import type { CapabilityPanelProps } from "./types";
export function EventClockPanel({
  data,
  readonly,
  onChange,
}: CapabilityPanelProps) {
  const segments = Math.max(2, Math.min(24, Number(data.segments) || 6));
  return (
    <div className="event-clock-panel">
      <input
        aria-label="事件名"
        value={data.name ?? ""}
        readOnly={readonly}
        onChange={(e) => onChange({ ...data, name: e.target.value })}
      />
      <div className="clock-segments">
        {Array.from({ length: segments }, (_, i) => (
          <button
            key={i}
            type="button"
            disabled={readonly}
            aria-label={`推进至${i + 1}格`}
            aria-pressed={i < (data.value ?? 0)}
            className={i < (data.value ?? 0) ? "filled" : ""}
            onClick={() => onChange({ ...data, value: i + 1 })}
          />
        ))}
      </div>
      <div className="inline-actions">
        <button
          type="button"
          disabled={readonly || !data.value}
          onClick={() =>
            onChange({ ...data, value: Math.max(0, data.value - 1) })
          }
        >
          回退
        </button>
        <span>
          {data.value ?? 0} / {segments}
        </span>
        <button
          type="button"
          disabled={readonly || data.value >= segments}
          onClick={() =>
            onChange({
              ...data,
              value: Math.min(segments, (data.value ?? 0) + 1),
            })
          }
        >
          推进
        </button>
      </div>
      <div className="form-pair">
        <label>
          段数
          <input
            type="number"
            min={2}
            max={24}
            value={segments}
            disabled={readonly}
            onChange={(e) => {
              const next = Math.max(
                2,
                Math.min(24, Number(e.target.value) || 2),
              );
              onChange({
                ...data,
                segments: next,
                value: Math.min(data.value ?? 0, next),
              });
            }}
          />
        </label>
        <label>
          模式
          <select
            value={data.mode ?? "progress"}
            disabled={readonly}
            onChange={(e) => onChange({ ...data, mode: e.target.value })}
          >
            <option value="progress">进度</option>
            <option value="scale">刻度</option>
          </select>
        </label>
      </div>
      <textarea
        aria-label="触发后果"
        placeholder="填满后的后果"
        value={data.consequence ?? ""}
        readOnly={readonly}
        onChange={(e) => onChange({ ...data, consequence: e.target.value })}
      />
      <div className="inline-actions">
        <button
          type="button"
          disabled={readonly}
          aria-pressed={data.pinned !== false}
          onClick={() =>
            onChange({
              ...data,
              pinned: data.pinned === false,
              primary: data.pinned === false ? Boolean(data.primary) : false,
            })
          }
        >
          {data.pinned === false ? "仅卡片显示" : "已置顶台面内槽"}
        </button>
        {data.pinned !== false && (
          <button
            type="button"
            disabled={readonly}
            aria-pressed={Boolean(data.primary)}
            onClick={() =>
              onChange({ ...data, pinned: true, primary: !data.primary })
            }
          >
            {data.primary ? "★ 主危机钟" : "设为主危机钟"}
          </button>
        )}
      </div>
    </div>
  );
}
