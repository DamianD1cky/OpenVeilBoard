import { useEffect, useState } from "react";
import type { IndentRect } from "./PaperDialog";
import { TrayOverlay } from "./TrayOverlay";
import {
  changePassword,
  updateAccountName,
} from "../features/access/data/accountSettings";
import {
  getSiteAdminAccess,
  listGmApplications,
  reviewGmApplication,
  type GmApplication,
} from "../features/access/data/siteAdministration";
import {
  getCampaignJoinInbox,
  reviewCampaignJoin,
  signOut,
} from "../features/access/data/campaignAccess";
import { getAccessErrorMessage } from "../features/access/domain/account";
import type {
  AppSession,
  ActiveCampaignAccess,
  CampaignJoinRequest,
} from "../features/access/domain/types";

export function AccountDialog({
  session,
  room,
  onClose,
  onRefresh,
  indentRect = null,
  exiting = false,
}: {
  session: AppSession;
  room: ActiveCampaignAccess | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  indentRect?: IndentRect | null;
  exiting?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState("");
  const [applications, setApplications] = useState<GmApplication[]>([]),
    [requests, setRequests] = useState<CampaignJoinRequest[]>([]);
  async function load() {
    try {
      if (await getSiteAdminAccess())
        setApplications((await listGmApplications("pending")).applications);
      if (room?.role === "gm")
        setRequests((await getCampaignJoinInbox(room.campaignId)).requests);
    } catch (cause) {
      setError(getAccessErrorMessage(cause));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function execute(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await action();
      setSaved("已保存");
      await onRefresh();
      await load();
    } catch (cause) {
      setError(getAccessErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <TrayOverlay
      menu="account"
      title="账号"
      onClose={onClose}
      indentRect={indentRect}
      exiting={exiting}
    >
      <form
        className="tray-overlay-form"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void execute(() =>
            updateAccountName(String(data.get("displayName"))),
          );
        }}
      >
        <label className="tray-form-field">
          <span>昵称</span>
          <input
            name="displayName"
            required
            defaultValue={session.user.displayName}
            maxLength={32}
          />
        </label>
        <button className="tray-chip" disabled={busy}>
          保存昵称
        </button>
      </form>
      <form
        className="tray-overlay-form tray-overlay-divider"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            data = new FormData(form);
          void execute(async () => {
            await changePassword(
              String(data.get("current")),
              String(data.get("next")),
              String(data.get("confirm")),
            );
            form.reset();
          });
        }}
      >
        <label className="tray-form-field">
          <span>当前密码</span>
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label className="tray-form-field">
          <span>新密码</span>
          <input
            name="next"
            type="password"
            autoComplete="new-password"
            minLength={15}
            required
          />
        </label>
        <label className="tray-form-field">
          <span>确认新密码</span>
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
          />
        </label>
        <button className="tray-chip" disabled={busy}>
          修改密码
        </button>
      </form>
      {requests.length > 0 && (
        <section className="tray-approval-list tray-overlay-divider">
          <h3>房间加入申请</h3>
          {requests.map((r) => (
            <div key={r.id}>
              <span>{r.characterName}</span>
              <button
                type="button"
                className="tray-ghost-btn"
                disabled={busy}
                onClick={() =>
                  void execute(() => reviewCampaignJoin(r.id, false, ""))
                }
              >
                拒绝
              </button>
              <button
                type="button"
                className="tray-chip"
                disabled={busy}
                onClick={() =>
                  void execute(() => reviewCampaignJoin(r.id, true, ""))
                }
              >
                批准
              </button>
            </div>
          ))}
        </section>
      )}
      {applications.length > 0 && (
        <section className="tray-approval-list tray-overlay-divider">
          <h3>GM 资格审核</h3>
          {applications.map((a) => (
            <div key={a.userId}>
              <span>
                {a.displayName} · {a.accountName}
              </span>
              <button
                type="button"
                className="tray-ghost-btn"
                disabled={busy}
                onClick={() =>
                  void execute(() => reviewGmApplication(a, false, ""))
                }
              >
                拒绝
              </button>
              <button
                type="button"
                className="tray-chip"
                disabled={busy || a.unavailable}
                onClick={() =>
                  void execute(() => reviewGmApplication(a, true, ""))
                }
              >
                批准
              </button>
            </div>
          ))}
        </section>
      )}
      {error && (
        <p className="tray-inline-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="tray-inline-status" role="status">
          {saved}
        </p>
      )}
      <div className="tray-overlay-footer tray-overlay-divider">
        <button
          type="button"
          className="tray-ghost-btn danger"
          onClick={() => void execute(signOut)}
        >
          退出账号
        </button>
      </div>
    </TrayOverlay>
  );
}
