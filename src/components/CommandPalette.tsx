import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Search, 
  Terminal, 
  Cpu, 
  Settings, 
  Layers, 
  Activity, 
  Trash2, 
  BarChart2, 
  Command,
  ArrowRight,
  ShieldAlert
} from "lucide-react";

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: "Navigation" | "Actions" | "System";
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onOpenSettings: () => void;
  onTogglePerformance: () => void;
  onClearLogs: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenSettings,
  onTogglePerformance,
  onClearLogs,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: "nav-terminal",
        title: "Open Terminal Workspace",
        subtitle: "View and execute shell commands & PTY processes",
        category: "Navigation",
        icon: <Terminal size={16} className="text-sky-400" />,
        shortcut: "Alt+1",
        action: () => {
          onNavigate("terminal");
          onClose();
        },
      },
      {
        id: "nav-agents",
        title: "Open Agent Grid",
        subtitle: "Inspect multi-agent orchestration and status",
        category: "Navigation",
        icon: <Cpu size={16} className="text-indigo-400" />,
        shortcut: "Alt+2",
        action: () => {
          onNavigate("agents");
          onClose();
        },
      },
      {
        id: "nav-review",
        title: "Open Execution Review",
        subtitle: "Review agent diffs, changesets, and logs",
        category: "Navigation",
        icon: <BarChart2 size={16} className="text-violet-400" />,
        action: () => {
          onNavigate("review");
          onClose();
        },
      },
      {
        id: "nav-team",
        title: "Open Team Dashboard",
        subtitle: "Manage specialized agent teams and workflows",
        category: "Navigation",
        icon: <Layers size={16} className="text-emerald-400" />,
        action: () => {
          onNavigate("team");
          onClose();
        },
      },
      {
        id: "nav-settings",
        title: "Open Application Settings",
        subtitle: "Configure workspace, LLM kernels, and appearance",
        category: "Navigation",
        icon: <Settings size={16} className="text-zinc-400" />,
        action: () => {
          onOpenSettings();
          onClose();
        },
      },
      {
        id: "action-hud",
        title: "Toggle Performance HUD",
        subtitle: "Display real-time FPS, frame timing & memory metrics",
        category: "Actions",
        icon: <Activity size={16} className="text-amber-400" />,
        shortcut: "Ctrl+Shift+F12",
        action: () => {
          onTogglePerformance();
          onClose();
        },
      },
      {
        id: "action-clear-logs",
        title: "Clear Activity Feed",
        subtitle: "Wipe all current session log entries",
        category: "Actions",
        icon: <Trash2 size={16} className="text-rose-400" />,
        action: () => {
          onClearLogs();
          onClose();
        },
      },
    ],
    [onNavigate, onOpenSettings, onTogglePerformance, onClearLogs, onClose]
  );

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(q)) ||
        c.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredCommands.length > 0 ? (prev + 1) % filteredCommands.length : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredCommands.length > 0
            ? (prev - 1 + filteredCommands.length) % filteredCommands.length
            : 0
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="glass-command-palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-command-palette flex flex-col">
        {/* Search Header Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 bg-white/[0.02]">
          <Search size={18} className="text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search workspace... (Cmd+K)"
            className="w-full bg-transparent text-sm font-sans text-zinc-100 placeholder-zinc-500 outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono text-zinc-400 bg-white/5 border border-white/10 rounded">
            ESC
          </kbd>
        </div>

        {/* Command List Container */}
        <div className="max-h-[380px] overflow-y-auto p-2 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 font-mono flex flex-col items-center gap-2">
              <ShieldAlert size={20} className="text-zinc-600" />
              <span>No commands matching "{query}"</span>
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => cmd.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? "bg-indigo-500/20 border border-indigo-500/35 text-white"
                      : "text-zinc-300 hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg ${
                        isSelected ? "bg-indigo-500/30" : "bg-white/5"
                      }`}
                    >
                      {cmd.icon}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium font-sans truncate">
                        {cmd.title}
                      </span>
                      {cmd.subtitle && (
                        <span className="text-[11px] font-sans text-zinc-400 truncate">
                          {cmd.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {cmd.shortcut && (
                      <kbd className="px-2 py-0.5 text-[10px] font-mono text-zinc-400 bg-white/5 border border-white/10 rounded">
                        {cmd.shortcut}
                      </kbd>
                    )}
                    {isSelected && (
                      <ArrowRight size={14} className="text-indigo-400" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="px-4 py-2 border-t border-white/5 bg-black/40 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px]">
                ↑↓
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px]">
                ↵
              </kbd>{" "}
              Select
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Command size={11} /> Tier-1 Nexora
          </span>
        </div>
      </div>
    </div>
  );
};
