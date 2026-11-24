import { useState } from "react";
import type { IndentRect } from "./PaperDialog";
import { TrayOverlay } from "./TrayOverlay";
import {
  configureCampaignClockValue,
  materializeCampaignClock,
  CAMPAIGN_CLOCK_MIN_MS,
  CAMPAIGN_CLOCK_MAX_MS,
} from "../features/campaign/domain/campaignClock";
import { useClockText } from "./useClockText";
import { errorText, type BoardStore } from "../domain/boardStore";

export function ClockDialog({
  store,
  role,
  onClose,
  indentRect = null,
}: {
  store: BoardStore;
  role: string;
  onClose: () => void;
  indentRect?: IndentRect | null;
}) {
  const [clock, setClock] = useState(
      materializeCampaignClock(store.getSnapshot().clock),
    ),
    [error, setError] = useState("");
  const text = useClockText(clock);
  return (
    <TrayOverlay
      menu="clock"
      title="战役时钟"
      onClose={onClose}
      indentRect={indentRect}
    >
      <p className="tray-clock-display">{text}</p>
      <div className="tray-pill-row">
        <button
          type="button"
          className="tray-chip"
          disabled={role !== "gm"}
          onClick={() =>
            setClock({
              ...materializeCampaignClock(clock),
              running: !clock.running,
            })
          }
        >
          {clock.running ? "暂停" : "播放"}
        </button>
        {[
          ["15m", 900000],
          ["1h", 3600000],
          ["1d", 86400000],
        ].map(([name, ms]) => (
          <button
            type="button"
            className="tray-chip"
            key={name}
            disabled={role !== "gm"}
            onClick={() =>
              setClock(
                configureCampaignClockValue(
                  clock,
                  Math.min(
                    CAMPAIGN_CLOCK_MAX_MS,
                    Math.max(
                      clock.mode === "clock" ? CAMPAIGN_CLOCK_MIN_MS : 0,
                      materializeCampaignClock(clock).valueMs +
                        Number(ms) * (clock.mode === "countdown" ? -1 : 1),
                    ),
                  ),
                ),
              )
            }
          >
            {clock.mode === "countdown" ? "−" : "＋"}
            {name}
          </button>
        ))}
      </div>
      <label className="tray-form-field">
        <span>模式</span>
        <select
          aria-label="模式"
          disabled={role !== "gm"}
          value={clock.mode}
          onChange={(e) =>
            setClock({
              ...clock,
              mode: e.target.value as any,
              valueMs: e.target.value === "clock" ? Date.now() : 0,
              initialValueMs: 0,
              referenceAt: new Date().toISOString(),
            })
          }
        >
          <option value="clock">战役历法</option>
          <option value="countdown">倒计时</option>
          <option value="stopwatch">正计时</option>
        </select>
      </label>
      {clock.mode === "clock" ? (
        <div className="tray-form-pair">
          <label className="tray-form-field">
            <span>纪元</span>
            <input
              value={clock.era}
              maxLength={2}
              readOnly={role !== "gm"}
              onChange={(e) =>
                setClock({ ...clock, era: e.target.value.toUpperCase() })
              }
            />
          </label>
          <label className="tray-form-field">
            <span>日期时间</span>
            <input
              type="datetime-local"
              readOnly={role !== "gm"}
              value={localDate(clock.valueMs)}
              onChange={(e) => {
                const value = new Date(e.target.value).getTime();
                if (Number.isFinite(value))
                  setClock(configureCampaignClockValue(clock, value));
              }}
            />
          </label>
        </div>
      ) : (
        <label className="tray-form-field">
          <span>时长（分钟）</span>
          <input
            type="number"
            min={0}
            readOnly={role !== "gm"}
            value={clock.valueMs / 60_000}
            onChange={(e) =>
              setClock(
                configureCampaignClockValue(
                  clock,
                  Math.max(0, Number(e.target.value)) * 60_000,
                ),
              )
            }
          />
        </label>
      )}
      {error && (
        <p role="alert" className="tray-inline-error">
          {error}
        </p>
      )}
      {role === "gm" && (
        <div className="tray-overlay-footer">
          <button
            type="button"
            className="tray-primary-btn"
            onClick={async () => {
              try {
                await store.clock(clock);
                onClose();
              } catch (cause) {
                setError(errorText(cause));
              }
            }}
          >
            保存时钟
          </button>
        </div>
      )}
    </TrayOverlay>
  );
}

function localDate(ms: number) {
  const date = new Date(ms);
  return new Date(ms - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
