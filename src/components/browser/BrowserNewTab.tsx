import React, { useState, useEffect, useRef } from "react";
import { 
  Search, 
  Globe, 
  BookOpen, 
  Terminal, 
  Cpu, 
  ExternalLink, 
  X, 
  Plus, 
  Clipboard, 
  ArrowRight, 
  Clock,
  Sparkles
} from "lucide-react";
import { useBrowserStore } from "../../stores/browserStore";
import "./BrowserHome.css";

const GithubIcon = ({ size = 24, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

interface BrowserNewTabProps {
  onNavigate: (url: string) => void;
}

export const BrowserNewTab: React.FC<BrowserNewTabProps> = ({ onNavigate }) => {
  const { history, clearHistoryItem, addTab } = useBrowserStore();
  const [query, setQuery] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus omnibox on Ctrl+L
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onNavigate(query);
    }
  };

  const handleCopy = async () => {
    if (query.trim()) {
      await navigator.clipboard.writeText(query);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    }
  };

  const handlePasteAndGo = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        onNavigate(text.trim());
      }
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  };

  const formatTime = (ts: number): string => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "Just now";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return "Yesterday";
  };

  const quickLinks = [
    {
      title: "localhost:5173",
      url: "http://localhost:5173",
      description: "Default Vite dev server",
      icon: <Terminal size={14} className="text-amber-500" />,
    },
    {
      title: "localhost:3000",
      url: "http://localhost:3000",
      description: "Common Node dev port",
      icon: <Terminal size={14} className="text-amber-500" />,
    },
    {
      title: "Tauri Docs",
      url: "https://tauri.app",
      description: "App framework reference",
      icon: <Cpu size={14} className="text-blue-400" />,
    },
    {
      title: "React Docs",
      url: "https://react.dev",
      description: "Library documentation",
      icon: <BookOpen size={14} className="text-cyan-400" />,
    },
    {
      title: "GitHub",
      url: "https://github.com",
      description: "Developer platform",
      icon: <GithubIcon size={14} className="text-zinc-200" />,
    },
    {
      title: "Google",
      url: "https://google.com",
      description: "Web search engine",
      icon: <Globe size={14} className="text-emerald-400" />,
    },
  ];

  return (
    <div className="browser-home-container select-none min-h-0 flex-grow">
      {/* Background Graphic Layers */}
      <div className="browser-home-noise" />
      <div className="browser-home-lines" />

      <div className="browser-home-content">
        {/* Header/Hero Section */}
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#0b0b14]/90 border border-purple-500/20 flex items-center justify-center text-purple-400 font-black text-base mx-auto shadow-[0_0_25px_rgba(168,85,247,0.15)] relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            <span>NX</span>
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white font-sans bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-400">
            Nexora Browser
          </h1>
          <p className="text-[11px] text-[#a1a1aa] max-w-sm mx-auto leading-relaxed font-sans">
            Browse local development ports, documentation and the web alongside your terminal.
          </p>
        </div>

        {/* Search / Omnibox Form */}
        <div className="space-y-3">
          <form onSubmit={handleSearch} className="relative group w-full">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center text-zinc-500 group-focus-within:text-purple-400 transition-colors">
              <Search size={14} />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Google or enter web address..."
              className="w-full h-11 px-4 pl-10 pr-24 rounded-xl bg-black/60 border border-white/[0.08] focus:border-purple-500/40 focus:outline-none text-[11px] text-zinc-100 transition-all placeholder-zinc-650 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] focus:shadow-[0_0_15px_rgba(168,85,247,0.08)]"
            />
            {/* Keyboard hint */}
            <div className="absolute right-20 top-1/2 -translate-y-1/2 text-zinc-500 text-[9px] font-mono select-none pointer-events-none pr-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.06]">Ctrl + L</kbd>
            </div>
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-4 bg-gradient-to-r from-purple-650 to-fuchsia-600 hover:from-purple-600 hover:to-fuchsia-500 rounded-lg text-[10px] font-bold text-white transition-all shadow-[0_0_12px_rgba(168,85,247,0.25)] hover:shadow-[0_0_18px_rgba(168,85,247,0.4)] cursor-pointer"
            >
              Search
            </button>
          </form>

          {/* Quick Actions Row */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => addTab(query)}
              className="glass-action-btn h-8 px-3 text-[10px] font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={11} />
              <span>Open in New Tab</span>
            </button>
            <button
              onClick={() => onNavigate(query)}
              className="glass-action-btn h-8 px-3 text-[10px] font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Globe size={11} />
              <span>Open in Workspace</span>
            </button>
            <button
              onClick={handleCopy}
              className="glass-action-btn h-8 px-3 text-[10px] font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Clipboard size={11} />
              <span>{copyFeedback ? "Copied!" : "Copy URL"}</span>
            </button>
            <button
              onClick={handlePasteAndGo}
              className="glass-action-btn h-8 px-3 text-[10px] font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowRight size={11} />
              <span>Paste & Go</span>
            </button>
          </div>
        </div>

        {/* Quick Links Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono tracking-wider">
              Quick Links
            </span>
            <button className="text-[9px] font-bold text-zinc-500 hover:text-purple-400 transition-colors uppercase tracking-wider cursor-pointer">
              Customize
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {quickLinks.map((link) => (
              <div
                key={link.title}
                className="quick-link-card p-3 flex items-start justify-between group"
              >
                <div 
                  onClick={() => onNavigate(link.url)}
                  className="flex items-start gap-3 flex-grow cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-black border border-white/[0.04] group-hover:border-purple-500/20 transition-colors flex-shrink-0">
                    {link.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-zinc-200 group-hover:text-purple-400 transition-colors truncate">
                      {link.title}
                    </div>
                    <div className="text-[9px] text-[#71717a] truncate mt-0.5 font-medium">
                      {link.description}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate(link.url)}
                  className="p-1 rounded text-[#71717a] hover:text-purple-400 transition-colors cursor-pointer"
                  title={`Launch ${link.title}`}
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recently Visited Section */}
        {history.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="text-[9px] uppercase font-bold text-zinc-500 font-mono tracking-wider px-1">
              Recently Visited
            </div>
            <div className="grid grid-cols-4 gap-2">
              {history.map((item) => (
                <div 
                  key={item.url}
                  className="relative group p-2.5 rounded-xl bg-white/[0.01] border border-white/[0.04] hover:border-white/[0.08] flex flex-col justify-between h-[52px] min-w-0 text-left transition-all"
                >
                  <div 
                    onClick={() => onNavigate(item.url)}
                    className="cursor-pointer min-w-0 flex-grow"
                  >
                    <div className="text-[10px] font-semibold text-zinc-300 truncate pr-4" title={item.title}>
                      {item.title}
                    </div>
                    <div className="text-[8px] text-[#71717a] flex items-center gap-1 mt-1 font-mono">
                      <Clock size={8} />
                      <span>{formatTime(item.timestamp)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => clearHistoryItem(item.url)}
                    className="absolute top-2 right-2 p-0.5 rounded-md text-zinc-650 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Remove from history"
                  >
                    <X size={8} />
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
