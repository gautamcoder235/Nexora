import { create } from "zustand";
import { BrowserTab } from "../types";

interface BrowserState {
  tabs: BrowserTab[];
  activeTabId: string | null;
  isBrowserPanelVisible: boolean;
  browserPanelWidth: number;

  // Actions
  addTab: (url?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  navigateTab: (id: string, url: string) => void;
  setBrowserState: (state: Partial<BrowserState>) => void;
  toggleBrowserPanel: () => void;
  setBrowserPanelWidth: (width: number) => void;
}

const normalizeUrl = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Check if it's localhost or loopback IP
  if (trimmed.startsWith("localhost") || trimmed.startsWith("127.0.0.1")) {
    return trimmed.includes("://") ? trimmed : `http://${trimmed}`;
  }

  // Check if it already has a protocol
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Check if it has a valid domain name pattern or a local dev port pattern
  const hasSpace = trimmed.includes(" ");
  const hasDot = trimmed.includes(".");
  const hasPort = /:\d+/.test(trimmed);

  if (!hasSpace && (hasDot || hasPort)) {
    return `https://${trimmed}`;
  }

  // Treat as search query
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
};

const getTitleFromUrl = (url: string): string => {
  if (!url) return "New Tab";
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "www.google.com" && parsed.pathname === "/search") {
      const q = parsed.searchParams.get("q");
      return q ? `Search: ${q}` : "Google Search";
    }
    return parsed.hostname;
  } catch (e) {
    return url;
  }
};

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  isBrowserPanelVisible: false,
  browserPanelWidth: 480,

  addTab: (url = "") => {
    const id = Math.random().toString(36).substring(7);
    const normalized = url ? normalizeUrl(url) : "";
    const newTab: BrowserTab = {
      id,
      url: normalized,
      title: getTitleFromUrl(normalized),
      isLoading: false,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: id,
    }));
  },

  closeTab: (id) => {
    set((state) => {
      const remainingTabs = state.tabs.filter((t) => t.id !== id);
      
      // If we closed the last tab, auto-open a new empty one
      if (remainingTabs.length === 0) {
        const newTabId = Math.random().toString(36).substring(7);
        const newTab: BrowserTab = {
          id: newTabId,
          url: "",
          title: "New Tab",
          isLoading: false,
        };
        return {
          tabs: [newTab],
          activeTabId: newTabId,
        };
      }

      // If we closed the currently active tab, switch focus to another
      let newActiveId = state.activeTabId;
      if (state.activeTabId === id) {
        const closedIdx = state.tabs.findIndex((t) => t.id === id);
        const nextIdx = Math.max(0, closedIdx - 1);
        newActiveId = remainingTabs[nextIdx].id;
      }

      return {
        tabs: remainingTabs,
        activeTabId: newActiveId,
      };
    });
  },

  setActiveTab: (id) => {
    set({ activeTabId: id });
  },

  navigateTab: (id, url) => {
    const normalized = normalizeUrl(url);
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              url: normalized,
              title: getTitleFromUrl(normalized),
            }
          : t
      ),
    }));
  },

  setBrowserState: (newState) => {
    set(newState);
  },

  toggleBrowserPanel: () => {
    set((state) => {
      const nextVisible = !state.isBrowserPanelVisible;
      
      // If we are opening the panel and there are no tabs, create an empty one
      const tabsUpdate = (nextVisible && state.tabs.length === 0)
        ? (() => {
            const tabId = Math.random().toString(36).substring(7);
            return {
              tabs: [{ id: tabId, url: "", title: "New Tab", isLoading: false }],
              activeTabId: tabId
            };
          })()
        : {};

      return {
        isBrowserPanelVisible: nextVisible,
        ...tabsUpdate
      };
    });
  },

  setBrowserPanelWidth: (width) => {
    set({ browserPanelWidth: width });
  },
}));
