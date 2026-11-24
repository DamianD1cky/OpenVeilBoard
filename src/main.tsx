import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useAuthSession } from "./features/access/hooks/useAuthSession";
import type {
  ActiveCampaignAccess,
  AppSession,
} from "./features/access/domain/types";
import { AuthSplash } from "./ui/AuthSplash";
import { RoomLobby } from "./ui/RoomLobby";
import { AccountDialog } from "./ui/AccountDialog";
import { Board } from "./ui/Board";
import type { IndentRect } from "./ui/PaperDialog";
import {
  unlockAudio,
  setAmbientTrack,
  setAudioActive,
  applyAudioPreferences,
} from "./features/audio/audioEngine.js";
import { getAudioPreferences } from "./features/audio/audioPreferences.js";
import "./ui/styles.css";
declare global {
  interface Window {
    __webgpu: Promise<any>;
    __veilboardDiagnostics?: () => any;
  }
}
const query = new URLSearchParams(location.search);
const demo = query.get("demo") === "1";
const demoSession: AppSession = {
  user: {
    id: "demo",
    authUserId: "demo",
    displayName: "守秘人",
    isAnonymous: false,
  },
};
const demoRoom: ActiveCampaignAccess = {
  campaignId: "local-demo",
  name: "灰雾港调查档案",
  joinCode: "DEMO",
  status: "active",
  role: "gm",
  characterName: "守秘人",
  jobTitle: "主持人",
  joinedAt: new Date().toISOString(),
};
function Application({
  session,
  loading,
  error,
  refresh,
}: {
  session: AppSession | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}) {
  const [room, setRoom] = useState<ActiveCampaignAccess | null>(
      demo ? demoRoom : null,
    ),
    [account, setAccount] = useState(false),
    [auto, setAuto] = useState(true),
    [scene, setScene] = useState<any>(null),
    [indentRect, setIndentRect] = useState<IndentRect | null>(null);
  useEffect(() => {
    if (!scene?.onIndentRect) {
      setIndentRect(null);
      return;
    }
    return scene.onIndentRect((rect: IndentRect | null) => setIndentRect(rect));
  }, [scene]);
  useEffect(() => {
    let disposed = false,
      live: any;
    const root = document.getElementById("scene-root")!;
    const start = async () => {
      try {
        window.__webgpu =
          query.get("fallback") === "1"
            ? Promise.resolve(null)
            : ((navigator as any).gpu?.requestAdapter() ??
              Promise.resolve(null));
        if (!(await window.__webgpu) || disposed) {
          document.documentElement.setAttribute("data-scene-fallback", "");
          return;
        }
        const { CounterScene } = await import("./scene/CounterScene.js");
        live = await CounterScene.create(root, {
          onLost: () => {
            live?.dispose();
            setScene(null);
            document.documentElement.setAttribute("data-scene-fallback", "");
          },
        });
        if (disposed) {
          live.dispose();
          return;
        }
        setScene(live);
        window.__veilboardDiagnostics = () => live?.diagnostics();
      } catch (cause) {
        console.error("VeilBoard scene unavailable", cause);
        document.documentElement.setAttribute("data-scene-fallback", "");
      }
    };
    void start();
    applyAudioPreferences(getAudioPreferences());
    const unlock = () => {
      unlockAudio();
      setAudioActive(true);
      setAmbientTrack("ambient.home");
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      disposed = true;
      live?.dispose();
      delete window.__veilboardDiagnostics;
      window.removeEventListener("pointerdown", unlock);
      setAudioActive(false);
    };
  }, []);
  useEffect(() => {
    if (!session) {
      setRoom(null);
      setAccount(false);
      setAuto(true);
    }
  }, [session?.user.id]);
  useEffect(() => {
    if (!room) scene?.setUI(false, true, account);
  }, [room, scene, account]);
  useEffect(() => {
    if (room) scene?.setUI(true, account, account);
  }, [account]);
  const enter = (next: ActiveCampaignAccess) => {
    if (session)
      localStorage.setItem(
        `veilboard:last-room:${session.user.id}`,
        next.campaignId,
      );
    setRoom(next);
  };
  return (
    <>
      {!session ? (
        <AuthSplash
          loading={loading}
          error={error}
          onAuth={refresh}
          indentRect={indentRect}
        />
      ) : room ? (
        <Board
          key={`${room.campaignId}:${session.user.id}`}
          room={room}
          session={session}
          scene={scene}
          demo={demo}
          onAccount={() => setAccount(true)}
          onRooms={() => {
            if (demo) return;
            setAuto(false);
            setRoom(null);
          }}
        />
      ) : (
        <RoomLobby
          session={session}
          onEnter={enter}
          allowAuto={auto}
          onAccount={() => setAccount(true)}
          indentRect={indentRect}
        />
      )}
      {account && session && !demo && (
        <AccountDialog
          session={session}
          room={room}
          onClose={() => setAccount(false)}
          onRefresh={refresh}
        />
      )}
    </>
  );
}
function AuthApplication() {
  const auth = useAuthSession();
  return <Application {...auth} />;
}
createRoot(document.getElementById("ui-root")!).render(
  demo ? (
    <Application
      session={demoSession}
      loading={false}
      error=""
      refresh={async () => {}}
    />
  ) : (
    <AuthApplication />
  ),
);
