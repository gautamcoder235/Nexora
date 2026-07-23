import { create } from "zustand";
import { BrowserTab, BrowserHistoryItem } from "../types";
import { invoke } from "@tauri-apps/api/core";

interface BrowserState {
  tabs: BrowserTab[];
  activeTabId: string | null;
  isBrowserPanelVisible: boolean;
  isBrowserPanelPinned: boolean;
  browserPanelWidth: number;
  isElementPickerOpen: boolean;
  history: BrowserHistoryItem[];
  isElectronConnected: boolean;

  // Actions
  addTab: (url?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  navigateTab: (id: string, url: string) => void;
  setBrowserState: (state: Partial<BrowserState>) => void;
  openBrowserPanel: (url?: string) => void;
  toggleBrowserPanel: (url?: string) => void;
  toggleBrowserPanelPinned: () => void;
  setBrowserPanelWidth: (width: number) => void;
  toggleElementPicker: () => void;
  addToHistory: (title: string, url: string) => void;
  clearHistoryItem: (url: string) => void;
  setElectronConnected: (connected: boolean) => void;
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
  isBrowserPanelPinned: false,
  browserPanelWidth: 480,
  isElementPickerOpen: false,
  history: [],
  isElectronConnected: false,

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

    if (normalized) {
      get().addToHistory(getTitleFromUrl(normalized), normalized);
    }
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
    if (normalized) {
      get().addToHistory(getTitleFromUrl(normalized), normalized);
    }
  },

  setBrowserState: (newState) => {
    const wasVisible = get().isBrowserPanelVisible;
    set(newState);
    if (newState.isBrowserPanelVisible && !wasVisible) {
      get().openBrowserPanel();
    }
  },

  openBrowserPanel: (url?: string) => {
    const { isElectronConnected, activeTabId, tabs } = get();
    let targetUrl = url;

    if (targetUrl) {
      if (activeTabId && tabs.some((t) => t.id === activeTabId)) {
        get().navigateTab(activeTabId, targetUrl);
      } else {
        get().addTab(targetUrl);
      }
    } else if (tabs.length === 0) {
      get().addTab("http://localhost:3000");
    }

    // Keep extra in-app panel hidden — separate Electron browser window is used exclusively
    set({ isBrowserPanelVisible: false });

    invoke("launch_electron_browser", { url: targetUrl || undefined })
      .then(() => {
        if (isElectronConnected) return;

        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          if (attempts > 20 || get().isElectronConnected) {
            clearInterval(interval);
            return;
          }
          try {
            const connected = await invoke<boolean>("check_electron_ping");
            if (connected) {
              set({ isElectronConnected: true });
              clearInterval(interval);
            }
          } catch (_) {}
        }, 100);
      })
      .catch((err) => {
        console.error("Failed to launch electron browser:", err);
      });
  },

  toggleBrowserPanel: (url?: string) => {
    const { isElectronConnected } = get();
    if (isElectronConnected && !url) {
      // Close the separate Electron browser window
      set({ isElectronConnected: false, isBrowserPanelVisible: false });
      invoke("close_electron_browser").catch((err) => {
        console.error("Failed to close electron browser:", err);
      });
    } else {
      // Launch / focus the separate Electron browser window
      get().openBrowserPanel(url);
    }
  },

  setElectronConnected: (connected) => {
    console.log("[Zustand Store] setElectronConnected called with:", connected);
    const updates: Partial<BrowserState> = { isElectronConnected: connected };
    if (!connected) {
      console.log("[Zustand Store] Connection lost, forcing isBrowserPanelVisible to false");
      updates.isBrowserPanelVisible = false;
    }
    set(updates);
  },

  toggleBrowserPanelPinned: () => {
    set((state) => ({ isBrowserPanelPinned: !state.isBrowserPanelPinned }));
  },

  setBrowserPanelWidth: (width) => {
    set({ browserPanelWidth: Math.max(320, width) });
  },

  toggleElementPicker: () => {
    set((state) => ({ isElementPickerOpen: !state.isElementPickerOpen }));
  },

  addToHistory: (title, url) => {
    set((state) => {
      const filtered = state.history.filter((h) => h.url !== url);
      const newItem = {
        title,
        url,
        timestamp: Date.now(),
      };
      const updatedHistory = [newItem, ...filtered].slice(0, 6);
      return { history: updatedHistory };
    });
  },

  clearHistoryItem: (url) => {
    set((state) => ({
      history: state.history.filter((h) => h.url !== url),
    }));
  },
}));
