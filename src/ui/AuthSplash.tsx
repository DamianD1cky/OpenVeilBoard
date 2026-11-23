import { useState } from "react";
import {
  registerAccount,
  signInAccount,
} from "../features/access/data/campaignAccess";
import { getAccessErrorMessage } from "../features/access/domain/account";
import { isSupabaseConfigured } from "../lib/supabase/client";
export function AuthSplash({
  loading,
  error: authError,
  onAuth,
}: {
  loading: boolean;
  error: string;
  onAuth: () => Promise<void>;
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
  return (
    <div className="auth-splash">
      <div className="viewfinder">
        <i className="opening-corner tl" />
        <i className="opening-corner tr" />
        <i className="opening-corner bl" />
        <i className="opening-corner br" />
        <div className="auth-paper">
          <div className="brand-mark">
            VEILBOARD<span>线索台面</span>
          </div>
          {loading ? (
            <div className="loading-mark" role="status">
              正在恢复登录…
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit(e.currentTarget);
              }}
            >
              {register && (
                <label>
                  昵称
                  <input
                    name="displayName"
                    autoComplete="nickname"
                    required
                    maxLength={32}
                  />
                </label>
              )}
              <label>
                账号
                <input
                  name="username"
                  autoComplete="username"
                  required
                  pattern="[a-zA-Z0-9_-]{3,20}"
                  placeholder="账号名"
                />
              </label>
              <label>
                密码
                <input
                  name="password"
                  type="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  required
                  minLength={register ? 15 : 1}
                  placeholder={register ? "至少 15 个字符" : "密码"}
                />
              </label>
              {(error || authError || !isSupabaseConfigured) && (
                <p className="error" role="alert">
                  {error || authError || "尚未配置账号服务。"}
                </p>
              )}
              <button
                className="ink-button auth-submit"
                disabled={busy || !isSupabaseConfigured}
              >
                {busy ? "连接中…" : register ? "注册" : "登录"}
              </button>
              <button
                className="auth-switch"
                type="button"
                onClick={() => {
                  setRegister(!register);
                  setError("");
                }}
              >
                {register ? "已有账号 · 登录" : "创建账号"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
