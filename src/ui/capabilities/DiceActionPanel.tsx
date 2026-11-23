import type { CapabilityPanelProps } from "./types";
export function DiceActionPanel({
  data,
  readonly,
  onChange,
  onTriggerAction,
  canAct,
}: CapabilityPanelProps) {
  return (
    <div className="dice-action-panel">
      <div className="form-pair">
        <label>
          检定名
          <input
            value={data.label ?? ""}
            readOnly={readonly}
            onChange={(e) => onChange({ ...data, label: e.target.value })}
          />
        </label>
        <label>
          公式
          <input
            value={data.notation ?? "1d20"}
            readOnly={readonly}
            onChange={(e) => onChange({ ...data, notation: e.target.value })}
          />
        </label>
      </div>
      {data.last != null && <p className="last-roll">上次结果 {data.last}</p>}
      <button
        type="button"
        className="ink-button"
        disabled={canAct === false}
        onClick={() =>
          onTriggerAction?.({
            type: "roll",
            notation: data.notation ?? "1d20",
            label: data.label ?? "",
          })
        }
      >
        投掷到台面
      </button>
    </div>
  );
}
