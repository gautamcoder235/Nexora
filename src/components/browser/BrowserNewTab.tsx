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

  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const clockString = time.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const dateString = time.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).toUpperCase();

  const getGreeting = () => {
    const hrs = time.getHours();
    if (hrs < 12) return "Good morning";
    if (hrs < 17) return "Good afternoon";
    return "Good evening";
  };

  const greeting = getGreeting();

  const thought = useMemo(() => {
    const thoughts = [
      "First, solve the problem. Then, write the code.",
      "Simplicity is the soul of efficiency.",
      "Make it work, make it right, make it fast.",
      "The best way to predict the future is to invent it.",
      "Clean code always looks like it was written by someone who cares.",
      "Excellence is not a skill. It is an attitude.",
      "Talk is cheap. Show me the code.",
      "Every great developer was once a beginner who didn't quit.",
      "Details matter, it's worth waiting to get them right.",
      "Programs must be written for people to read, and only accidentally for machines to execute.",
      "In order to be irreplaceable one must always be different.",
      "The only way to do great work is to love what you do.",
      "Excellence is a continuous process and not an accident.",
      "Intellectuals solve problems, geniuses prevent them."
    ];
    const day = new Date().getDate();
    return thoughts[day % thoughts.length];
  }, []);

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

  // Spotlight and 3D Tilt handlers for Quick Links
  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Set CSS variables for cursor tracking
    card.style.setProperty("--mouse-x", `${x}px`);
    card.style.setProperty("--mouse-y", `${y}px`);

    // 3D Tilt calculation
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -6; // Max 6deg
    const rotateY = ((x - centerX) / centerX) * 6; // Max 6deg

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px) scale(1.01)`;
  };

  const handleCardMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    card.style.transform = "";
    card.style.setProperty("--mouse-x", "50%");
    card.style.setProperty("--mouse-y", "50%");
  };

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>, url: string) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Spawn a temporary ripple element
    const ripple = document.createElement("span");
    ripple.className = "card-click-ripple";
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    card.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);

    onNavigate(url);
  };

  // Spotlight tracking for Search Omnibox Form
  const handleSearchMouseMove = (e: React.MouseEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const rect = form.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    form.style.setProperty("--mouse-x", `${x}px`);
    form.style.setProperty("--mouse-y", `${y}px`);
  };

  const handleSearchMouseLeave = (e: React.MouseEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    form.style.setProperty("--mouse-x", "50%");
    form.style.setProperty("--mouse-y", "50%");
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
      <div className="browser-home-grid" />
      <div className="browser-home-glow-1" />
      <div className="browser-home-glow-2" />
      <div className="browser-home-glow-3" />

      <div className="browser-home-content">
        {/* Header/Hero Section */}
        <div className="text-center">
          <div className="browser-home-clock">
            {clockString}
          </div>
          <div className="browser-home-date">
            {dateString}
          </div>
          <div className="browser-home-greeting">
            {greeting}, <span className="highlight">Explorer</span>
          </div>
          <div className="browser-home-thought">
            &ldquo;{thought}&rdquo;
          </div>
        </div>

        {/* Search / Omnibox Form */}
        <div className="browser-search-container">
          <form 
            onSubmit={handleSearch} 
            className="browser-search-form group"
            onMouseMove={handleSearchMouseMove}
            onMouseLeave={handleSearchMouseLeave}
          >
            <div className="browser-search-icon-wrapper">
              <Search size={14} className="browser-search-icon" />
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
              className="browser-search-input"
            />
            {/* Keyboard hint */}
            <div className="browser-search-kbd-wrapper">
              <kbd className="browser-search-kbd">Ctrl + L</kbd>
            </div>
            <button
              type="submit"
              className="browser-search-btn"
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
                    
                    <div className="suggestion-icon-container">
                      {suggestion.type === "search" && <Search size={12} className="text-purple-400" />}
                      {suggestion.type === "history" && <Clock size={12} className="text-amber-500" />}
                      {suggestion.type === "quicklink" && <Globe size={12} className="text-emerald-400" />}
                    </div>
                    
                    <div className="suggestion-text-container">
                      <span className="suggestion-title-text">
                        {suggestion.title}
                      </span>
                      
                      <div className="suggestion-meta-container">
                        {suggestion.type !== "search" && (
                          <span className="suggestion-url-badge">
                            {suggestion.url}
                          </span>
                        )}
                        <span className={`suggestion-type-badge type-${suggestion.type}`}>
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
        <div className="quick-links-section">
          <div className="section-header">
            <span className="section-title">
              Quick Links
            </span>
            <button 
              onClick={() => setIsCustomizeOpen(true)}
              className="customize-btn"
            >
              Customize
            </button>
          </div>
          <div className="quick-links-grid">
            {quickLinks.map((link) => (
              <div
                key={link.id}
                className="quick-link-card group"
                onMouseMove={handleCardMouseMove}
                onMouseLeave={handleCardMouseLeave}
                onClick={(e) => handleCardClick(e, link.url)}
              >
                <div className="quick-link-card-content">
                  <div className="quick-link-icon-container">
                    {getIconElement(link.iconType)}
                  </div>
                  <div className="quick-link-text">
                    <div className="quick-link-title">
                      {link.title}
                    </div>
                    <div className="quick-link-description">
                      {link.description || link.url}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate(link.url);
                  }}
                  className="quick-link-external-btn"
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
          <div className="recent-links-section">
            <div className="section-title">
              Recently Visited
            </div>
            <div className="recent-links-grid">
              {history.map((item) => (
                <div 
                  key={item.url}
                  className="recent-link-card group"
                >
                  <div 
                    onClick={() => onNavigate(item.url)}
                    className="recent-link-card-content"
                  >
                    <div className="recent-link-title" title={item.title}>
                      {item.title}
                    </div>
                    <div className="recent-link-time">
                      <Clock size={8} />
                      <span>{formatTime(item.timestamp)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => clearHistoryItem(item.url)}
                    className="recent-link-delete-btn"
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

