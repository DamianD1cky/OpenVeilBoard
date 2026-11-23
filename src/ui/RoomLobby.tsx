import { useEffect, useState } from "react";
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
export function RoomLobby({
  session,
  onEnter,
  allowAuto,
  onAccount,
}: {
  session: AppSession;
  onEnter: (room: ActiveCampaignAccess) => void;
  allowAuto: boolean;
  onAccount: () => void;
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
  return (
    <div className="auth-splash">
      <div className="auth-paper room-lobby">
        <div className="lobby-heading">
          <div className="brand-mark">
            VEILBOARD<span>{session.user.displayName}</span>
          </div>
          <button aria-label="账号设置" onClick={onAccount}>
            账号
          </button>
        </div>
        {rooms.length > 0 && (
          <div className="room-list">
            {rooms.map((room) => (
              <button key={room.campaignId} onClick={() => onEnter(room)}>
                <span>{room.name}</span>
                <small>{room.role.toUpperCase()} →</small>
              </button>
            ))}
          </div>
        )}
        {pending && (
          <div className="join-request">
            <p>
              {pending.campaignName} ·{" "}
              {pending.status === "pending" ? "等待 GM 批准" : "申请未通过"}
            </p>
            {pending.reviewNote && <p>{pending.reviewNote}</p>}
            <button
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
            <button onClick={() => void load()}>刷新</button>
          </div>
        )}
        <div className="body-mode">
          <button aria-pressed={tab === "join"} onClick={() => setTab("join")}>
            邀请码加入
          </button>
          <button
            aria-pressed={tab === "create"}
            onClick={() => setTab("create")}
          >
            创建新桌
          </button>
        </div>
        {tab === "create" && gm?.status !== "approved" ? (
          <div className="gm-application">
            <p>
              {gm?.status === "pending"
                ? "GM 资格正在审核"
                : "创建房间需要 GM 资格"}
            </p>
            <button
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
            onSubmit={(e) => {
              e.preventDefault();
              void submit(e.currentTarget);
            }}
          >
            {tab === "create" ? (
              <label>
                房间名
                <input name="name" required maxLength={80} />
              </label>
            ) : (
              <label>
                邀请码
                <input
                  name="joinCode"
                  required
                  autoComplete="off"
                  maxLength={20}
                />
              </label>
            )}
            <label>
              角色名
              <input
                name="characterName"
                required
                defaultValue={session.user.displayName}
                maxLength={80}
              />
            </label>
            <button
              className="ink-button auth-submit"
              disabled={busy || !loaded}
            >
              {busy ? "处理中…" : tab === "create" ? "创建新桌" : "申请加入"}
            </button>
          </form>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="auth-switch"
          onClick={() =>
            void signOut().catch((cause) =>
              setError(getAccessErrorMessage(cause)),
            )
          }
        >
          退出账号
        </button>
      </div>
    </div>
  );
}
