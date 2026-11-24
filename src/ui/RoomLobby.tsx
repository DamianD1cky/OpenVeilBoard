import { useEffect, useState, type CSSProperties } from "react";
import {
  getActiveCampaigns,
  getGmAccess,
  getOwnJoinRequest,
  createCampaign,
  joinCampaign,
  applyForGm,
  cancelCampaignJoin,
  signOut,
} from "../features/access/data/campaignAccess";
import type {
  ActiveCampaignAccess,
  AppSession,
  GmAccess,
  CampaignJoinRequest,
} from "../features/access/domain/types";
import { getAccessErrorMessage } from "../features/access/domain/account";
import type { IndentRect } from "./PaperDialog";

export function RoomLobby({
  session,
  onEnter,
  allowAuto,
  onAccount,
  indentRect = null,
}: {
  session: AppSession;
  onEnter: (room: ActiveCampaignAccess) => void;
  allowAuto: boolean;
  onAccount: () => void;
  indentRect?: IndentRect | null;
}) {
  const [rooms, setRooms] = useState<ActiveCampaignAccess[]>([]),
    [gm, setGm] = useState<GmAccess | null>(null),
    [pending, setPending] = useState<CampaignJoinRequest | null>(null);
  const [tab, setTab] = useState("join"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);

  async function load(auto = false) {
    try {
      const [list, access, request] = await Promise.all([
        getActiveCampaigns(),
        getGmAccess(),
        getOwnJoinRequest(),
      ]);
      setRooms(list);
      setGm(access);
      setPending(request);
      setLoaded(true);
      if (auto && list.length) {
        const recent = localStorage.getItem(
          `veilboard:last-room:${session.user.id}`,
        );
        onEnter(list.find((r) => r.campaignId === recent) ?? list[0]);
      }
    } catch (cause) {
      setError(getAccessErrorMessage(cause));
      setLoaded(true);
    }
  }

  useEffect(() => {
    let alive = true;
    void load(allowAuto);
    const timer = setInterval(() => {
      if (alive) void load(false);
    }, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      if (tab === "create") {
        const id = await createCampaign({
          name: String(data.get("name")),
          characterName: String(data.get("characterName")),
          jobTitle: "主持人",
          themePack: "veil",
        });
        const list = await getActiveCampaigns();
        const room = list.find((r) => r.campaignId === id);
        if (room) onEnter(room);
      } else {
        await joinCampaign({
          joinCode: String(data.get("joinCode")),
          characterName: String(data.get("characterName")),
          jobTitle: "调查员",
          profileText: "",
        });
        await load();
      }
    } catch (cause) {
      setError(getAccessErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const stageStyle: CSSProperties | undefined = indentRect
    ? {
        left: `${indentRect.left}px`,
        top: `${indentRect.top}px`,
        width: `${indentRect.width}px`,
        height: `${indentRect.height}px`,
        borderRadius: `${indentRect.radius}px`,
      }
    : undefined;

  return (
    <section
      className={`tray-auth-stage tray-lobby-stage ${indentRect ? "projected" : ""}`}
      style={stageStyle}
      aria-label="选择房间"
    >
      <div className="tray-lobby-topbar">
        <span className="tray-lobby-user">
          VEILBOARD · {session.user.displayName}
        </span>
        <div className="tray-lobby-top-actions">
          <button type="button" aria-label="账号设置" onClick={onAccount}>
            账号
          </button>
          <button
            type="button"
            onClick={() =>
              void signOut().catch((cause) =>
                setError(getAccessErrorMessage(cause)),
              )
            }
          >
            退出
          </button>
        </div>
      </div>

      <div className="tray-lobby-scroll">
        <div className="tray-auth-inner tray-lobby-inner">
          <header className="tray-brand tray-brand-compact">
            <h1 className="tray-brand-title">选择台面</h1>
            <p className="tray-brand-sub">
              {rooms.length > 0
                ? `已有 ${rooms.length} 间档案室可供入座`
                : "输入邀请码入座，或主持一间新桌"}
            </p>
          </header>

          {rooms.length > 0 && (
            <div className="tray-room-list">
              {rooms.map((room) => (
                <button
                  key={room.campaignId}
                  type="button"
                  onClick={() => onEnter(room)}
                >
                  <span>{room.name}</span>
                  <small>{room.role.toUpperCase()} →</small>
                </button>
              ))}
            </div>
          )}

          {pending && (
            <div className="tray-join-request">
              <p>
                {pending.campaignName} ·{" "}
                {pending.status === "pending" ? "等待 GM 批准" : "申请未通过"}
              </p>
              {pending.reviewNote && <p>{pending.reviewNote}</p>}
              <div className="tray-inline-actions">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await cancelCampaignJoin(pending.id);
                      await load();
                    } catch (cause) {
                      setError(getAccessErrorMessage(cause));
                    }
                  }}
                >
                  撤回申请
                </button>
                <button type="button" onClick={() => void load()}>
                  刷新
                </button>
              </div>
            </div>
          )}

          <div className="tray-tabs">
            <button
              type="button"
              aria-pressed={tab === "join"}
              onClick={() => setTab("join")}
            >
              邀请码加入
            </button>
            <button
              type="button"
              aria-pressed={tab === "create"}
              onClick={() => setTab("create")}
            >
              创建新桌
            </button>
          </div>

          {tab === "create" && gm?.status !== "approved" ? (
            <div className="tray-gm-apply">
              <p>
                {gm?.status === "pending"
                  ? "GM 资格正在审核"
                  : "创建房间需要 GM 资格"}
              </p>
              <button
                type="button"
                className="tray-submit-btn"
                disabled={busy || gm?.status === "pending"}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setGm(await applyForGm());
                  } catch (cause) {
                    setError(getAccessErrorMessage(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                申请 GM 资格
              </button>
            </div>
          ) : (
            <form
              className="tray-auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(e.currentTarget);
              }}
            >
              {tab === "create" ? (
                <label className="tray-field">
                  <span>房间名</span>
                  <input
                    name="name"
                    required
                    maxLength={80}
                    placeholder="为这间档案室命名"
                  />
                </label>
              ) : (
                <label className="tray-field">
                  <span>邀请码</span>
                  <input
                    name="joinCode"
                    required
                    autoComplete="off"
                    maxLength={20}
                    placeholder="输入房间邀请码"
                  />
                </label>
              )}
              <label className="tray-field">
                <span>角色名</span>
                <input
                  name="characterName"
                  required
                  defaultValue={session.user.displayName}
                  maxLength={80}
                />
              </label>
              <div className="tray-auth-actions">
                <button
                  className="tray-submit-btn"
                  disabled={busy || !loaded}
                >
                  {busy ? "处理中…" : tab === "create" ? "创建新桌" : "申请加入"}
                </button>
              </div>
            </form>
          )}

          {error && (
            <p className="tray-auth-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
