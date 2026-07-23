import React, { useState, useEffect } from "react";
import { 
  Globe, 
  ArrowLeft, 
  ArrowRight, 
  RotateCw, 
  Plus, 
  X, 
  ExternalLink, 
  Pin, 
  PinOff, 
  MousePointer, 
  Zap, 
  Laptop, 
  Search, 
  History, 
  Sparkles, 
  Power 
} from "lucide-react";
import { useBrowserStore } from "../../stores/browserStore";
import { invoke } from "@tauri-apps/api/core";

export const BrowserPanel: React.FC = () => {
  const {
    tabs,
    activeTabId,
    isBrowserPanelPinned,
    isElementPickerOpen,
    history,
    isElectronConnected,
    addTab,
    closeTab,
    setActiveTab,
    navigateTab,
    toggleBrowserPanel,
    toggleBrowserPanelPinned,
    toggleElementPicker,
    clearHistoryItem,
    openBrowserPanel
  } = useBrowserStore();

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const [urlInput, setUrlInput] = useState(activeTab?.url || "");

  useEffect(() => {
    if (activeTab?.url !== undefined) {
      setUrlInput(activeTab.url);
    }
  }, [activeTab?.url, activeTabId]);

  const handleNavigate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!urlInput.trim()) return;
    if (activeTab) {
      navigateTab(activeTab.id, urlInput);
    } else {
      addTab(urlInput);
    }
    invoke("launch_electron_browser", { url: urlInput }).catch((err) => {
      console.error("[BrowserPanel] Failed to navigate electron browser:", err);
    });
  };

  const handleLaunchElectron = (url?: string) => {
    openBrowserPanel(url || urlInput || activeTab?.url);
  };

  const quickLinks = [
    { label: "Local 3000", url: "http://localhost:3000", icon: "🚀" },
    { label: "Vite 5173", url: "http://localhost:5173", icon: "⚡" },
    { label: "Port 8080", url: "http://localhost:8080", icon: "⚙️" },
    { label: "Port 5000", url: "http://localhost:5000", icon: "🐍" },
    { label: "Google", url: "https://www.google.com", icon: "🔍" },
    { label: "GitHub", url: "https://github.com", icon: "📦" }
  ];

  return (
    <div className="h-full w-full flex flex-col bg-[#0a0c14] text-zinc-100 font-sans select-none overflow-hidden">
      {/* Header bar */}
      <div className="h-10 px-3 border-b border-white/10 bg-[#0d0f1a] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 select-none">
          <img 
            src="/logo_refined.png" 
            className="w-4 h-4 object-contain rounded-[3px]" 
            alt="Nexora Logo" 
          />
          <span 
            className="text-[11px] font-black tracking-[0.15em] uppercase bg-clip-text text-transparent font-sans"
            style={{
              backgroundImage: "linear-gradient(to right, var(--text-primary), var(--accent-primary), var(--accent-secondary))",
            }}
          >
            Nexora Browser
          </span>

          {/* Connection status indicator */}
          <div 
            onClick={() => handleLaunchElectron()}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono cursor-pointer border transition-all ${
              isElectronConnected
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
            }`}
            title={isElectronConnected ? "Electron Browser connected" : "Click to launch Electron Browser window"}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isElectronConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
            <span>{isElectronConnected ? "Connected" : "Launch Window"}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Element Picker button */}
          <button
            onClick={toggleElementPicker}
            className={`p-1.5 rounded-md transition-colors ${
              isElementPickerOpen 
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
            }`}
            title="Inspect Element Picker"
          >
            <MousePointer size={13} />
          </button>

          {/* Pin/Unpin button */}
          <button
            onClick={toggleBrowserPanelPinned}
            className={`p-1.5 rounded-md transition-colors ${
              isBrowserPanelPinned 
                ? "text-cyan-400 bg-cyan-500/10" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
            }`}
            title={isBrowserPanelPinned ? "Unpin Panel (Float)" : "Pin Panel (Dock)"}
          >
            {isBrowserPanelPinned ? <Pin size={13} /> : <PinOff size={13} />}
          </button>

          {/* Close Panel button */}
          <button
            onClick={() => toggleBrowserPanel()}
            className="p-1.5 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Close Browser Panel"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="h-8 px-2 bg-[#080910] border-b border-white/5 flex items-center gap-1 overflow-x-auto scrollbar-none flex-shrink-0">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex items-center gap-2 px-2.5 py-1 rounded-t-md text-[11px] font-medium max-w-[160px] truncate cursor-pointer transition-all border-b-2 ${
                isActive
                  ? "bg-[#0d0f1a] text-cyan-400 border-cyan-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border-transparent"
              }`}
            >
              <Globe size={11} className="flex-shrink-0 opacity-70" />
              <span className="truncate flex-1">{tab.title || "New Tab"}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        <button
          onClick={() => addTab()}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors"
          title="New Tab"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Address / Toolbar Bar */}
      <div className="p-2 bg-[#0d0f1a] border-b border-white/10 flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => handleNavigate()}
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors"
          title="Reload"
        >
          <RotateCw size={13} />
        </button>

        <form onSubmit={handleNavigate} className="flex-1 relative flex items-center">
          <Search size={13} className="absolute left-2.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Search or enter web URL (e.g. http://localhost:3000)"
            className="w-full bg-[#05060a] border border-white/10 focus:border-cyan-500/50 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none font-mono transition-colors"
          />
        </form>

        <button
          onClick={() => handleLaunchElectron()}
          className="p-1.5 rounded-md text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
          title="Open in External Electron Window"
        >
          <ExternalLink size={13} />
        </button>
      </div>

      {/* Main View Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4 bg-[#070810]">
        {/* Live Electron Status Banner */}
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-purple-950/40 border border-cyan-500/20 flex flex-col gap-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Laptop size={16} className="text-cyan-400" />
              <span className="text-xs font-bold text-zinc-200">
                {isElectronConnected ? "Embedded Electron Window Active" : "Web Browser Ready"}
              </span>
            </div>
            <button
              onClick={() => handleLaunchElectron()}
              className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-medium text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-cyan-500/10"
            >
              <ExternalLink size={11} />
              <span>{isElectronConnected ? "Bring Window Front" : "Launch Window"}</span>
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            {isElectronConnected
              ? "Live synchronization is running. Navigating or searching from this panel updates the Electron browser window instantly."
              : "Click 'Launch Window' to open the high-performance embedded Chromium preview window."}
          </p>
        </div>

        {/* Quick Launch Cards */}
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
            <Sparkles size={11} className="text-cyan-400" />
            <span>Quick Launch Local Dev Servers</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {quickLinks.map((item) => (
              <button
                key={item.url}
                onClick={() => {
                  setUrlInput(item.url);
                  if (activeTab) navigateTab(activeTab.id, item.url);
                  handleLaunchElectron(item.url);
                }}
                className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm">{item.icon}</span>
                  <ExternalLink size={10} className="text-zinc-600 group-hover:text-cyan-400 transition-colors" />
                </div>
                <div className="text-xs font-bold text-zinc-300 group-hover:text-cyan-300 transition-colors">{item.label}</div>
                <div className="text-[10px] font-mono text-zinc-500 truncate">{item.url}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent History List */}
        {history.length > 0 && (
          <div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
              <History size={11} className="text-purple-400" />
              <span>Recent Navigation History</span>
            </div>
            <div className="space-y-1.5">
              {history.map((item) => (
                <div
                  key={item.url}
                  className="flex items-center justify-between p-2 rounded-lg bg-white/[0.015] border border-white/[0.04] hover:bg-white/[0.04] transition-all group"
                >
                  <button
                    onClick={() => {
                      setUrlInput(item.url);
                      if (activeTab) navigateTab(activeTab.id, item.url);
                      handleLaunchElectron(item.url);
                    }}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="text-xs font-medium text-zinc-300 truncate group-hover:text-cyan-300">{item.title}</div>
                    <div className="text-[10px] font-mono text-zinc-500 truncate">{item.url}</div>
                  </button>
                  <button
                    onClick={() => clearHistoryItem(item.url)}
                    className="p-1 text-zinc-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
