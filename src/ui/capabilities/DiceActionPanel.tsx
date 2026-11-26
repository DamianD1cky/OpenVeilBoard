import type { CapabilityPanelProps } from "./types";

const QUICK_FORMULAS = ["1d20", "1d100", "2d6", "1d6"];

export function DiceActionPanel({
  data,
  readonly,
  onChange,
}: CapabilityPanelProps) {
  const notation = data.notation ?? "1d20";
  return (
    <div className="dice-action-panel">
      <div className="form-pair">
        <label>
          <span>检定名</span>
          <input
            placeholder="例如：侦查、开锁"
            value={data.label ?? ""}
            readOnly={readonly}
            onChange={(e) => onChange({ ...data, label: e.target.value })}
          />
        </label>
        <label>
          <span>公式</span>
          <input
            value={notation}
            readOnly={readonly}
            onChange={(e) => onChange({ ...data, notation: e.target.value })}
          />
        </label>
      </div>
      {!readonly && (
        <div className="dice-quick-formulas">
          {QUICK_FORMULAS.map((f) => (
            <button
              key={f}
              type="button"
              className={`dice-formula-chip ${notation === f ? "active" : ""}`}
              onClick={() => onChange({ ...data, notation: f })}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      <div className="dice-action-foot">
        <small>将在桌面便签左下角生成「投掷」按钮，点按即可直接掷骰</small>
        {data.last != null && (
          <span className="last-roll">上次 {data.last}</span>
        )}
      </div>
    </div>
  );
}
