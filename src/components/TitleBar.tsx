import { useEffect, useState } from "react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { useShallow } from "zustand/react/shallow";

// We import dynamically or handle check to avoid crashing if run in plain web context
let appWindow: any = null;
try {
  // Tauri v2 API
  import("@tauri-apps/api/webviewWindow").then((m) => {
    appWindow = m.getCurrentWebviewWindow();
  }).catch((err) => {
    console.warn("Failed to load Tauri webviewWindow module:", err);
  });
} catch (e) {
  console.warn("Tauri APIs not available:", e);
}

export function TitleBar() {
  const activeWorkspaceId = useOrchestratorStore((s) => s.activeWorkspaceId);
  const workspaces = useOrchestratorStore(useShallow((s) => s.workspaces));
  
  const [isMaximized, setIsMaximized] = useState(false);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const workspaceName = activeWorkspace ? activeWorkspace.name : "";

  useEffect(() => {
    if (!appWindow) return;

    // Check initial state
    appWindow.isMaximized().then((maximized: boolean) => {
      setIsMaximized(maximized);
    }).catch(() => {});

    // Listen to resize events to update maximized state
    const unlistenPromise = appWindow.onResized(async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch (e) {}
    });

    return () => {
      unlistenPromise.then((unlisten: () => void) => unlisten()).catch(() => {});
    };
  }, []);

  const handleMinimize = async () => {
    if (appWindow) {
      try {
        await appWindow.minimize();
      } catch (e) {
        console.error("Failed to minimize window:", e);
      }
    }
  };

  const handleMaximize = async () => {
    if (appWindow) {
      try {
        await appWindow.toggleMaximize();
      } catch (e) {
        console.error("Failed to toggle maximize window:", e);
      }
    }
  };

  const handleClose = async () => {
    if (appWindow) {
      try {
        await appWindow.close();
      } catch (e) {
        console.error("Failed to close window:", e);
        // Fallback to exit_app command or window.close()
        window.close();
      }
    } else {
      window.close();
    }
  };

  return (
    <div className="h-[36px] w-full select-none flex items-center justify-between bg-[var(--bg-glass)]/40 backdrop-blur-md absolute top-0 left-0 z-[99999] border-b border-[var(--border-glass)]">
      {/* Drag Region underlay */}
      <div 
        data-tauri-drag-region 
        className="absolute inset-0 z-0 cursor-default" 
      />

      {/* Left section: App Brand Logo & Name */}
      <div className="flex items-center gap-2.5 pl-3.5 z-10 select-none pointer-events-none">
        <img 
          src="/logo_refined.png" 
          className="w-4 h-4 object-contain rounded-[3px]" 
          alt="Nexora Logo" 
        />
        <span 
          className="text-[12px] font-black tracking-[0.15em] uppercase bg-clip-text text-transparent font-sans"
          style={{
            backgroundImage: "linear-gradient(to right, var(--text-primary), var(--accent-primary), var(--accent-secondary))",
          }}
        >
          Nexora
        </span>
      </div>

      {/* Center Section: Empty Drag Area */}
      <div className="flex-1 h-full" data-tauri-drag-region />

      {/* Right Section: Windows controls */}
      <div className="flex items-center h-full z-10 select-none gap-3">
        {/* Windows Window Controls */}

        <div className="flex items-center h-full">
          {/* Minimize */}
          <button
            onClick={handleMinimize}
            title="Minimize"
            className="w-11 h-full flex items-center justify-center transition-all duration-150 group cursor-default hover:bg-[var(--bg-glass-hover)] active:bg-[var(--border-glass-active)]"
          >
            <svg 
              width="10" 
              height="1" 
              viewBox="0 0 10 1" 
              className="text-text-secondary group-hover:text-text-primary transition-colors"
            >
              <line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>

          {/* Maximize / Restore */}
          <button
            onClick={handleMaximize}
            title={isMaximized ? "Restore Down" : "Maximize"}
            className="w-11 h-full flex items-center justify-center transition-all duration-150 group cursor-default hover:bg-[var(--bg-glass-hover)] active:bg-[var(--border-glass-active)]"
          >
            {isMaximized ? (
              <svg 
                width="10" 
                height="10" 
                viewBox="0 0 10 10" 
                className="text-text-secondary group-hover:text-text-primary transition-colors"
              >
                <path d="M2,3 L2,2 L8,2 L8,8 L7,8" fill="none" stroke="currentColor" strokeWidth="1" />
                <rect x="1" y="3" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            ) : (
              <svg 
                width="10" 
                height="10" 
                viewBox="0 0 10 10" 
                className="text-text-secondary group-hover:text-text-primary transition-colors"
              >
                <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </button>

          {/* Close */}
          <button
            onClick={handleClose}
            title="Close"
            className="w-11 h-full flex items-center justify-center transition-all duration-150 group cursor-default hover:bg-[var(--titlebar-close-hover,#e81123)] active:bg-[var(--titlebar-close-active,#f1707a)]"
          >
            <svg 
              width="10" 
              height="10" 
              viewBox="0 0 10 10" 
              className="text-text-secondary group-hover:text-[var(--text-inverse)] transition-colors"
            >
              <path d="M1.5,1.5 L8.5,8.5 M8.5,1.5 L1.5,8.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}


