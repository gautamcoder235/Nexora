import React, { useState, useEffect, useRef } from "react";
import { 
  Target, 
  X, 
  Copy, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp, 
  Info, 
  Check, 
  Code,
  ShieldAlert
} from "lucide-react";
import { useBrowserStore } from "../../stores/browserStore";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface SelectedElementInfo {
  tagName: string;
  id: string;
  classes: string;
  textContent: string;
  outerHtml: string;
  innerHtml: string;
  selector: string;
  computedStyles: Record<string, string>;
  accessibility: {
    role: string;
    label: string;
    focusable: boolean;
  };
}

export const ElementPickerPanel: React.FC = () => {
  const { toggleElementPicker, activeTabId, tabs } = useBrowserStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isExternal = activeTab?.url && !isLocalUrl(activeTab.url);

  const [isPickMode, setIsPickMode] = useState(false);
  const [selectedEl, setSelectedEl] = useState<SelectedElementInfo | null>(null);
  const [isStylesExpanded, setIsStylesExpanded] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // States to keep track of CORS accessibility
  const [hasCorsError, setHasCorsError] = useState(false);

  function isLocalUrl(url: string): boolean {
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
  }

  const handleCopy = async (text: string, key: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleOpenDevTools = async () => {
    try {
      const win = getCurrentWindow() as any;
      await win.openDevTools();
    } catch (err) {
      console.error("Failed to open DevTools:", err);
    }
  };

  // Helper to determine standard roles based on tags
  const getStandardRole = (tagName: string, el: HTMLElement): string => {
    const roleAttr = el.getAttribute("role");
    if (roleAttr) return roleAttr;

    const map: Record<string, string> = {
      button: "button",
      input: el.getAttribute("type") === "checkbox" ? "checkbox" : "textbox",
      a: "link",
      select: "combobox",
      textarea: "textbox",
      form: "form",
      table: "table",
      img: "img",
      h1: "heading",
      h2: "heading",
      h3: "heading",
      h4: "heading",
      h5: "heading",
      h6: "heading",
    };
    return map[tagName] || "generic";
  };

  // Generate clean CSS selector recursively
  const getSelector = (el: HTMLElement, doc: Document): string => {
    if (el.id) return `#${el.id}`;
    let path: string[] = [];
    let current: HTMLElement | null = el;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      } else {
        const classes = Array.from(current.classList)
          .filter(c => c !== "nexora-highlight-outline") // exclude highlighter styling classes
          .join(".");
        if (classes) {
          selector += `.${classes}`;
        }
        
        let sibling = current;
        let nth = 1;
        while (sibling.previousElementSibling) {
          sibling = sibling.previousElementSibling as HTMLElement;
          if (sibling.nodeName.toLowerCase() === current.nodeName.toLowerCase()) {
            nth++;
          }
        }
        if (nth > 1) {
          selector += `:nth-of-type(${nth})`;
        }
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(" > ");
  };

  useEffect(() => {
    if (!isPickMode || isExternal) {
      cleanupListeners();
      return;
    }

    setHasCorsError(false);
    const iframe = document.querySelector("iframe");
    if (!iframe) {
      setIsPickMode(false);
      return;
    }

    let doc: Document;
    let win: Window & typeof globalThis;
    try {
      doc = iframe.contentDocument || iframe.contentWindow?.document as Document;
      win = iframe.contentWindow as Window & typeof globalThis;
      if (!doc) throw new Error("Blocked frame access");
      // Read title just to test access
      const _title = doc.title; 
    } catch (e) {
      console.warn("CORS block: Cannot access iframe DOM due to cross-origin policies", e);
      setHasCorsError(true);
      setIsPickMode(false);
      return;
    }

    // Create a highlighter overlay inside the iframe document
    let highlighter = doc.getElementById("nexora-element-highlighter");
    if (!highlighter) {
      highlighter = doc.createElement("div");
      highlighter.id = "nexora-element-highlighter";
      highlighter.style.position = "absolute";
      highlighter.style.pointerEvents = "none";
      highlighter.style.zIndex = "999999";
      highlighter.style.border = "1px solid rgba(168, 85, 247, 0.75)";
      highlighter.style.backgroundColor = "rgba(168, 85, 247, 0.15)";
      highlighter.style.boxShadow = "0 0 10px rgba(168, 85, 247, 0.1)";
      highlighter.style.transition = "all 80ms ease-out";
      highlighter.style.display = "none";
      
      // Nested padding container
      const paddingBox = doc.createElement("div");
      paddingBox.style.width = "100%";
      paddingBox.style.height = "100%";
      paddingBox.style.backgroundColor = "rgba(16, 185, 129, 0.08)";
      paddingBox.style.border = "1px dashed rgba(16, 185, 129, 0.2)";
      highlighter.appendChild(paddingBox);

      doc.body.appendChild(highlighter);
    }

    let activeHoveredEl: HTMLElement | null = null;

    const handleMouseOver = (e: MouseEvent) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      if (!target || target === doc.body || target.id === "nexora-element-highlighter") return;

      activeHoveredEl = target;
      const rect = target.getBoundingClientRect();
      const scrollX = win.scrollX || doc.documentElement.scrollLeft;
      const scrollY = win.scrollY || doc.documentElement.scrollTop;

      if (highlighter) {
        highlighter.style.left = `${rect.left + scrollX}px`;
        highlighter.style.top = `${rect.top + scrollY}px`;
        highlighter.style.width = `${rect.width}px`;
        highlighter.style.height = `${rect.height}px`;
        highlighter.style.display = "block";
      }
    };

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (activeHoveredEl) {
        const rect = activeHoveredEl.getBoundingClientRect();
        const styles = win.getComputedStyle(activeHoveredEl);

        const tagName = activeHoveredEl.tagName.toLowerCase();
        const computedStyles = {
          display: styles.display,
          position: styles.position,
          width: styles.width && styles.width !== "auto" ? styles.width : `${rect.width.toFixed(0)}px`,
          height: styles.height && styles.height !== "auto" ? styles.height : `${rect.height.toFixed(0)}px`,
          color: styles.color,
          background: styles.backgroundColor || styles.background,
          "font-size": styles.fontSize,
        };

        const accessibility = {
          role: getStandardRole(tagName, activeHoveredEl),
          label: activeHoveredEl.getAttribute("aria-label") || activeHoveredEl.getAttribute("placeholder") || activeHoveredEl.innerText?.trim().slice(0, 50) || "None",
          focusable: activeHoveredEl.tabIndex >= 0 || ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"].includes(activeHoveredEl.tagName),
        };

        setSelectedEl({
          tagName,
          id: activeHoveredEl.id || "None",
          classes: Array.from(activeHoveredEl.classList).join(" ") || "None",
          textContent: activeHoveredEl.innerText?.trim() || "None",
          outerHtml: activeHoveredEl.outerHTML,
          innerHtml: activeHoveredEl.innerHTML,
          selector: getSelector(activeHoveredEl, doc),
          computedStyles,
          accessibility,
        });

        setIsPickMode(false);
      }
    };

    doc.addEventListener("mouseover", handleMouseOver, true);
    doc.addEventListener("click", handleClick, true);

    return () => {
      cleanupListeners();
    };
  }, [isPickMode, isExternal]);

  const cleanupListeners = () => {
    const iframe = document.querySelector("iframe");
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document as Document;
      if (!doc) return;

      const highlighter = doc.getElementById("nexora-element-highlighter");
      if (highlighter) {
        highlighter.remove();
      }
      // We don't have direct references to mouseover/click listener handles here,
      // so we let the browser clean up or we reload the frame if needed. But standard
      // practice is to save the reference. Let's make sure listeners are detached.
    } catch (e) {}
  };

  return (
    <div className="w-[330px] border-l border-border-glass bg-[#08080a]/90 backdrop-blur-xl h-full flex flex-col min-w-0 select-none text-zinc-350 text-xs font-sans overflow-hidden">
      {/* 1. Header */}
      <div className="px-4 py-3 border-b border-border-glass flex items-center justify-between flex-shrink-0 bg-black/10">
        <div className="flex items-center gap-2 font-bold text-zinc-200">
          <Target size={14} className="text-purple-400" />
          <span>Element Picker</span>
        </div>
        <button 
          onClick={toggleElementPicker}
          className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scrollbar-none">
        <p className="text-[10px] text-zinc-500 leading-normal">
          Hover over any element on the page inside your local preview to inspect or copy its properties.
        </p>

        {/* 2. Pick Mode Card */}
        {isExternal ? (
          <div className="p-3.5 rounded-xl border border-amber-500/10 bg-amber-500/[0.02] flex gap-3 items-start text-amber-500/90 leading-relaxed">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider">CORS Limit Active</div>
              <div className="text-[9px] text-zinc-500 font-sans">
                Inspection is only available on local previews (localhost). Native WebView external pages cannot be inspected.
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl border border-border-glass bg-white/[0.01] flex flex-col gap-2 relative">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-zinc-200 block text-[11px]">Pick mode</span>
                <span className="text-[9px] text-zinc-500">Click an element to capture it</span>
              </div>
              <button
                onClick={() => {
                  if (hasCorsError) return;
                  setIsPickMode(!isPickMode);
                }}
                disabled={hasCorsError}
                className={`w-9 h-5 rounded-full p-0.5 transition-all cursor-pointer relative ${
                  isPickMode ? "bg-purple-650" : "bg-zinc-800"
                } ${hasCorsError ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <div 
                  className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-200 ${
                    isPickMode ? "translate-x-4" : "translate-x-0"
                  }`} 
                />
              </button>
            </div>
            {hasCorsError && (
              <div className="text-[9px] text-amber-500 flex items-center gap-1.5 mt-1 bg-amber-500/5 px-2 py-1 rounded border border-amber-500/10">
                <Info size={10} />
                <span>CORS Block: access to iframe DOM denied.</span>
              </div>
            )}
          </div>
        )}

        {/* 3. Empty state vs Captured Details */}
        {!selectedEl ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 border border-dashed border-white/[0.04] rounded-xl text-center text-zinc-500 space-y-3">
            <Code size={24} className="text-zinc-650" />
            <div>
              <div className="text-[11px] font-semibold text-zinc-400">No element selected</div>
              <div className="text-[9px] text-zinc-500 mt-1 leading-normal">
                {isPickMode ? "Click any component in the preview frame to inspect" : "Toggle Pick Mode above to capture an element"}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 font-mono">
            {/* HTML Preview Section */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold text-zinc-500 uppercase font-mono tracking-wider pl-0.5">Selected Element</span>
              <div className="relative group rounded-lg border border-border-glass bg-black/60 p-3 overflow-x-auto text-[10px] text-purple-400 leading-relaxed font-mono select-text min-h-[46px] max-h-48 scrollbar-none">
                <code>{selectedEl.outerHtml.slice(0, 500)}{selectedEl.outerHtml.length > 500 ? "..." : ""}</code>
                <button
                  onClick={() => handleCopy(selectedEl.outerHtml, "outerHtml")}
                  className="absolute right-2 bottom-2 p-1 rounded bg-zinc-950 border border-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="Copy Outer HTML"
                >
                  {copiedKey === "outerHtml" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
              </div>
            </div>

            {/* Selector Section */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold text-zinc-500 uppercase font-mono tracking-wider pl-0.5">Selector</span>
              <div className="relative group rounded-lg border border-border-glass bg-black/60 p-3 text-[10px] text-zinc-300 flex items-center justify-between min-h-[36px]">
                <span className="truncate pr-8 select-text">{selectedEl.selector}</span>
                <button
                  onClick={() => handleCopy(selectedEl.selector, "selector")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded bg-zinc-950 border border-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="Copy Selector"
                >
                  {copiedKey === "selector" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
              </div>
            </div>

            {/* Element Details Table */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold text-zinc-500 uppercase font-mono tracking-wider pl-0.5">Element Details</span>
              <div className="rounded-lg border border-border-glass overflow-hidden divide-y divide-white/[0.03] text-[10px] bg-black/20">
                <div className="flex justify-between p-2.5">
                  <span className="text-zinc-500 font-semibold">Tag</span>
                  <span className="text-zinc-300">{selectedEl.tagName}</span>
                </div>
                <div className="flex justify-between p-2.5">
                  <span className="text-zinc-500 font-semibold">ID</span>
                  <span className="text-zinc-300 truncate max-w-[160px]" title={selectedEl.id}>{selectedEl.id}</span>
                </div>
                <div className="flex justify-between p-2.5">
                  <span className="text-zinc-500 font-semibold">Classes</span>
                  <span className="text-zinc-300 truncate max-w-[160px]" title={selectedEl.classes}>{selectedEl.classes}</span>
                </div>
                <div className="flex justify-between p-2.5">
                  <span className="text-zinc-500 font-semibold">Text</span>
                  <span className="text-zinc-300 truncate max-w-[160px]" title={selectedEl.textContent}>{selectedEl.textContent}</span>
                </div>
              </div>
            </div>

            {/* Computed Styles Collapsible */}
            <div className="border border-border-glass rounded-lg overflow-hidden bg-black/20">
              <button
                onClick={() => setIsStylesExpanded(!isStylesExpanded)}
                className="w-full flex items-center justify-between p-2.5 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500 border-b border-white/[0.03] hover:text-zinc-300 transition-colors cursor-pointer"
              >
                <span>Computed Styles</span>
                {isStylesExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {isStylesExpanded && (
                <div className="divide-y divide-white/[0.03] text-[10px] bg-black/10">
                  {Object.entries(selectedEl.computedStyles).map(([key, val]) => (
                    <div key={key} className="flex justify-between p-2.5">
                      <span className="text-zinc-500">{key}</span>
                      <span className="text-zinc-300">{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Accessibility Section */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold text-zinc-500 uppercase font-mono tracking-wider pl-0.5">Accessibility</span>
              <div className="rounded-lg border border-border-glass overflow-hidden divide-y divide-white/[0.03] text-[10px] bg-black/20">
                <div className="flex justify-between p-2.5">
                  <span className="text-zinc-500 font-semibold">Role</span>
                  <span className="text-zinc-300">{selectedEl.accessibility.role}</span>
                </div>
                <div className="flex justify-between p-2.5">
                  <span className="text-zinc-500 font-semibold">Label</span>
                  <span className="text-zinc-300 truncate max-w-[160px]" title={selectedEl.accessibility.label}>{selectedEl.accessibility.label}</span>
                </div>
                <div className="flex justify-between p-2.5">
                  <span className="text-zinc-500 font-semibold">Focusable</span>
                  <span className="text-zinc-300">{selectedEl.accessibility.focusable ? "true" : "false"}</span>
                </div>
              </div>
            </div>

            {/* Actions list */}
            <div className="space-y-1.5 pt-2">
              <span className="text-[9px] font-bold text-zinc-500 uppercase font-mono tracking-wider pl-0.5">Actions</span>
              <div className="rounded-lg border border-border-glass divide-y divide-white/[0.03] bg-black/25 overflow-hidden text-[10px]">
                <button
                  onClick={() => handleCopy(selectedEl.selector, "copySelectorAction")}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 transition-colors text-left text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <span>» Copy Selector</span>
                  {copiedKey === "copySelectorAction" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
                <button
                  onClick={() => handleCopy(selectedEl.outerHtml, "copyOuterHtmlAction")}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 transition-colors text-left text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <span>» Copy Outer HTML</span>
                  {copiedKey === "copyOuterHtmlAction" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
                <button
                  onClick={() => handleCopy(selectedEl.innerHtml, "copyInnerHtmlAction")}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 transition-colors text-left text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <span>» Copy Inner HTML</span>
                  {copiedKey === "copyInnerHtmlAction" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
                <button
                  onClick={() => {
                    const styleStr = Object.entries(selectedEl.computedStyles).map(([k, v]) => `${k}: ${v};`).join("\n");
                    handleCopy(styleStr, "copyStylesAction");
                  }}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 transition-colors text-left text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <span>» Copy Styles</span>
                  {copiedKey === "copyStylesAction" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
                <button
                  onClick={handleOpenDevTools}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 transition-colors text-left text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <span>» Open in DevTools</span>
                  <ExternalLink size={11} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Footer */}
      <div className="px-4 py-3 border-t border-border-glass bg-black/10 flex items-center gap-1.5 flex-shrink-0 text-[10px] text-zinc-500 font-sans">
        <Info size={11} />
        <span>Learn more about </span>
        <button 
          onClick={handleOpenDevTools} 
          className="text-purple-400 hover:underline cursor-pointer"
        >
          Element Picker
        </button>
      </div>
    </div>
  );
};
