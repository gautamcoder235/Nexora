const { contextBridge, ipcRenderer } = require('electron');

if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('electron', {
    send: (channel, data) => {
      const validChannels = [
        'browser-back',
        'browser-forward',
        'browser-reload',
        'browser-go-home',
        'browser-navigate',
        'toggle-sidebar',
        'set-pick-mode',
        'copy-to-clipboard',
        'copy-element-screenshot',
        'open-element-devtools',
        'create-tab',
        'switch-tab',
        'close-tab',
        'get-history',
        'delete-history-item',
        'clear-history',
        'get-site-settings',
        'set-site-permission',
        'set-tab-sound',
        'reset-site-permissions',
        'show-settings-popup',
        'confirm-close-popup'
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel, func) => {
      const validChannels = [
        'browser-url-changed',
        'pick-completed',
        'tab-created',
        'tab-activated',
        'tab-closed',
        'tab-title-changed',
        'tab-url-changed',
        'history-data',
        'history-updated',
        'pick-mode-disabled',
        'site-settings-data',
        'init-site-settings',
        'settings-popup-closed',
        'request-close-popup'
      ];
      if (validChannels.includes(channel)) {
        const subscription = (event, ...args) => func(...args);
        ipcRenderer.on(channel, subscription);
        return () => {
          ipcRenderer.removeListener(channel, subscription);
        };
      }
    }
  });
}

// Inject custom scrollbars for dark mode styling on all guest pages
const injectScrollbars = () => {
  // Only inject into regular HTML documents
  if (!document || !document.documentElement || document.getElementById('nexora-scrollbar-override')) {
    return;
  }

  const css = `
    /* Custom scrollbars for Nexora Browser guest views */
    ::-webkit-scrollbar {
      width: 10px !important;
      height: 10px !important;
    }
    ::-webkit-scrollbar-track {
      background: #0c0c0e !important;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.12) !important;
      border: 2px solid #0c0c0e !important;
      border-radius: 6px !important;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.22) !important;
    }
    ::-webkit-scrollbar-corner {
      background: #0c0c0e !important;
    }
  `;

  const style = document.createElement('style');
  style.id = 'nexora-scrollbar-override';
  style.textContent = css;

  // Append style to documentElement immediately, or wait if documentElement isn't ready
  if (document.documentElement) {
    document.documentElement.appendChild(style);
  } else {
    const observer = new MutationObserver(() => {
      if (document.documentElement) {
        document.documentElement.appendChild(style);
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  }
};

// Run the scrollbar injection
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectScrollbars);
} else {
  injectScrollbars();
}
