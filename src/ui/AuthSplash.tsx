import { useState, type CSSProperties } from "react";
import {
  registerAccount,
  signInAccount,
} from "../features/access/data/campaignAccess";
import { getAccessErrorMessage } from "../features/access/domain/account";
import { isSupabaseConfigured } from "../lib/supabase/client";
import type { IndentRect } from "./PaperDialog";

export function AuthSplash({
  loading,
  error: authError,
  onAuth,
  indentRect = null,
}: {
  loading: boolean;
  error: string;
  onAuth: () => Promise<void>;
  indentRect?: IndentRect | null;
}) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  async function submit(form: HTMLFormElement) {
    setBusy(true);
    setError("");
    const data = new FormData(form),
      username = String(data.get("username")),
      password = String(data.get("password"));
    try {
      if (register)
        await registerAccount({
          username,
          password,
          displayName: String(data.get("displayName")),
        });
      else await signInAccount({ username, password });
      await onAuth();
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
      className={`tray-auth-stage ${indentRect ? "projected" : ""}`}
      style={stageStyle}
      aria-label="登录 VeilBoard"
    >
      <div className="tray-auth-inner">
        <header className="tray-brand">
          <h1 className="tray-brand-title">VEILBOARD</h1>
          <p className="tray-brand-sub">线索台面 · TABLETOP ARCHIVE</p>
        </header>

        {loading ? (
          <div className="tray-loading" role="status">
            正在恢复登录…
          </div>
        ) : (
          <form
            className="tray-auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(e.currentTarget);
            }}
          >
            {register && (
              <label className="tray-field">
                <span>昵称</span>
                <input
                  name="displayName"
                  autoComplete="nickname"
                  required
                  maxLength={32}
                  placeholder="你在桌上的称呼"
                />
              </label>
            )}
            <label className="tray-field">
              <span>账号</span>
              <input
                name="username"
                autoComplete="username"
                required
                pattern="[a-zA-Z0-9_-]{3,20}"
                placeholder="输入账号名"
              />
            </label>
            <label className="tray-field">
              <span>密码</span>
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={register ? 15 : 1}
                placeholder={register ? "至少 15 个字符" : "输入密码"}
              />
            </label>
            {(error || authError || !isSupabaseConfigured) && (
              <p className="tray-auth-error" role="alert">
                {error || authError || "尚未配置账号服务。"}
              </p>
            )}
            <div className="tray-auth-actions">
              <button
                className="tray-submit-btn"
                disabled={busy || !isSupabaseConfigured}
              >
                {busy ? "连接中…" : register ? "创建并入座" : "入座台面"}
              </button>
              <button
                className="tray-switch-btn"
                type="button"
                onClick={() => {
                  setRegister(!register);
                  setError("");
                }}
              >
                {register ? "已有账号 · 登录" : "创建账号"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
