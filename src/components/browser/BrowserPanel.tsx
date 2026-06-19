import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Home, X, Plus, ExternalLink, Globe, Pin, PinOff, Target } from "lucide-react";
import { useBrowserStore } from "../../stores/browserStore";
import { useOrchestratorStore } from "../../stores/orchestratorStore";
import { BrowserNewTab } from "./BrowserNewTab";
import { ElementPickerPanel } from "./ElementPickerPanel";
import { openUrl } from "@tauri-apps/plugin-opener";

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

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const [address, setAddress] = useState(activeTab?.url || "");
  const [refreshKey, setRefreshKey] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

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
            disabled
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
      <div className="flex-grow min-h-0 flex flex-row overflow-hidden relative">
        <div ref={viewportRef} className="flex-1 min-h-0 relative overflow-hidden bg-black/10">
          {!activeTab?.url ? (
            <BrowserNewTab onNavigate={(url) => activeTab ? navigateTab(activeTab.id, url) : addTab(url)} />
          ) : (
            /* Unified iframe viewer */
            <iframe
              key={`${activeTab?.id || "empty"}-${refreshKey}`}
              src={activeTab?.url}
              className="w-full h-full border-none bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              title="Browser Panel Viewport"
            />
          )}
        </div>

        {isElementPickerOpen && <ElementPickerPanel />}
      </div>
    </div>
  );
};
