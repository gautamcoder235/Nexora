import React, { useState } from "react";
import { Search, Globe, BookOpen, Terminal, Cpu } from "lucide-react";

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
  const [query, setQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onNavigate(query);
    }
  };

  const quickLinks = [
    {
      title: "Localhost:5173",
      url: "http://localhost:5173",
      description: "Default Vite dev server",
      icon: <Terminal size={16} className="text-amber-500" />,
    },
    {
      title: "Localhost:3000",
      url: "http://localhost:3000",
      description: "Common Node dev port",
      icon: <Terminal size={16} className="text-amber-500" />,
    },
    {
      title: "Tauri Docs",
      url: "https://tauri.app",
      description: "App framework reference",
      icon: <Cpu size={16} className="text-blue-400" />,
    },
    {
      title: "React Docs",
      url: "https://react.dev",
      description: "Library documentation",
      icon: <BookOpen size={16} className="text-cyan-400" />,
    },
    {
      title: "GitHub",
      url: "https://github.com",
      description: "Developer platform",
      icon: <GithubIcon size={16} className="text-zinc-200" />,
    },
    {
      title: "Google",
      url: "https://google.com",
      description: "Web search engine",
      icon: <Globe size={16} className="text-emerald-400" />,
    },
  ];

  return (
    <div className="flex-grow flex flex-col items-center justify-center p-6 text-zinc-350 select-none overflow-y-auto min-h-0 bg-[#000000]/30">
      <div className="w-full max-w-lg space-y-8 text-center">
        {/* Brand/Header */}
        <div className="space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-650/20 to-fuchsia-600/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-black text-sm mx-auto shadow-[0_0_15px_rgba(168,85,247,0.15)] relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            <span>MV</span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-200 font-sans">
            BridgeSpace Browser
          </h2>
          <p className="text-[11px] text-zinc-500 max-w-sm mx-auto leading-relaxed">
            Browse local development ports, documentations, and search the web alongside your terminal.
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="relative group w-full">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Google or enter web address..."
            className="w-full h-10 px-4 pl-10 pr-12 rounded-xl bg-black/60 border border-border-glass focus:border-purple-500/50 focus:outline-none text-xs text-zinc-200 transition-all placeholder-zinc-650 shadow-inner"
          />
          <Search size={14} className="text-zinc-650 absolute left-3.5 top-1/2 -translate-y-1/2 group-focus-within:text-purple-400 transition-colors" />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-3 bg-gradient-to-r from-purple-650 to-fuchsia-600 hover:from-purple-600 hover:to-fuchsia-500 rounded-lg text-[10px] font-bold text-white transition-all shadow-[0_0_10px_rgba(168,85,247,0.2)] hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] cursor-pointer"
          >
            Search
          </button>
        </form>

        {/* Quick Links Grid */}
        <div className="space-y-3 pt-2">
          <div className="text-[9px] uppercase font-bold text-zinc-500 font-mono tracking-wider text-left pl-1">
            Quick Links
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {quickLinks.map((link) => (
              <button
                key={link.title}
                onClick={() => onNavigate(link.url)}
                className="flex items-start gap-3 p-3 rounded-xl bg-black/30 hover:bg-purple-500/5 border border-border-glass hover:border-purple-500/30 text-left transition-all group cursor-pointer"
              >
                <div className="p-1.5 rounded-lg bg-zinc-950 border border-border-glass/40 group-hover:border-border-glass-hover transition-colors flex-shrink-0">
                  {link.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-zinc-300 group-hover:text-purple-400 transition-colors truncate">
                    {link.title}
                  </div>
                  <div className="text-[9px] text-zinc-500 truncate mt-0.5">
                    {link.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
