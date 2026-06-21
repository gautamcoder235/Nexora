import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Home, X, Plus, ExternalLink, Globe, Pin, PinOff, Target } from "lucide-react";
import { useBrowserStore } from "../../stores/browserStore";
import { useOrchestratorStore } from "../../stores/orchestratorStore";
import { BrowserNewTab } from "./BrowserNewTab";
import { ElementPickerPanel } from "./ElementPickerPanel";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  return (...args: Parameters<T>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => {
      func(...args);
    }, wait);
  };
}

const isLocalUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname.startsWith("192.168.") ||
      parsed.hostname.startsWith("10.") ||
      parsed.hostname.endsWith(".local")
    );
  } catch (e) {
    const trimmed = url.trim().toLowerCase();
    return trimmed.startsWith("localhost") || trimmed.startsWith("127.0.0.1");
  }
};

export const BrowserPanel: React.FC = () => {
  const {
    tabs,
    activeTabId,
    addTab,
    closeTab,
    setActiveTab,
    navigateTab,
    toggleBrowserPanel,
    isBrowserPanelPinned,
    toggleBrowserPanelPinned,
    isElementPickerOpen,
    toggleElementPicker,
  } = useBrowserStore();

  const terminals = useOrchestratorStore((s) => s.terminals);
  const isSettingsModalOpen = useOrchestratorStore((s) => s.isSettingsModalOpen);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const [address, setAddress] = useState(activeTab?.url || "");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const isWebviewSpawned = useRef(false);
  const lastSyncedRect = useRef<{ left: number; top: number; width: number; height: number } | null>(null);

  // Sync address input when active tab changes
  useEffect(() => {
    if (activeTab) {
      setAddress(activeTab.url);
    }
  }, [activeTab?.id, activeTab?.url]);

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim() && activeTab) {
      navigateTab(activeTab.id, address);
    }
  };

  const handleHome = () => {
    if (activeTab) {
      navigateTab(activeTab.id, "");
    }
  };

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleOpenExternal = async () => {
    if (activeTab?.url) {
      try {
        await openUrl(activeTab.url);
      } catch (e) {
        console.error("Failed to open URL in system browser", e);
      }
    }
  };

  // ==========================================
  // WebView Layout Sync (coordinates are relative to the parent window now)
  // ==========================================
  const syncLayout = async (forceVisible?: boolean) => {
    if (!viewportRef.current) return;

    const rect = viewportRef.current.getBoundingClientRect();
    const hasUrl = activeTab?.url && !isLocalUrl(activeTab.url);
    const visible = forceVisible !== undefined ? forceVisible : true;

    if (rect.width === 0 || rect.height === 0 || !hasUrl || !visible) {
      await invoke("sync_browser_webview_layout", {
        visible: false,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      }).catch(() => {});
      return;
    }

    // With add_child(), coordinates are relative to the parent window, not the screen
    const x = rect.left;
    const y = rect.top;
    const width = rect.width;
    const height = rect.height;

    // Skip if nothing changed
    if (
      lastSyncedRect.current &&
      Math.abs(x - lastSyncedRect.current.left) < 1 &&
      Math.abs(y - lastSyncedRect.current.top) < 1 &&
      Math.abs(width - lastSyncedRect.current.width) < 1 &&
      Math.abs(height - lastSyncedRect.current.height) < 1
    ) {
      return;
    }

    lastSyncedRect.current = { left: x, top: y, width, height };

    // Calculate strict physical pixels in the frontend
    const dpr = window.devicePixelRatio;
    const physicalX = Math.round(x * dpr);
    const physicalY = Math.round(y * dpr);
    const physicalW = Math.round(width * dpr);
    const physicalH = Math.round(height * dpr);

    try {
      await invoke("sync_browser_webview_layout", {
        visible: true,
        x: physicalX,
        y: physicalY,
        width: physicalW,
        height: physicalH,
      });
    } catch (err) {
      console.error("Failed to sync webview layout:", err);
    }
  };

  // Keep a ref of the latest function to avoid stale closures in debounce
  const latestSyncLayout = useRef(syncLayout);
  useEffect(() => {
    latestSyncLayout.current = syncLayout;
  });

  const debouncedSyncLayout = useRef(
    debounce(() => {
      latestSyncLayout.current();
    }, 80)
  ).current;

  const syncLayoutDuringTransition = () => {
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      latestSyncLayout.current();
      if (now - start < 500) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  };

  // ==========================================
  // Spawn / Navigate the child webview
  // ==========================================
  const spawnOrNavigate = async (url: string) => {
    if (!url || isLocalUrl(url)) return;
    if (!viewportRef.current) return;

    const rect = viewportRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Coordinates are relative to the parent window (add_child API)
    const x = rect.left;
    const y = rect.top;
    const width = rect.width;
    const height = rect.height;

    setLoading(true);
    try {
      const dpr = window.devicePixelRatio;
      const physicalX = Math.round(x * dpr);
      const physicalY = Math.round(y * dpr);
      const physicalW = Math.round(width * dpr);
      const physicalH = Math.round(height * dpr);

      await invoke("spawn_browser_webview", {
        url,
        x: physicalX,
        y: physicalY,
        width: physicalW,
        height: physicalH,
      });
      isWebviewSpawned.current = true;
      lastSyncedRect.current = { left: x, top: y, width, height };
      syncLayoutDuringTransition();
    } catch (err) {
      console.error("Failed to spawn/navigate webview:", err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // EFFECT: Navigation lifecycle — URL changes trigger spawn/navigate
  // ==========================================
  useEffect(() => {
    if (activeTab?.url && !isLocalUrl(activeTab.url)) {
      spawnOrNavigate(activeTab.url);
    } else {
      // No external URL — destroy the child webview
      if (isWebviewSpawned.current) {
        invoke("destroy_browser_webview").catch(() => {});
        isWebviewSpawned.current = false;
      }
    }
  }, [activeTab?.id, activeTab?.url, refreshKey]);

  // ==========================================
  // EFFECT: Mount lifecycle — ResizeObserver + window resize
  // ==========================================
  useEffect(() => {
    if (!viewportRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        if (
          lastSyncedRect.current &&
          Math.abs(rect.width - lastSyncedRect.current.width) < 1 &&
          Math.abs(rect.height - lastSyncedRect.current.height) < 1
        ) {
          continue;
        }
        debouncedSyncLayout();
      }
    });

    observer.observe(viewportRef.current);

    // Window resize handler (catches IDE-style layout shifts)
    const handleWindowResize = () => {
      debouncedSyncLayout();
    };
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("scroll", handleWindowResize, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("scroll", handleWindowResize, true);
    };
  }, [activeTab?.id, activeTab?.url]);

  // Panel open/dock transitions can move the placeholder without changing its size.
  useEffect(() => {
    if (!activeTab?.url || isLocalUrl(activeTab.url) || isSettingsModalOpen) return;
    return syncLayoutDuringTransition();
  }, [activeTab?.id, activeTab?.url, isBrowserPanelPinned, isSettingsModalOpen]);

  useEffect(() => {
    if (!activeTab?.url || isLocalUrl(activeTab.url)) return;

    let unlisten: (() => void) | undefined;
    const setupWindowMoveListener = async () => {
      try {
        unlisten = await getCurrentWindow().onMoved(() => {
          latestSyncLayout.current();
        });
      } catch (err) {
        console.error("Failed to listen for browser window moves:", err);
      }
    };

    setupWindowMoveListener();
    return () => {
      unlisten?.();
    };
  }, [activeTab?.id, activeTab?.url]);

  // ==========================================
  // EFFECT: Settings modal — hide/show webview
  // ==========================================
  useEffect(() => {
    if (isSettingsModalOpen) {
      invoke("sync_browser_webview_layout", {
        visible: false,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      }).catch(() => {});
    } else {
      // Re-sync when settings closes
      setTimeout(() => syncLayout(), 100);
    }
  }, [isSettingsModalOpen]);

  // ==========================================
  // EFFECT: Cleanup on unmount — destroy the child webview
  // ==========================================
  useEffect(() => {
    return () => {
      invoke("destroy_browser_webview").catch(() => {});
      isWebviewSpawned.current = false;
    };
  }, []);

  return (
    <div className="h-full w-full flex flex-col bg-[#08080a] font-sans min-w-0 select-none text-zinc-300">
      {/* 1. Tab Bar */}
      <div className="flex items-center justify-between bg-black/40 border-b border-border-glass h-9 px-2 gap-2 flex-shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto max-w-[calc(100%-80px)] pr-2 py-1 scrollbar-none">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-t-lg text-[10px] font-semibold tracking-wide border-t border-x cursor-pointer transition-all max-w-[120px] truncate ${
                  isActive
                    ? "bg-[#08080a] border-border-glass text-purple-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                    : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-350 hover:bg-white/5"
                }`}
              >
                <Globe size={10} className="flex-shrink-0" />
                <span className="truncate flex-grow">{tab.title || "New Tab"}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="p-0.5 rounded-full hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X size={8} />
                </button>
              </div>
            );
          })}

          <button
            onClick={() => addTab()}
            title="New Tab"
            className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-350 transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (terminals.length <= 8) {
                toggleBrowserPanelPinned();
                setTimeout(() => {
                  useOrchestratorStore.getState().saveSnapshot();
                }, 0);
              }
            }}
            title={
              terminals.length > 8
                ? "Docking disabled (> 8 terminals)"
                : isBrowserPanelPinned
                ? "Float Panel"
                : "Dock Panel"
            }
            className={`p-1 rounded transition-all cursor-pointer ${
              terminals.length > 8
                ? "opacity-35 cursor-not-allowed text-zinc-500"
                : isBrowserPanelPinned
                ? "bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20"
                : "text-zinc-500 hover:text-zinc-350 hover:bg-white/5"
            }`}
          >
            {isBrowserPanelPinned ? (
              <Pin size={11} className="fill-amber-500" />
            ) : (
              <PinOff size={11} />
            )}
          </button>

          <button
            onClick={toggleBrowserPanel}
            title="Close Browser Panel"
            className="p-1 rounded hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 2. Navigation / Address Bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/25 border-b border-border-glass flex-shrink-0">
        <div className="flex items-center gap-1 text-zinc-500">
          <button
            disabled // Back/Forward disabled because of cross-origin iframe security limitations
            className="p-1 rounded opacity-35 cursor-not-allowed hover:bg-white/5 text-zinc-400"
            title="Back (Iframe limit)"
          >
            <ArrowLeft size={13} />
          </button>
          <button
            disabled
            className="p-1 rounded opacity-35 cursor-not-allowed hover:bg-white/5 text-zinc-400"
            title="Forward (Iframe limit)"
          >
            <ArrowRight size={13} />
          </button>
          <button
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Reload Frame"
          >
            <RotateCw size={12} />
          </button>
          <button
            onClick={handleHome}
            className="p-1 rounded hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Go to Home"
          >
            <Home size={12} />
          </button>
        </div>

        <form onSubmit={handleGo} className="flex-grow flex items-center relative">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Type web address or search Google..."
            className="w-full h-7 px-3 rounded-lg bg-black/50 border border-border-glass focus:border-border-glass-hover focus:outline-none text-[11px] text-zinc-200 placeholder-zinc-650"
          />
        </form>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {activeTab?.url && (
            <button
              onClick={toggleElementPicker}
              className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 cursor-pointer text-[10px] font-bold tracking-wide ${
                isElementPickerOpen
                  ? "bg-purple-500/10 border-purple-500/30 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.1)]"
                  : "bg-zinc-800/20 border-border-glass text-zinc-450 hover:border-border-glass-hover hover:text-zinc-200"
              }`}
              title="Inspect page element"
            >
              <Target size={12} />
              <span>Inspect Element</span>
            </button>
          )}

          {activeTab?.url && (
            <button
              onClick={handleOpenExternal}
              className="p-1.5 rounded-lg bg-zinc-800/20 border border-border-glass hover:border-border-glass-hover text-zinc-450 hover:text-zinc-200 transition-all flex items-center gap-1 cursor-pointer text-[10px] font-bold tracking-wide"
              title="Open page in system web browser"
            >
              <ExternalLink size={12} />
              <span>Open Browser</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Browser Split Viewport & Element Picker Sidebar Area */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden relative">
        <div ref={viewportRef} className="flex-1 min-h-0 relative overflow-hidden bg-black/10">
          {!activeTab?.url ? (
            <BrowserNewTab onNavigate={(url) => activeTab ? navigateTab(activeTab.id, url) : addTab(url)} />
          ) : isLocalUrl(activeTab.url) ? (
            /* Local iframe viewer */
            <iframe
              key={`${activeTab?.id || "empty"}-${refreshKey}`}
              src={activeTab?.url}
              className="w-full h-full border-none bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              title="Browser Panel Viewport"
            />
          ) : (
            /* External webview placeholder — the native child webview renders on top of this */
            <div className="w-full h-full bg-[#050508] flex flex-col items-center justify-center text-zinc-500 font-mono text-[10px] gap-2 select-none">
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-zinc-400 font-bold uppercase tracking-wider text-[9px]">Loading Webview</span>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 rounded-full bg-emerald-500/30 border border-emerald-500/50" />
                  <span className="text-zinc-500 font-bold uppercase tracking-wider text-[9px]">Webview Active</span>
                  <span className="text-zinc-650 text-[8px] max-w-[200px] text-center leading-normal">
                    The native child webview is rendering on top of this placeholder.
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        
        {isElementPickerOpen && <ElementPickerPanel />}
      </div>
    </div>
  );
};
