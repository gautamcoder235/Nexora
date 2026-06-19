import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Sparkles,
  Edit2,
  Trash2,
  RotateCcw
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

interface QuickLink {
  id: string;
  title: string;
  url: string;
  description: string;
  iconType: "Terminal" | "Cpu" | "BookOpen" | "Github" | "Globe";
}

const DEFAULT_QUICK_LINKS: QuickLink[] = [
  {
    id: "vite",
    title: "localhost:5173",
    url: "http://localhost:5173",
    description: "Default Vite dev server",
    iconType: "Terminal",
  },
  {
    id: "node",
    title: "localhost:3000",
    url: "http://localhost:3000",
    description: "Common Node dev port",
    iconType: "Terminal",
  },
  {
    id: "tauri",
    title: "Tauri Docs",
    url: "https://tauri.app",
    description: "App framework reference",
    iconType: "Cpu",
  },
  {
    id: "react",
    title: "React Docs",
    url: "https://react.dev",
    description: "Library documentation",
    iconType: "BookOpen",
  },
  {
    id: "github",
    title: "GitHub",
    url: "https://github.com",
    description: "Developer platform",
    iconType: "Github",
  },
  {
    id: "google",
    title: "Google",
    url: "https://google.com",
    description: "Web search engine",
    iconType: "Globe",
  },
];

const getIconElement = (type: string) => {
  switch (type) {
    case "Terminal":
      return <Terminal size={14} className="text-amber-500" />;
    case "Cpu":
      return <Cpu size={14} className="text-blue-400" />;
    case "BookOpen":
      return <BookOpen size={14} className="text-cyan-400" />;
    case "Github":
      return <GithubIcon size={14} className="text-zinc-200" />;
    case "Globe":
    default:
      return <Globe size={14} className="text-emerald-400" />;
  }
};

export const BrowserNewTab: React.FC<BrowserNewTabProps> = ({ onNavigate }) => {
  const { history, clearHistoryItem } = useBrowserStore();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Quick Links State
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(() => {
    const saved = localStorage.getItem("nexora_quick_links");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse quick links:", e);
      }
    }
    return DEFAULT_QUICK_LINKS;
  });

  const saveQuickLinks = (links: QuickLink[]) => {
    setQuickLinks(links);
    localStorage.setItem("nexora_quick_links", JSON.stringify(links));
  };

  // Customize Modal States
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [editingLink, setEditingLink] = useState<QuickLink | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formIconType, setFormIconType] = useState<"Terminal" | "Cpu" | "BookOpen" | "Github" | "Globe">("Globe");

  // Autocomplete Suggestions State
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  // Focus omnibox on Ctrl+L
  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => window.removeEventListener('keydown', handleKeyDownGlobal);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onNavigate(query);
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

  // Construct suggestions list based on query
  const suggestions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    // Filter from history and quickLinks matching title or url
    const historyMatches = history
      .filter((item) => item.title.toLowerCase().includes(trimmed) || item.url.toLowerCase().includes(trimmed))
      .map((item) => ({ type: "history", title: item.title, url: item.url }));

    const quickLinkMatches = quickLinks
      .filter((item) => item.title.toLowerCase().includes(trimmed) || item.url.toLowerCase().includes(trimmed))
      .map((item) => ({ type: "quicklink", title: item.title, url: item.url }));

    // De-duplicate by URL
    const seenUrls = new Set<string>();
    const uniqueMatches: Array<{ type: string; title: string; url: string }> = [];

    [...quickLinkMatches, ...historyMatches].forEach((item) => {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        uniqueMatches.push(item);
      }
    });

    const limitedMatches = uniqueMatches.slice(0, 4);

    // Always include a Google Search suggestion as the last item
    limitedMatches.push({
      type: "search",
      title: `Search Google for "${query}"`,
      url: query,
    });

    return limitedMatches;
  }, [query, history, quickLinks]);

  // Reset active suggestion index when suggestions length changes
  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [suggestions.length]);

  const handleSelectSuggestion = (suggestion: { type: string; title: string; url: string }) => {
    setIsFocused(false);
    if (suggestion.type === "search") {
      onNavigate(query);
    } else {
      onNavigate(suggestion.url);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length > 0 && isFocused) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSelectSuggestion(suggestions[activeSuggestionIndex]);
      } else if (e.key === "Escape") {
        setIsFocused(false);
      }
    }
  };

  // Quick Link CRUD Actions
  const resetForm = () => {
    setFormTitle("");
    setFormUrl("");
    setFormDesc("");
    setFormIconType("Globe");
    setIsAddingLink(false);
    setEditingLink(null);
  };

  const handleStartAdd = () => {
    resetForm();
    setIsAddingLink(true);
  };

  const handleStartEdit = (link: QuickLink) => {
    setFormTitle(link.title);
    setFormUrl(link.url);
    setFormDesc(link.description);
    setFormIconType(link.iconType);
    setEditingLink(link);
    setIsAddingLink(false);
  };

  const handleDeleteLink = (id: string) => {
    const updated = quickLinks.filter((link) => link.id !== id);
    saveQuickLinks(updated);
  };

  const handleRestoreDefaults = () => {
    saveQuickLinks(DEFAULT_QUICK_LINKS);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formUrl.trim()) return;

    if (isAddingLink) {
      const newLink: QuickLink = {
        id: Math.random().toString(36).substring(7),
        title: formTitle.trim(),
        url: formUrl.trim(),
        description: formDesc.trim(),
        iconType: formIconType,
      };
      saveQuickLinks([...quickLinks, newLink]);
    } else if (editingLink) {
      const updated = quickLinks.map((link) =>
        link.id === editingLink.id
          ? {
              ...link,
              title: formTitle.trim(),
              url: formUrl.trim(),
              description: formDesc.trim(),
              iconType: formIconType,
            }
          : link
      );
      saveQuickLinks(updated);
    }
    resetForm();
  };

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
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
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

            {/* Autocomplete Dropdown */}
            {isFocused && suggestions.length > 0 && (
              <div className="search-suggestions-dropdown animate-suggestion-fade">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    onMouseDown={() => handleSelectSuggestion(suggestion)}
                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                    className={`suggestion-item ${
                      index === activeSuggestionIndex ? "active" : ""
                    }`}
                  >
                    <div className="suggestion-indicator-line" />
                    
                    <div className="p-1.5 rounded-lg bg-black/40 border border-white/[0.04] flex-shrink-0 suggestion-icon-wrapper flex items-center justify-center">
                      {suggestion.type === "search" && <Search size={12} className="text-purple-400" />}
                      {suggestion.type === "history" && <Clock size={12} className="text-amber-500" />}
                      {suggestion.type === "quicklink" && <Globe size={12} className="text-emerald-400" />}
                    </div>
                    
                    <div className="flex-grow flex items-center justify-between min-w-0 gap-3">
                      <span className="text-[11px] font-semibold text-zinc-200 truncate">
                        {suggestion.title}
                      </span>
                      
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {suggestion.type !== "search" && (
                          <span className="text-[8px] text-[#8e8e9f] truncate font-mono bg-black/50 px-2 py-0.5 rounded border border-white/[0.02]">
                            {suggestion.url}
                          </span>
                        )}
                        <span className={`text-[8px] uppercase tracking-wider font-bold font-mono px-1.5 py-0.5 rounded-md ${
                          suggestion.type === "search" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" :
                          suggestion.type === "history" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                          "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}>
                          {suggestion.type}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </form>
        </div>

        {/* Quick Links Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono tracking-wider">
              Quick Links
            </span>
            <button 
              onClick={() => setIsCustomizeOpen(true)}
              className="text-[9px] font-bold text-zinc-500 hover:text-purple-400 transition-colors uppercase tracking-wider cursor-pointer"
            >
              Customize
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {quickLinks.map((link) => (
              <div
                key={link.id}
                className="quick-link-card p-3 flex items-start justify-between group"
              >
                <div 
                  onClick={() => onNavigate(link.url)}
                  className="flex items-start gap-3 flex-grow cursor-pointer min-w-0"
                >
                  <div className="p-2 rounded-lg bg-black border border-white/[0.04] group-hover:border-purple-500/20 transition-colors flex-shrink-0">
                    {getIconElement(link.iconType)}
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="text-[11px] font-bold text-zinc-200 group-hover:text-purple-400 transition-colors truncate">
                      {link.title}
                    </div>
                    <div className="text-[9px] text-[#71717a] truncate mt-0.5 font-medium">
                      {link.description || link.url}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate(link.url)}
                  className="p-1 rounded text-[#71717a] hover:text-purple-400 transition-colors cursor-pointer flex-shrink-0"
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

      {/* Customize Modal Overlay */}
      {isCustomizeOpen && (
        <div className="customize-modal-overlay animate-fade-in">
          <div className="customize-modal w-full max-w-md rounded-2xl flex flex-col max-h-[80vh] overflow-hidden border border-purple-500/25 shadow-[0_0_50px_rgba(168,85,247,0.2)] animate-scale-up">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/[0.08] bg-black/20">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Sparkles size={13} className="text-purple-400 animate-pulse" />
                </div>
                <h2 className="text-[11px] font-extrabold text-white font-sans uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-fuchsia-400">
                  Customize Start Page
                </h2>
              </div>
              <button 
                onClick={() => {
                  setIsCustomizeOpen(false);
                  resetForm();
                }}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex-grow overflow-y-auto">
              {isAddingLink || editingLink ? (
                <form onSubmit={handleFormSubmit} className="space-y-3.5 text-left font-sans">
                  <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                    {isAddingLink ? "Add Quick Link" : "Edit Quick Link"}
                  </h3>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider ml-0.5">Title</label>
                    <input
                      type="text"
                      required
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="e.g. Google"
                      className="customize-input focus:border-purple-500/50"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider ml-0.5">URL</label>
                    <input
                      type="text"
                      required
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      placeholder="e.g. https://google.com"
                      className="customize-input focus:border-purple-500/50"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider ml-0.5">Description</label>
                    <input
                      type="text"
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="e.g. Web search engine"
                      className="customize-input focus:border-purple-500/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-450 uppercase tracking-wider block ml-0.5">Icon Type</label>
                    <div className="grid grid-cols-5 gap-2">
                      {(["Terminal", "Cpu", "BookOpen", "Github", "Globe"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFormIconType(type)}
                          className={`icon-select-btn ${formIconType === type ? "selected" : ""}`}
                        >
                          {getIconElement(type)}
                          <span className="text-[9px] font-extrabold">{type}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="h-8 px-4 rounded-lg border border-white/[0.08] hover:bg-white/5 text-[10px] font-bold text-zinc-300 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="h-8 px-4 bg-gradient-to-r from-purple-650 to-fuchsia-600 hover:from-purple-600 hover:to-fuchsia-500 rounded-lg text-[10px] font-bold text-white transition-all shadow-[0_0_12px_rgba(168,85,247,0.25)] cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-2">
                  {quickLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/[0.01] border border-white/[0.04] hover:border-purple-500/20 hover:bg-white/[0.02] transition-all duration-200 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-black border border-white/[0.04] group-hover:border-purple-500/20 transition-colors flex-shrink-0">
                          {getIconElement(link.iconType)}
                        </div>
                        <div className="min-w-0 text-left">
                          <div className="text-[11px] font-bold text-zinc-200 truncate group-hover:text-purple-400 transition-colors">
                            {link.title}
                          </div>
                          <div className="text-[9px] text-zinc-500 truncate mt-0.5 font-mono bg-black/30 px-1.5 py-0.5 rounded border border-white/[0.01]">
                            {link.url}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleStartEdit(link)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-purple-400 hover:bg-purple-500/10 transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteLink(link.id)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-455 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {quickLinks.length === 0 && (
                    <div className="text-center py-6 text-[10px] text-zinc-555 font-sans">
                      No custom quick links yet. Add one or restore defaults!
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {!isAddingLink && !editingLink && (
              <div className="p-4 border-t border-white/[0.08] flex items-center justify-between bg-black/20">
                <button
                  onClick={handleRestoreDefaults}
                  className="h-8 px-3 rounded-lg border border-white/[0.08] hover:bg-white/5 text-[10px] font-bold text-zinc-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw size={11} />
                  <span>Restore Defaults</span>
                </button>
                <button
                  onClick={handleStartAdd}
                  className="h-8 px-3 bg-gradient-to-r from-purple-650 to-fuchsia-600 hover:from-purple-600 hover:to-fuchsia-500 rounded-lg text-[10px] font-bold text-white flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(168,85,247,0.25)] cursor-pointer"
                >
                  <Plus size={11} />
                  <span>Add Link</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

