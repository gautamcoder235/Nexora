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
  ShieldAlert,
  Camera,
  Loader2
} from "lucide-react";
import { useBrowserStore } from "../../stores/browserStore";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "./BrowserHome.css";

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
  const isExternal = !!(activeTab?.url && !isLocalUrl(activeTab.url));

  const [isPickMode, setIsPickMode] = useState(false);
  const [selectedEl, setSelectedEl] = useState<SelectedElementInfo | null>(null);
  const [isStylesExpanded, setIsStylesExpanded] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // States to keep track of CORS accessibility
  const [hasCorsError, setHasCorsError] = useState(false);

  const [screenshotSuccess, setScreenshotSuccess] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; title: string; message: string } | null>(null);

  const successTimeoutRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (type: "success" | "error", title: string, message: string) => {
    setToast({ type, title, message });
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Cleanup screenshot timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

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

  // Shared CSS for the magic-card highlighter effect
  const HIGHLIGHTER_CSS = `
    @property --angle {
      syntax: "<angle>";
      initial-value: 0deg;
      inherits: false;
    }

    .magic-card {
      --highlighter-radius: 0px;
      --highlighter-outer-radius: 0px;
      position: absolute;
      pointer-events: none;
      z-index: 999999;
      display: none;
      box-sizing: border-box;
      overflow: visible;
      isolation: isolate;
      transition: left 80ms ease-out, top 80ms ease-out, width 80ms ease-out, height 80ms ease-out;
    }

    .magic-card::before {
      content: "";
      position: absolute;
      inset: -10px;
      border-radius: var(--highlighter-outer-radius, 0px);
      background: conic-gradient(
        from var(--angle),
        #4285f4, #6b7cff, #8b5cf6, #d946ef, #ff0080,
        #ff8800, #ffee00, #00ff66, #00ffff, #0066ff, #4285f4
      );
      animation: nexora-spin 4s linear infinite;
      filter: blur(14px);
      opacity: 0.45;
      z-index: 0;
    }

    .magic-card::after {
      content: "";
      position: absolute;
      inset: 0;
      padding: 6px;
      border-radius: var(--highlighter-radius, 0px);
      background: conic-gradient(
        from var(--angle),
        #4285f4, #6b7cff, #8b5cf6, #d946ef, #ff0080,
        #ff8800, #ffee00, #00ff66, #00ffff, #0066ff, #4285f4
      );
      animation: nexora-spin 4s linear infinite;
      -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      filter: blur(2px);
      z-index: 5;
    }

    .magic-content {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: var(--highlighter-radius, 0px);
      z-index: 2;
      background: transparent;
    }

    .magic-overlay {
      display: none;
    }

    @keyframes nexora-spin {
      from { --angle: 0deg; }
      to { --angle: 360deg; }
    }
  `;

  const injectHighlighterStyles = (doc: Document) => {
    let styleEl = doc.getElementById("nexora-highlighter-styles");
    if (!styleEl) {
      styleEl = doc.createElement("style");
      styleEl.id = "nexora-highlighter-styles";
      styleEl.textContent = HIGHLIGHTER_CSS;
      doc.head.appendChild(styleEl);
    }
  };

  // Generate self-contained picker script for injection into native WebView
  const generatePickerScript = (): string => {
    return `(function() {
      if (window.__nexoraPickerActive) return;
      window.__nexoraPickerActive = true;

      // Inject styles
      var existingStyle = document.getElementById('nexora-highlighter-styles');
      if (existingStyle) existingStyle.remove();
      var styleEl = document.createElement('style');
      styleEl.id = 'nexora-highlighter-styles';
      styleEl.textContent = ${JSON.stringify(HIGHLIGHTER_CSS)};
      document.head.appendChild(styleEl);

      // Create highlighter element
      var existing = document.getElementById('nexora-element-highlighter');
      if (existing) existing.remove();
      var highlighter = document.createElement('div');
      highlighter.id = 'nexora-element-highlighter';
      highlighter.className = 'magic-card';
      var content = document.createElement('div');
      content.className = 'magic-content';
      var overlay = document.createElement('div');
      overlay.className = 'magic-overlay';
      content.appendChild(overlay);
      highlighter.appendChild(content);
      document.body.appendChild(highlighter);

      var activeEl = null;

      function escapeIdent(str) {
        if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(str);
        return str.replace(/([!"#$$%&'()*+,.\\/:;<=>?@\\[\\\\\\]^\x60{|}~])/g, '\\\\$$1');
      }

      function getSelector(el) {
        if (el.id) return '#' + escapeIdent(el.id);
        var path = [];
        var cur = el;
        while (cur && cur.nodeType === 1) {
          var sel = cur.nodeName.toLowerCase();
          if (cur.id) { sel += '#' + escapeIdent(cur.id); path.unshift(sel); break; }
          var cls = Array.from(cur.classList).filter(function(c) { return c !== 'nexora-highlight-outline'; }).map(escapeIdent).join('.');
          if (cls) sel += '.' + cls;
          var sib = cur, nth = 1;
          while (sib.previousElementSibling) { sib = sib.previousElementSibling; if (sib.nodeName.toLowerCase() === cur.nodeName.toLowerCase()) nth++; }
          if (nth > 1) sel += ':nth-of-type(' + nth + ')';
          path.unshift(sel);
          cur = cur.parentElement;
        }
        return path.join(' > ');
      }

      function getStandardRole(tag, el) {
        var roleAttr = el.getAttribute('role');
        if (roleAttr) return roleAttr;
        var map = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', form: 'form', table: 'table', img: 'img', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading' };
        if (tag === 'input') return el.getAttribute('type') === 'checkbox' ? 'checkbox' : 'textbox';
        return map[tag] || 'generic';
      }

      function handleMouseOver(e) {
        e.stopPropagation();
        var target = e.target;
        if (!target || target === document.body || target.id === 'nexora-element-highlighter' || target.closest('#nexora-element-highlighter')) return;
        activeEl = target;
        var rect = target.getBoundingClientRect();
        var scrollX = window.scrollX || document.documentElement.scrollLeft;
        var scrollY = window.scrollY || document.documentElement.scrollTop;

        highlighter.style.left = (rect.left + scrollX) + 'px';
        highlighter.style.top = (rect.top + scrollY) + 'px';
        highlighter.style.width = rect.width + 'px';
        highlighter.style.height = rect.height + 'px';
        highlighter.style.display = 'block';

        var cs = window.getComputedStyle(target);
        var tl = cs.borderTopLeftRadius || '0px';
        var tr = cs.borderTopRightRadius || '0px';
        var br = cs.borderBottomRightRadius || '0px';
        var bl = cs.borderBottomLeftRadius || '0px';
        var isZero = [tl, tr, br, bl].every(function(v) { var n = parseFloat(v); return isNaN(n) || n === 0; });
        var normRadius = isZero ? '0px' : tl + ' ' + tr + ' ' + br + ' ' + bl;
        var outerRadius = '0px';
        if (!isZero) {
          function addPx(v) { var n = parseFloat(v); if (isNaN(n)) return v; if (n === 0) return '0px'; if (v.includes('%')) return v; return (n + 10) + 'px'; }
          outerRadius = addPx(tl) + ' ' + addPx(tr) + ' ' + addPx(br) + ' ' + addPx(bl);
        }
        highlighter.style.setProperty('--highlighter-radius', normRadius);
        highlighter.style.setProperty('--highlighter-outer-radius', outerRadius);
      }

      function handleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!activeEl) return;

        var tag = activeEl.tagName.toLowerCase();
        var rect = activeEl.getBoundingClientRect();
        var cs = window.getComputedStyle(activeEl);
        var data = {
          tagName: tag,
          id: activeEl.id || 'None',
          classes: Array.from(activeEl.classList).join(' ') || 'None',
          textContent: (activeEl.innerText || '').trim().slice(0, 200) || 'None',
          outerHtml: activeEl.outerHTML.slice(0, 5000),
          innerHtml: activeEl.innerHTML.slice(0, 3000),
          selector: getSelector(activeEl),
          computedStyles: {
            display: cs.display,
            position: cs.position,
            width: cs.width && cs.width !== 'auto' ? cs.width : rect.width.toFixed(0) + 'px',
            height: cs.height && cs.height !== 'auto' ? cs.height : rect.height.toFixed(0) + 'px',
            color: cs.color,
            background: cs.backgroundColor || cs.background,
            'font-size': cs.fontSize
          },
          accessibility: {
            role: getStandardRole(tag, activeEl),
            label: activeEl.getAttribute('aria-label') || activeEl.getAttribute('placeholder') || (activeEl.innerText || '').trim().slice(0, 50) || 'None',
            focusable: activeEl.tabIndex >= 0 || ['BUTTON','INPUT','SELECT','TEXTAREA','A'].indexOf(activeEl.tagName) !== -1
          }
        };

        try {
          if (window.__TAURI_INTERNALS__) {
            window.__TAURI_INTERNALS__.invoke('relay_picked_element', { data: JSON.stringify(data) });
          } else {
            console.warn('[Nexora Picker] __TAURI_INTERNALS__ not available');
          }
        } catch (err) {
          console.error('[Nexora Picker] IPC error:', err);
        }
      }

      document.addEventListener('mouseover', handleMouseOver, true);
      document.addEventListener('click', handleClick, true);

      window.__nexoraPickerCleanup = function() {
        document.removeEventListener('mouseover', handleMouseOver, true);
        document.removeEventListener('click', handleClick, true);
        var h = document.getElementById('nexora-element-highlighter');
        if (h) h.remove();
        var s = document.getElementById('nexora-highlighter-styles');
        if (s) s.remove();
        delete window.__nexoraPickerActive;
        delete window.__nexoraPickerCleanup;
      };
    })();`;
  };

  const handleCopy = async (text: string, key: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleOpenDevTools = async () => {
    try {
      await invoke("open_browser_devtools", { label: "main" });
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
    const escapeIdentifier = (str: string): string => {
      if (typeof CSS !== "undefined" && CSS.escape) {
        return CSS.escape(str);
      }
      return str.replace(/([!"#$%&'()*+,.\/:;<=>?@\[\\\]^`{|}~])/g, "\\$1");
    };

    if (el.id) return `#${escapeIdentifier(el.id)}`;
    let path: string[] = [];
    let current: HTMLElement | null = el;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();
      if (current.id) {
        selector += `#${escapeIdentifier(current.id)}`;
        path.unshift(selector);
        break;
      } else {
        const classes = Array.from(current.classList)
          .filter(c => c !== "nexora-highlight-outline") // exclude highlighter styling classes
          .map(c => escapeIdentifier(c))
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

  // Reset all inspector states when the active tab switches or its URL changes
  useEffect(() => {
    setIsPickMode(false);
    setSelectedEl(null);
    setIsStylesExpanded(false);
    setCopiedKey(null);
    setHasCorsError(false);
    setScreenshotSuccess(false);
    setScreenshotError(null);
    setIsCapturingScreenshot(false);
    setToast(null);
  }, [activeTabId, activeTab?.url]);

  // ==============================
  //  PICK MODE — Unified handler
  // ==============================
  useEffect(() => {
    if (!isPickMode) {
      cleanupPicker();
      return;
    }

    setHasCorsError(false);
    let unlistenEvent: UnlistenFn | null = null;
    let usingWebViewInjection = false;

    const activatePicker = async () => {
      // === Branch A: Try iframe DOM access (for local URLs where CORS allows it) ===
      if (!isExternal) {
        const iframe = document.querySelector("iframe");
        if (iframe) {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document as Document;
            const win = iframe.contentWindow as Window & typeof globalThis;
            if (!doc || !win) throw new Error("Blocked frame access");
            const _title = doc.title; // Test access

            // Iframe DOM access works — use direct approach
            injectHighlighterStyles(doc);

            let highlighter = doc.getElementById("nexora-element-highlighter");
            if (!highlighter) {
              highlighter = doc.createElement("div");
              highlighter.id = "nexora-element-highlighter";
              highlighter.className = "magic-card";
              const content = doc.createElement("div");
              content.className = "magic-content";
              const overlay = doc.createElement("div");
              overlay.className = "magic-overlay";
              content.appendChild(overlay);
              highlighter.appendChild(content);
              doc.body.appendChild(highlighter);
            }

            let activeHoveredEl: HTMLElement | null = null;

            const handleMouseOver = (e: MouseEvent) => {
              e.stopPropagation();
              const target = e.target as HTMLElement;
              if (!target || target === doc.body || target.id === "nexora-element-highlighter" || target.closest?.("#nexora-element-highlighter")) return;

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

                const computedStyle = win.getComputedStyle(target);
                const tl = computedStyle.borderTopLeftRadius || "0px";
                const tr = computedStyle.borderTopRightRadius || "0px";
                const br = computedStyle.borderBottomRightRadius || "0px";
                const bl = computedStyle.borderBottomLeftRadius || "0px";
                const isZeroRadius = [tl, tr, br, bl].every(val => {
                  const num = parseFloat(val);
                  return isNaN(num) || num === 0;
                });

                let normRadius = `${tl} ${tr} ${br} ${bl}`;
                let outerRadius = "0px";
                if (isZeroRadius) {
                  normRadius = "0px";
                } else {
                  const pr = (val: string) => { const n = parseFloat(val); if (isNaN(n)) return val; if (n === 0) return "0px"; if (val.includes("%")) return val; return `${n + 10}px`; };
                  outerRadius = `${pr(tl)} ${pr(tr)} ${pr(br)} ${pr(bl)}`;
                }
                highlighter.style.setProperty("--highlighter-radius", normRadius);
                highlighter.style.setProperty("--highlighter-outer-radius", outerRadius);

                const minDim = Math.min(rect.width, rect.height);
                const blurVal = Math.max(12, Math.min(120, minDim * 0.4));
                highlighter.style.setProperty("--highlighter-blur", `${blurVal}px`);
              }
            };

            const handleClick = (e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              if (activeHoveredEl) {
                const rect = activeHoveredEl.getBoundingClientRect();
                const styles = win.getComputedStyle(activeHoveredEl);
                const tagName = activeHoveredEl.tagName.toLowerCase();
                setSelectedEl({
                  tagName,
                  id: activeHoveredEl.id || "None",
                  classes: Array.from(activeHoveredEl.classList).join(" ") || "None",
                  textContent: activeHoveredEl.innerText?.trim() || "None",
                  outerHtml: activeHoveredEl.outerHTML,
                  innerHtml: activeHoveredEl.innerHTML,
                  selector: getSelector(activeHoveredEl, doc),
                  computedStyles: {
                    display: styles.display,
                    position: styles.position,
                    width: styles.width && styles.width !== "auto" ? styles.width : `${rect.width.toFixed(0)}px`,
                    height: styles.height && styles.height !== "auto" ? styles.height : `${rect.height.toFixed(0)}px`,
                    color: styles.color,
                    background: styles.backgroundColor || styles.background,
                    "font-size": styles.fontSize,
                  },
                  accessibility: {
                    role: getStandardRole(tagName, activeHoveredEl),
                    label: activeHoveredEl.getAttribute("aria-label") || activeHoveredEl.getAttribute("placeholder") || activeHoveredEl.innerText?.trim().slice(0, 50) || "None",
                    focusable: activeHoveredEl.tabIndex >= 0 || ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"].includes(activeHoveredEl.tagName),
                  },
                });
              }
            };

            doc.addEventListener("mouseover", handleMouseOver, true);
            doc.addEventListener("click", handleClick, true);
            return; // Successfully set up iframe-based picker
          } catch (e) {
            console.warn("Iframe DOM access blocked, falling back to WebView injection", e);
            // Fall through to WebView injection approach
          }
        }
      }

      // === Branch B: WebView injection (for external URLs or CORS-blocked iframes) ===
      usingWebViewInjection = true;
      try {
        const pickerScript = generatePickerScript();
        await invoke("inject_picker_into_webview", { script: pickerScript });

        // Listen for element data relayed from the browser WebView via Rust
        unlistenEvent = await listen<string>("nexora-element-picked", (event) => {
          try {
            const data = JSON.parse(event.payload) as SelectedElementInfo;
            setSelectedEl(data);
          } catch (err) {
            console.error("Failed to parse relayed element data:", err);
          }
        });
      } catch (err) {
        console.error("Failed to inject picker into WebView:", err);
        setHasCorsError(true);
        setIsPickMode(false);
      }
    };

    activatePicker();

    return () => {
      if (unlistenEvent) {
        unlistenEvent();
        unlistenEvent = null;
      }
      cleanupPicker(usingWebViewInjection);
    };
  }, [isPickMode, isExternal]);

  const cleanupPicker = (wasWebViewInjection?: boolean) => {
    // Clean up iframe-based picker
    const iframe = document.querySelector("iframe");
    if (iframe) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document as Document;
        if (doc) {
          const highlighter = doc.getElementById("nexora-element-highlighter");
          if (highlighter) highlighter.remove();
        }
      } catch (e) { /* CORS - ignore */ }
    }
    // Clean up WebView-injected picker
    if (wasWebViewInjection !== false) {
      invoke("remove_picker_from_webview").catch(() => {});
    }
  };

  // Capture element screenshot and copy to clipboard
  const captureElementScreenshot = async () => {
    if (!selectedEl) {
      setScreenshotError("No element selected");
      showToast("error", "Capture Failed", "No element selected");
      return;
    }

    const iframe = document.querySelector("iframe");
    if (!iframe) {
      setScreenshotError("No preview frame found");
      showToast("error", "Capture Failed", "No preview frame found");
      return;
    }

    try {
      setIsCapturingScreenshot(true);
      setScreenshotError(null);
      const iframeWindow = iframe.contentWindow;
      const doc = iframe.contentDocument || iframeWindow?.document;
      if (!doc || !iframeWindow) {
        setScreenshotError("Access to preview frame denied");
        showToast("error", "Capture Failed", "Access to preview frame denied");
        setIsCapturingScreenshot(false);
        return;
      }

      const element = doc.querySelector(selectedEl.selector) as HTMLElement | null;
      if (!element) {
        setScreenshotError(`Element not found in DOM: ${selectedEl.selector}`);
        showToast("error", "Capture Failed", `Element not found in DOM: ${selectedEl.selector}`);
        setIsCapturingScreenshot(false);
        return;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        setScreenshotError("Element has zero width or height");
        showToast("error", "Capture Failed", "Element has zero width or height");
        setIsCapturingScreenshot(false);
        return;
      }

      // Clone element and inline computed styles recursively
      const clone = element.cloneNode(true) as HTMLElement;
      
      const inlineStylesRecursive = (src: HTMLElement, dest: HTMLElement) => {
        const computed = iframeWindow.getComputedStyle(src);
        for (let i = 0; i < computed.length; i++) {
          const prop = computed[i];
          dest.style.setProperty(
            prop, 
            computed.getPropertyValue(prop), 
            computed.getPropertyPriority(prop)
          );
        }
        
        const srcChildren = Array.from(src.children) as HTMLElement[];
        const destChildren = Array.from(dest.children) as HTMLElement[];
        for (let i = 0; i < srcChildren.length; i++) {
          inlineStylesRecursive(srcChildren[i], destChildren[i]);
        }
      };

      inlineStylesRecursive(element, clone);

      // Inline all images inside the clone as base64 to prevent canvas tainting
      const inlineImages = async (dest: HTMLElement) => {
        const imgs = [
          ...(dest.tagName.toLowerCase() === "img" ? [dest] : []),
          ...Array.from(dest.querySelectorAll("img"))
        ] as HTMLImageElement[];
        
        for (const img of imgs) {
          try {
            if (!img.src) continue;
            if (img.src.startsWith("data:")) continue;
            
            // Resolve relative url
            const resolvedUrl = new URL(img.src, iframe.src || window.location.href).href;
            
            const response = await fetch(resolvedUrl);
            if (response.ok) {
              const blob = await response.blob();
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              img.src = base64;
            } else {
              // Fetch failed, remove src to prevent canvas tainting on cross-origin/error
              img.removeAttribute("src");
            }
          } catch (e) {
            console.warn("Failed to inline image base64:", img.src, e);
            // Remove src on exception to prevent canvas tainting
            img.removeAttribute("src");
          }
        }
      };

      // Inline all CSS url("...") values to prevent canvas tainting
      const inlineCssUrls = async (dest: HTMLElement) => {
        const elements = [dest, ...Array.from(dest.querySelectorAll("*"))] as HTMLElement[];
        
        for (const el of elements) {
          if (!el.style) continue;
          
          for (let i = 0; i < el.style.length; i++) {
            const prop = el.style[i];
            const value = el.style.getPropertyValue(prop);
            
            if (value && value.includes("url(")) {
              const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;
              let match;
              let newValue = value;
              const replacements: Array<{ original: string; base64: string }> = [];
              
              while ((match = urlRegex.exec(value)) !== null) {
                const originalMatch = match[0];
                const rawUrl = match[1];
                
                if (rawUrl.startsWith("data:")) continue;
                
                try {
                  const resolvedUrl = new URL(rawUrl, iframe.src || window.location.href).href;
                  const response = await fetch(resolvedUrl);
                  if (response.ok) {
                    const blob = await response.blob();
                    const base64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(blob);
                    });
                    replacements.push({ original: originalMatch, base64: `url("${base64}")` });
                  } else {
                    replacements.push({ original: originalMatch, base64: "none" });
                  }
                } catch (e) {
                  console.warn("Failed to inline CSS url:", rawUrl, e);
                  replacements.push({ original: originalMatch, base64: "none" });
                }
              }
              
              for (const rep of replacements) {
                newValue = newValue.replace(rep.original, rep.base64);
              }
              
              if (newValue !== value) {
                el.style.setProperty(prop, newValue, el.style.getPropertyPriority(prop));
              }
            }
          }
        }
      };

      // Inline SVG <use> tag hrefs
      const inlineSvgUses = async (dest: HTMLElement) => {
        const uses = Array.from(dest.querySelectorAll("use")) as SVGUseElement[];
        for (const use of uses) {
          try {
            const href = use.getAttribute("href") || use.getAttribute("xlink:href");
            if (!href) continue;
            if (href.startsWith("#")) continue;
            
            const [urlPart, hashPart] = href.split("#");
            if (!hashPart) continue;
            
            const resolvedUrl = new URL(urlPart, iframe.src || window.location.href).href;
            const response = await fetch(resolvedUrl);
            if (response.ok) {
              const text = await response.text();
              const parser = new DOMParser();
              const doc = parser.parseFromString(text, "image/svg+xml");
              const symbol = doc.getElementById(hashPart);
              if (symbol) {
                const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                for (let i = 0; i < use.attributes.length; i++) {
                  const attr = use.attributes[i];
                  if (attr.name !== "href" && attr.name !== "xlink:href") {
                    g.setAttribute(attr.name, attr.value);
                  }
                }
                for (const child of Array.from(symbol.childNodes)) {
                  g.appendChild(child.cloneNode(true));
                }
                use.parentNode?.replaceChild(g, use);
              }
            }
          } catch (e) {
            console.warn("Failed to inline SVG use element:", e);
            use.removeAttribute("href");
            use.removeAttribute("xlink:href");
          }
        }
      };

      await inlineImages(clone);
      await inlineCssUrls(clone);
      await inlineSvgUses(clone);

      // Serialize clone to XML string
      const serializer = new XMLSerializer();
      const elementHTML = serializer.serializeToString(clone);

      // Construct SVG with foreignObject containing the HTML
      const svgData = `
        <svg xmlns="http://www.w3.org/2000/svg" 
             width="${Math.ceil(rect.width)}" 
             height="${Math.ceil(rect.height)}">
          <style>
            * { 
              box-sizing: border-box; 
            }
          </style>
          <foreignObject x="0" y="0" width="100%" height="100%">
            ${elementHTML}
          </foreignObject>
        </svg>
      `.trim();

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(rect.width);
      canvas.height = Math.ceil(rect.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setScreenshotError("Failed to get 2D canvas context");
        showToast("error", "Capture Failed", "Failed to get 2D canvas context");
        setIsCapturingScreenshot(false);
        return;
      }

      const img = new Image();
      const base64Svg = btoa(unescape(encodeURIComponent(svgData)));
      const url = `data:image/svg+xml;base64,${base64Svg}`;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          try {
            ctx.drawImage(img, 0, 0);
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => {
          reject(new Error("Failed to render element as SVG image"));
        };
        img.src = url;
      });

      // Write canvas PNG blob to system clipboard
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setScreenshotError("Failed to create PNG blob");
            showToast("error", "Capture Failed", "Failed to create PNG blob");
            setIsCapturingScreenshot(false);
            return;
          }

          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                "image/png": blob,
              }),
            ]);

            setScreenshotSuccess(true);
            showToast("success", "Screenshot Copied", "Element PNG copied to clipboard!");
            if (successTimeoutRef.current) {
              clearTimeout(successTimeoutRef.current);
            }
            successTimeoutRef.current = window.setTimeout(() => {
              setScreenshotSuccess(false);
            }, 2000);
          } catch (err: any) {
            console.error("Screenshot clipboard write failed:", err);
            const errMsg = err?.message || String(err);
            const errName = err?.name || "Error";
            setScreenshotError(
              `Failed to write to clipboard: ${errName}: ${errMsg}`
            );
            showToast("error", "Clipboard Error", `Failed to write: ${errName}: ${errMsg}`);
          } finally {
            setIsCapturingScreenshot(false);
          }
        },
        "image/png",
        1.0
      );
    } catch (err: any) {
      console.error("Screenshot capture failed:", err);
      const errMsg = err?.message || String(err);
      const errName = err?.name || "Error";
      setScreenshotError(`Capture failed: ${errName}: ${errMsg}`);
      showToast("error", "Capture Failed", `Capture failed: ${errName}: ${errMsg}`);
      setIsCapturingScreenshot(false);
    }
  };

  return (
    <div className="relative w-[330px] border-l border-border-glass bg-[#08080a]/90 backdrop-blur-xl h-full flex flex-col min-w-0 select-none text-zinc-350 text-xs font-sans overflow-hidden">
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
        {/* Pick Mode Card — works for all URLs */}
        <div 
          onClick={() => {
            if (hasCorsError) return;
            setIsPickMode(!isPickMode);
          }}
          className={`p-3.5 rounded-xl border border-border-glass bg-white/[0.01] hover:bg-white/[0.03] active:bg-white/[0.05] transition-all cursor-pointer flex flex-col gap-2 relative ${
            hasCorsError ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <div className="flex items-center justify-between select-none">
            <div>
              <span className="font-bold text-zinc-200 block text-[11px]">Pick mode</span>
              <span className="text-[9px] text-zinc-500">
                {isExternal ? "Click an element on the page (via WebView)" : "Click an element to capture it"}
              </span>
            </div>
            <div
              className={`w-9 h-5 rounded-full p-0.5 transition-all relative ${
                isPickMode ? "bg-purple-650" : "bg-zinc-800"
              }`}
            >
              <div 
                className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-200 ${
                  isPickMode ? "translate-x-4" : "translate-x-0"
                }`} 
              />
            </div>
          </div>
          {isExternal && isPickMode && (
            <div className="text-[9px] text-purple-400 flex items-center gap-1.5 mt-1 bg-purple-500/5 px-2 py-1 rounded border border-purple-500/10">
              <Info size={10} />
              <span>Inspecting via native WebView injection</span>
            </div>
          )}
          {hasCorsError && (
            <div className="text-[9px] text-amber-500 flex items-center gap-1.5 mt-1 bg-amber-500/5 px-2 py-1 rounded border border-amber-500/10">
              <Info size={10} />
              <span>Failed to inject picker — try reloading the page.</span>
            </div>
          )}
        </div>

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
                  onClick={captureElementScreenshot}
                  disabled={isExternal || isCapturingScreenshot}
                  title={
                    isExternal
                      ? "Screenshot only works with same-origin iframe previews"
                      : isCapturingScreenshot
                      ? "Capturing element screenshot..."
                      : "Copy element screenshot to clipboard"
                  }
                  className={`w-full flex items-center justify-between p-2.5 hover:bg-white/5 transition-all text-left cursor-pointer ${
                    isExternal ? "opacity-35 cursor-not-allowed text-zinc-550" : "text-zinc-400 hover:text-zinc-200"
                  } ${isCapturingScreenshot ? "opacity-60 cursor-wait text-purple-455 bg-purple-500/5" : ""}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={isCapturingScreenshot ? "text-purple-400 animate-pulse font-semibold" : ""}>
                      » {isCapturingScreenshot ? "Capturing Element..." : "Copy Element Screenshot"}
                    </span>
                  </span>
                  {isCapturingScreenshot ? (
                    <Loader2 size={11} className="animate-spin text-purple-400" />
                  ) : screenshotSuccess ? (
                    <Check size={11} className="text-emerald-400" />
                  ) : (
                    <Camera size={11} className={isExternal ? "text-zinc-555" : "text-zinc-400"} />
                  )}
                </button>
                <button
                  onClick={handleOpenDevTools}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 transition-colors text-left text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <span>» Open in DevTools</span>
                  <ExternalLink size={11} />
                </button>
              </div>
              {screenshotError && (
                <div className="mt-2 p-2 rounded border border-rose-500/20 bg-rose-500/5 text-rose-450 text-[10px] flex items-center gap-1.5 leading-normal">
                  <Info size={11} className="shrink-0 text-rose-400" />
                  <span>{screenshotError}</span>
                </div>
              )}
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

      {/* Toast Notification */}
      {toast && (
        <div className={`picker-toast ${toast.type === "error" ? "toast-error" : ""}`}>
          <div className={`p-1.5 rounded-lg border flex items-center justify-center shrink-0 ${
            toast.type === "success" 
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
              : "bg-rose-500/10 border-rose-500/20 text-rose-455"
          }`}>
            {toast.type === "success" ? <Check size={12} /> : <ShieldAlert size={12} />}
          </div>
          <div className="flex-grow min-w-0 text-left">
            <div className="text-[10px] font-extrabold text-zinc-200 uppercase tracking-wider">
              {toast.title}
            </div>
            <div className="text-[9px] text-zinc-400 mt-0.5 leading-normal max-h-[36px] overflow-hidden text-ellipsis line-clamp-2 break-words">
              {toast.message}
            </div>
          </div>
          <button 
            onClick={() => setToast(null)}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
};
