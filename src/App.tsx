import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { FiArrowLeft, FiPause, FiPlay, FiRefreshCw, FiSettings, FiSquare } from "react-icons/fi";

const DEFAULT_TEXT = `欢迎使用 Flash Prompter

这是一段默认提词内容。
直接开始录制，按空格播放/暂停。

祝你录制顺利。`;

const WORDS_PER_MINUTE = 60;
const LINE_HEIGHT = 48;
const FONT_SIZE = 34;
const SETTINGS_KEY = "flash-prompter-settings";

type Mode = "input" | "prompter" | "settings";

type Settings = {
  wordsPerMinute: number;
  fontSize: number;
  lineHeight: number;
  autoStart: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  wordsPerMinute: WORDS_PER_MINUTE,
  fontSize: FONT_SIZE,
  lineHeight: LINE_HEIGHT,
  autoStart: false
};

export default function App() {
  const [mode, setMode] = useState<Mode>("input");
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [content, setContent] = useState(DEFAULT_TEXT);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const startProgressRef = useRef(0);
  const windowRef = useRef<ReturnType<typeof getCurrentWebviewWindow> | null>(null);
  const settingsReturnModeRef = useRef<Mode>("input");

  const words = useMemo(() => content.trim().split(/\s+/).filter(Boolean), [content]);
  const totalWords = words.length || 1;
  const wordsPerSecond = settings.wordsPerMinute / 60;
  const totalSeconds = totalWords / wordsPerSecond;

  useEffect(() => {
    windowRef.current = getCurrentWebviewWindow();
  }, []);

  useEffect(() => {
    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));

    const normalizeSettings = (value: Partial<Settings>): Settings => ({
      wordsPerMinute: clamp(Number(value.wordsPerMinute ?? WORDS_PER_MINUTE), 20, 240),
      fontSize: clamp(Number(value.fontSize ?? FONT_SIZE), 20, 64),
      lineHeight: clamp(Number(value.lineHeight ?? LINE_HEIGHT), 28, 96),
      autoStart: Boolean(value.autoStart)
    });

    const load = async () => {
      let stored: Partial<Settings> = {};
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) stored = JSON.parse(raw);
      } catch {
        stored = {};
      }

      let autoStart = false;
      try {
        autoStart = await isEnabled();
      } catch {
        autoStart = false;
      }

      setSettings(normalizeSettings({ ...stored, autoStart }));
    };

    load();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      return;
    }
  }, [settings]);

  useEffect(() => {
    let raf = 0;

    const tick = (time: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = time;
      }
      const elapsed = (time - startTimeRef.current) / 1000;
      const nextProgress = startProgressRef.current + elapsed / totalSeconds;
      if (nextProgress >= 1) {
        setProgress(1);
        startProgressRef.current = 1;
        setIsPlaying(false);
        return;
      }
      setProgress(nextProgress);
      raf = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      startTimeRef.current = null;
      raf = requestAnimationFrame(tick);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isPlaying, totalSeconds]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const maxScroll = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;
    scrollRef.current.scrollTop = maxScroll * progress;
  }, [progress, content]);

  const enterPrompter = async () => {
    setMode("prompter");
    const windowHandle = windowRef.current;
    if (windowHandle) {
      await windowHandle.setAlwaysOnTop(true);
    }
  };

  const exitPrompter = async () => {
    setMode("input");
  };

  const openSettings = () => {
    if (mode === "settings") return;
    settingsReturnModeRef.current = mode;
    setIsPlaying(false);
    setMode("settings");
  };

  const closeSettings = () => {
    setMode(settingsReturnModeRef.current);
  };

  const updateSettings = (next: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...next }));
  };

  const toggleAutoStart = async () => {
    const next = !settings.autoStart;
    setSettings((prev) => ({ ...prev, autoStart: next }));
    try {
      if (next) {
        await enable();
      } else {
        await disable();
      }
    } catch {
      setSettings((prev) => ({ ...prev, autoStart: !next }));
    }
  };

  const restoreDefaults = async () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      await disable();
    } catch {
      return;
    }
  };

  const handleStart = () => {
    if (mode === "input") {
      setProgress(0);
      startProgressRef.current = 0;
      enterPrompter();
    } else {
      startProgressRef.current = progress;
    }
    startTimeRef.current = null;
    setIsPlaying(true);
  };

  const handlePause = () => {
    if (!isPlaying) return;
    setIsPlaying(false);
    startProgressRef.current = progress;
  };

  const handleStop = () => {
    setIsPlaying(false);
    setProgress(0);
    startProgressRef.current = 0;
    startTimeRef.current = null;
    exitPrompter();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (mode === "settings") return;
      if (event.code === "Space") {
        event.preventDefault();
        if (mode === "input") {
          handleStart();
        } else if (isPlaying) {
          handlePause();
        } else {
          handleStart();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPlaying, mode, progress]);

  const baseButtonStyle = {
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "1px solid #2a2a2a",
    background: "#111",
    color: "#f5f5f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer"
  } as const;

  const buttonStyle = (enabled: boolean) => ({
    ...baseButtonStyle,
    opacity: enabled ? 1 : 0.45,
    cursor: enabled ? "pointer" : "not-allowed"
  });

  const renderControls = (currentMode: Mode) => {
    const settingsButton = (
      <button
        aria-label="设置"
        onClick={openSettings}
        style={buttonStyle(true)}
      >
        <FiSettings size={18} />
      </button>
    );

    if (currentMode === "input") {
      return (
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          <button
            aria-label="开始"
            onClick={handleStart}
            style={buttonStyle(true)}
          >
            <FiPlay size={20} />
          </button>
          {settingsButton}
        </div>
      );
    }

    if (currentMode === "prompter") {
      return (
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          {isPlaying ? (
            <button
              aria-label="暂停"
              onClick={handlePause}
              style={buttonStyle(true)}
            >
              <FiPause size={20} />
            </button>
          ) : (
            <button
              aria-label="开始"
              onClick={handleStart}
              style={buttonStyle(true)}
            >
              <FiPlay size={20} />
            </button>
          )}
          <button
            aria-label="停止"
            onClick={handleStop}
            style={buttonStyle(true)}
          >
            <FiSquare size={18} />
          </button>
          {settingsButton}
        </div>
      );
    }

    return null;
  };

  if (mode === "settings") {
    return (
      <div
        style={{
          height: "100%",
          padding: 18,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          background: "#0b0b0b",
          color: "#f5f5f5"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              aria-label="返回"
              onClick={closeSettings}
              style={buttonStyle(true)}
            >
              <FiArrowLeft size={18} />
            </button>
            <div style={{ fontSize: 18, fontWeight: 600 }}>设置</div>
          </div>
          <button
            onClick={restoreDefaults}
            style={{
              height: 36,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid #2a2a2a",
              background: "#111",
              color: "#f5f5f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer"
            }}
          >
            <FiRefreshCw size={16} />
            恢复默认
          </button>
        </div>

        <div
          style={{
            flex: 1,
            background: "#0f0f0f",
            borderRadius: 16,
            border: "1px solid #1a1a1a",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, color: "#c7c7c7" }}>开机自启动</div>
            <button
              aria-label={settings.autoStart ? "关闭自启动" : "开启自启动"}
              onClick={toggleAutoStart}
              style={{
                width: 52,
                height: 28,
                borderRadius: 999,
                border: "1px solid #2a2a2a",
                background: settings.autoStart ? "#2563eb" : "#111",
                cursor: "pointer",
                padding: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: settings.autoStart ? "flex-end" : "flex-start"
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#f5f5f5",
                  display: "block"
                }}
              />
            </button>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 14, color: "#c7c7c7" }}>滑动速度</div>
              <div style={{ fontSize: 14 }}>{settings.wordsPerMinute} WPM</div>
            </div>
            <input
              type="range"
              min={20}
              max={240}
              step={5}
              value={settings.wordsPerMinute}
              onChange={(event) =>
                updateSettings({ wordsPerMinute: Number(event.target.value) })
              }
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 14, color: "#c7c7c7" }}>字体大小</div>
              <div style={{ fontSize: 14 }}>{settings.fontSize}px</div>
            </div>
            <input
              type="range"
              min={20}
              max={64}
              step={1}
              value={settings.fontSize}
              onChange={(event) =>
                updateSettings({ fontSize: Number(event.target.value) })
              }
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 14, color: "#c7c7c7" }}>行高</div>
              <div style={{ fontSize: 14 }}>{settings.lineHeight}px</div>
            </div>
            <input
              type="range"
              min={28}
              max={96}
              step={2}
              value={settings.lineHeight}
              onChange={(event) =>
                updateSettings({ lineHeight: Number(event.target.value) })
              }
              style={{ width: "100%" }}
            />
          </div>
        </div>

      </div>
    );
  }

  if (mode === "prompter") {
    return (
      <div
        style={{
          height: "100%",
          padding: 16,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background: "#0b0b0b"
        }}
      >
        <div
          style={{
            flex: 1,
            background: "#0f0f0f",
            borderRadius: 16,
            border: "1px solid #1a1a1a",
            padding: 12,
            overflow: "hidden"
          }}
        >
          <div
            ref={scrollRef}
            style={{
              height: "100%",
              overflow: "hidden",
              fontSize: settings.fontSize,
              lineHeight: `${settings.lineHeight}px`,
              padding: "8px 12px",
              whiteSpace: "pre-wrap"
            }}
          >
            {content}
          </div>
        </div>
        {renderControls(mode)}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        padding: 24,
        boxSizing: "border-box",
        flexDirection: "column",
        gap: 16,
        background: "#0b0b0b"
      }}
    >
      <textarea
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setProgress(0);
          startProgressRef.current = 0;
          setIsPlaying(false);
        }}
        style={{
          flex: 1,
          background: "#111",
          border: "1px solid #222",
          borderRadius: 16,
          padding: 20,
          color: "#f5f5f5",
          fontSize: 18,
          lineHeight: "1.6",
          resize: "none"
        }}
      />
      {renderControls(mode)}
    </div>
  );
}
