const { app, BrowserWindow, WebContentsView, ipcMain, clipboard, session, nativeTheme } = require('electron');
const path = require('path');
const http = require('http');

// Set theme source to dark for native widgets and media queries
nativeTheme.themeSource = 'dark';

let isQuitting = false;
app.on('before-quit', () => {
  isQuitting = true;
});

// Start control server on port 30120
function startControlServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    
    if (parsedUrl.pathname === '/navigate') {
      const urlParam = parsedUrl.searchParams.get('url');
      if (urlParam) {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) {
          let targetUrl = urlParam.trim();
          const hasScheme = /^[a-zA-Z0-9+-.]+:\/\//.test(targetUrl);
          const hasSpaces = targetUrl.includes(' ');

          if (!hasScheme) {
            if (hasSpaces || !targetUrl.includes('.')) {
              targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(targetUrl);
            } else {
              targetUrl = 'https://' + targetUrl;
            }
          }
          
          activeTab.url = targetUrl;
          if (targetUrl.startsWith('file://') || targetUrl.includes('homepage.html')) {
            const homepagePath = path.join(__dirname, 'src', 'homepage.html');
            activeTab.view.webContents.loadFile(homepagePath);
          } else {
            activeTab.view.webContents.loadURL(targetUrl).catch(() => {});
          }
        } else {
          createTab(urlParam);
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', activeTabId }));
    } else if (parsedUrl.pathname === '/back') {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab && activeTab.view && activeTab.view.webContents.canGoBack()) {
        activeTab.view.webContents.goBack();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (parsedUrl.pathname === '/forward') {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab && activeTab.view && activeTab.view.webContents.canGoForward()) {
        activeTab.view.webContents.goForward();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (parsedUrl.pathname === '/reload') {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab && activeTab.view) {
        activeTab.view.webContents.reload();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (parsedUrl.pathname === '/close') {
      isQuitting = true;
      app.quit();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (parsedUrl.pathname === '/show') {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (parsedUrl.pathname === '/workspace-switch') {
      const workspaceId = parsedUrl.searchParams.get('workspaceId');
      if (workspaceId) {
        handleWorkspaceSwitch(workspaceId);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', workspaceId }));
    } else if (parsedUrl.pathname === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', activeTabId, tabsCount: tabs.length }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not_found' }));
    }
  });

  server.listen(30120, '127.0.0.1', () => {
    console.log('Electron control server listening on http://localhost:30120');
  });

  app.on('will-quit', () => {
    try {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      server.close();
    } catch (e) {}
    process.exit(0);
  });
}

let mainWindow;
let isSidebarOpen = false;
let emulationMode = 'responsive';
let isPickModeActive = false;
let activePickerTabId = null;

// Tabs management
let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;

const fs = require('fs');
const net = require('net');

// History management
let history = [];

// Permissions management
let permissions = {};

function getPermissionsPath() {
  return path.join(app.getPath('userData'), 'nexora_permissions.json');
}

function loadPermissions() {
  try {
    const filePath = getPermissionsPath();
    if (fs.existsSync(filePath)) {
      permissions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to load permissions:', err);
    permissions = {};
  }
}

function savePermissions() {
  try {
    const filePath = getPermissionsPath();
    fs.writeFileSync(filePath, JSON.stringify(permissions, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save permissions:', err);
  }
}

function getHistoryPath() {
  return path.join(app.getPath('userData'), 'nexora_history.json');
}

function loadHistory() {
  try {
    const filePath = getHistoryPath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      history = JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load history:', err);
    history = [];
  }
}

function saveHistory() {
  try {
    const filePath = getHistoryPath();
    fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save history:', err);
  }
}

// Workspace session management
let currentWorkspaceId = null;

function getWorkspaceSessionsPath() {
  return path.join(app.getPath('userData'), 'nexora_workspace_sessions.json');
}

function loadWorkspaceSessions() {
  try {
    const filePath = getWorkspaceSessionsPath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to load workspace sessions:', err);
  }
  return {};
}

function saveWorkspaceSessions(sessions) {
  try {
    const filePath = getWorkspaceSessionsPath();
    fs.writeFileSync(filePath, JSON.stringify(sessions, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save workspace sessions:', err);
  }
}

function sendToAllDefaultTabs(channel, data) {
  tabs.forEach(t => {
    if (t.view && (t.url === 'homepage.html' || t.url.startsWith('file://') || t.url.includes('homepage.html'))) {
      try {
        t.view.webContents.send(channel, data);
      } catch (err) {
        // Ignore if WebContents is destroyed
      }
    }
  });
}

function addToHistory(url, title = '') {
  if (!url) return;
  // Skip homepage or file protocol paths
  if (url === 'homepage.html' || url.startsWith('file://') || url.includes('homepage.html')) {
    return;
  }

  let displayTitle = title;
  if (!displayTitle) {
    try {
      displayTitle = new URL(url).hostname;
    } catch (e) {
      displayTitle = url;
    }
  }

  // Remove duplicate entries
  history = history.filter(item => item.url !== url);

  // Add to start
  history.unshift({
    url,
    title: displayTitle,
    timestamp: Date.now()
  });

  // Limit to 20
  if (history.length > 20) {
    history = history.slice(0, 20);
  }

  saveHistory();
  sendToAllDefaultTabs('history-updated', history);
}

function updateHistoryTitle(url, title) {
  if (!url || url === 'homepage.html' || url.startsWith('file://') || url.includes('homepage.html')) {
    return;
  }
  let updated = false;
  history = history.map(item => {
    if (item.url === url) {
      item.title = title;
      updated = true;
    }
    return item;
  });
  if (updated) {
    saveHistory();
    sendToAllDefaultTabs('history-updated', history);
  }
}

// The DOM injection script for inspecting and highlighting elements
const pickerScript = `
  (function() {
    if (window.__elementPickerActive) return;
    window.__elementPickerActive = true;

    // Inject styles
    const style = document.createElement('style');
    style.id = '__element-picker-styles';
    style.textContent = \`
      @property --picker-angle {
        syntax: '<angle>';
        initial-value: 0deg;
        inherits: false;
      }

      #__element-picker-overlay {
        position: fixed !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
        transition: all 0.08s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
        box-sizing: border-box !important;
        display: none;
        border-radius: 6px !important;
        box-shadow: 0 0 15px rgba(66, 133, 244, 0.45), 
                    0 0 30px rgba(138, 43, 226, 0.25) !important;
      }
 
      /* Glowing rotating border wrapper */
      .__element-picker-glow-border {
        position: absolute !important;
        top: -3px !important;
        left: -3px !important;
        right: -3px !important;
        bottom: -3px !important;
        border-radius: 8px !important;
        padding: 3px !important;
        background: conic-gradient(from var(--picker-angle), #4285F4, #EA4335, #FBBC05, #34A853, #4285F4) !important;
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0) !important;
        -webkit-mask-composite: xor !important;
        mask-composite: exclude !important;
        animation: picker-rotate-gradient 2.5s linear infinite !important;
        box-shadow: inset 0 0 8px rgba(138, 43, 226, 0.1) !important;
      }

      /* Subtle pulsing light inside the selected element */
      .__element-picker-fill {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        background-color: rgba(66, 133, 244, 0.05) !important;
        border-radius: 6px !important;
        animation: picker-pulse-fill 1.5s ease-in-out infinite alternate !important;
      }

      /* Premium Floating Info Badge */
      .__element-picker-badge {
        position: fixed !important;
        display: none !important;
        align-items: center !important;
        gap: 6px !important;
        background: rgba(10, 10, 12, 0.88) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 
                    0 0 15px rgba(66, 133, 244, 0.25) !important;
        padding: 5px 10px !important;
        border-radius: 6px !important;
        color: #e2e2e9 !important;
        font-family: 'Outfit', 'Inter', system-ui, -apple-system, sans-serif !important;
        font-size: 11px !important;
        font-weight: 500 !important;
        pointer-events: none !important;
        white-space: nowrap !important;
        z-index: 2147483647 !important;
        transition: top 0.08s cubic-bezier(0.2, 0.8, 0.2, 1), left 0.08s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
      }

      .__element-picker-badge-tag {
        color: #ff79c6 !important;
        font-weight: 700 !important;
      }

      .__element-picker-badge-id {
        color: #8be9fd !important;
        font-weight: 600 !important;
      }

      .__element-picker-badge-class {
        color: #50fa7b !important;
      }

      .__element-picker-badge-size {
        color: #ffb86c !important;
        margin-left: 4px !important;
        border-left: 1px solid rgba(255, 255, 255, 0.15) !important;
        padding-left: 6px !important;
        font-family: monospace !important;
      }

      @keyframes picker-rotate-gradient {
        0% {
          --picker-angle: 0deg;
        }
        100% {
          --picker-angle: 360deg;
        }
      }

      @keyframes picker-pulse-fill {
        0% {
          background-color: rgba(66, 133, 244, 0.03);
        }
        100% {
          background-color: rgba(138, 43, 226, 0.1);
        }
      }
    \`;
    document.head.appendChild(style);

    // Create highlight overlay element
    const overlay = document.createElement('div');
    overlay.id = '__element-picker-overlay';
    
    const glowBorder = document.createElement('div');
    glowBorder.className = '__element-picker-glow-border';
    overlay.appendChild(glowBorder);
    
    const fill = document.createElement('div');
    fill.className = '__element-picker-fill';
    overlay.appendChild(fill);
    
    document.body.appendChild(overlay);

    // Create badge element
    const badge = document.createElement('div');
    badge.className = '__element-picker-badge';
    document.body.appendChild(badge);

    let hoveredEl = null;

    const onMouseMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === overlay || el === badge || el === document.body || el === document.documentElement) {
        overlay.style.display = 'none';
        badge.style.display = 'none';
        return;
      }
      hoveredEl = el;
      const rect = el.getBoundingClientRect();
      overlay.style.left = rect.left + 'px';
      overlay.style.top = rect.top + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
      overlay.style.display = 'block';

      // Update badge contents
      const tagName = el.tagName.toLowerCase();
      const idStr = el.id ? '#' + el.id : '';
      let classStr = '';
      if (el.className && typeof el.className === 'string') {
        const classes = Array.from(el.classList).filter(c => !c.startsWith('__element-picker'));
        if (classes.length > 0) {
          classStr = '.' + classes.slice(0, 2).join('.');
          if (classes.length > 2) classStr += '...';
        }
      }
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      badge.innerHTML = \`
        <span class="__element-picker-badge-tag">\${tagName}</span>
        <span class="__element-picker-badge-id">\${idStr}</span>
        <span class="__element-picker-badge-class">\${classStr}</span>
        <span class="__element-picker-badge-size">\${width} × \${height}</span>
      \`;

      // Position badge
      badge.style.display = 'flex';
      const badgeRect = badge.getBoundingClientRect();
      
      let badgeTop = rect.top - badgeRect.height - 8;
      if (badgeTop < 0) {
        badgeTop = rect.bottom + 8;
      }
      
      let badgeLeft = rect.left;
      if (badgeLeft + badgeRect.width > window.innerWidth) {
        badgeLeft = Math.max(0, window.innerWidth - badgeRect.width - 16);
      }

      badge.style.top = badgeTop + 'px';
      badge.style.left = badgeLeft + 'px';
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (badge.parentNode) badge.parentNode.removeChild(badge);
      const styleEl = document.getElementById('__element-picker-styles');
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      window.__elementPickerActive = false;
    };

    return new Promise((resolve) => {
      window.__resolveElementPicker = resolve;
      
      const onClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        let details = null;

        if (hoveredEl) {
          const tag = hoveredEl.tagName.toLowerCase();
          const id = hoveredEl.id || 'None';
          const classes = hoveredEl.className || 'None';
          const text = (hoveredEl.innerText || hoveredEl.textContent || '').trim();

          // Generate Selector
          const getSelector = (el) => {
            if (el.id) return '#' + el.id;
            let path = [];
            while (el && el.nodeType === Node.ELEMENT_NODE) {
              let selector = el.nodeName.toLowerCase();
              if (el.className && typeof el.className === 'string') {
                const classList = Array.from(el.classList).filter(c => !c.startsWith('__element-picker'));
                if (classList.length > 0) {
                  selector += '.' + classList.join('.');
                }
              }
              let sib = el, nth = 1;
              while (sib = sib.previousElementSibling) {
                if (sib.nodeName.toLowerCase() === el.nodeName.toLowerCase()) nth++;
              }
              if (nth > 1) {
                selector += ':nth-of-type(' + nth + ')';
              }
              path.unshift(selector);
              el = el.parentNode;
            }
            return path.join(' > ');
          };

          const selector = getSelector(hoveredEl);

          // Get key computed styles
          const computed = window.getComputedStyle(hoveredEl);
          const styles = {
            'font-family': computed.fontFamily,
            'font-size': computed.fontSize,
            'color': computed.color,
            'background-color': computed.backgroundColor,
            'display': computed.display,
            'position': computed.position,
            'width': computed.width,
            'height': computed.height,
            'margin': computed.margin,
            'padding': computed.padding
          };

          // Accessibility data
          const role = hoveredEl.getAttribute('role') || 'generic';
          const label = hoveredEl.getAttribute('aria-label') || text || '';
          const focusable = hoveredEl.tabIndex >= 0 ? 'true' : 'false';

          // Element bounding box coordinates
          const rect = hoveredEl.getBoundingClientRect();
          const bounds = {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };

          details = {
            tag,
            id,
            classes,
            text: text.substring(0, 150),
            selector,
            styles,
            accessibility: { role, label: label.substring(0, 150), focusable },
            bounds,
            clientCoords: { x: Math.round(e.clientX), y: Math.round(e.clientY) },
            outerHTML: hoveredEl.outerHTML,
            innerHTML: hoveredEl.innerHTML
          };
        }

        if (details) {
          console.log('__element-picker-picked:' + JSON.stringify(details));
        }
      };

      window.__stopElementPicker = () => {
        cleanup();
        window.removeEventListener('click', onClick, true);
        resolve(null);
      };

      window.addEventListener('mousemove', onMouseMove, true);
      window.addEventListener('click', onClick, true);
    });
  })();
`;

async function startPickerOnTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || !tab.view) return;

  if (tab.url === 'homepage.html' || tab.url.startsWith('file://') || tab.url.includes('homepage.html')) {
    return;
  }

  activePickerTabId = tabId;

  try {
    const details = await tab.view.webContents.executeJavaScript(pickerScript);
    if (details === null && activePickerTabId === tabId) {
      sendToRenderer('pick-completed', null);
    }
  } catch (err) {
    // Expected if the tab navigates or picker is stopped manually
    console.log(`Picker on tab ${tabId} resolved/aborted:`, err.message);
  }
}

async function stopPickerOnTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || !tab.view) return;

  if (activePickerTabId === tabId) {
    activePickerTabId = null;
  }

  await tab.view.webContents.executeJavaScript(`
    if (window.__stopElementPicker) {
      window.__stopElementPicker();
    }
  `).catch(() => {});
}

let settingsWindow = null;
let hoverPreviewWindow = null;

function createHoverPreviewWindow() {
  if (hoverPreviewWindow) return;

  hoverPreviewWindow = new BrowserWindow({
    width: 196,
    height: 160,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    hasShadow: false
  });

  try {
    hoverPreviewWindow.setIgnoreMouseEvents(true);
  } catch (e) {}

  hoverPreviewWindow.loadFile(path.join(__dirname, 'src', 'hover-preview.html'));

  hoverPreviewWindow.on('closed', () => {
    hoverPreviewWindow = null;
  });
}

function showSettingsWindow(x, y, tabId, url) {
  if (settingsWindow) {
    try {
      if (!settingsWindow.isDestroyed()) {
        settingsWindow.hide();
        settingsWindow.close();
      }
    } catch (e) {}
    settingsWindow = null;
  }

  settingsWindow = new BrowserWindow({
    width: 300,
    height: 230,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    hasShadow: false
  });

  // Register did-finish-load BEFORE loading the file
  settingsWindow.webContents.once('did-finish-load', () => {
    if (settingsWindow && !settingsWindow.isDestroyed() && !settingsWindow.webContents.isDestroyed()) {
      let origin = '';
      try {
        origin = new URL(url).hostname;
      } catch (e) {
        origin = url;
      }

      const sitePerms = permissions[origin] || { microphone: true, notifications: true };
      const tab = tabs.find(t => t.id === tabId);
      let soundAllowed = true;
      if (tab && tab.view && !tab.view.webContents.isDestroyed()) {
        soundAllowed = !tab.view.webContents.isAudioMuted();
      }

      try {
        settingsWindow.webContents.send('init-site-settings', {
          origin,
          microphone: sitePerms.microphone !== false,
          notifications: sitePerms.notifications !== false,
          sound: soundAllowed,
          tabId,
          url
        });
      } catch (e) {}
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'src', 'settings-popup.html'));

  settingsWindow.once('ready-to-show', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      try {
        settingsWindow.setPosition(x, y);
        settingsWindow.show();
      } catch (e) {}
      
      // Close on blur with a 200ms delay to prevent instant closure on startup
      setTimeout(() => {
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.on('blur', () => {
            if (settingsWindow && !settingsWindow.isDestroyed()) {
              try {
                if (settingsWindow.webContents && !settingsWindow.webContents.isDestroyed()) {
                  // Trigger exit animation in settings-popup.html
                  settingsWindow.webContents.send('request-close-popup');
                }
                
                // Safety fallback: close window anyway after 300ms if renderer is blocked/fails
                setTimeout(() => {
                  if (settingsWindow && !settingsWindow.isDestroyed()) {
                    try {
                      settingsWindow.hide();
                      setImmediate(() => {
                        if (settingsWindow && !settingsWindow.isDestroyed()) {
                          settingsWindow.close();
                        }
                      });
                    } catch (e) {}
                  }
                }, 300);
              } catch (e) {}
            }
          });
        }
      }, 200);
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      try {
        mainWindow.webContents.send('settings-popup-closed');
      } catch (e) {}
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "Nexora Browser",
    backgroundColor: '#0c0c0e'
  });

  mainWindow.setMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('maximize', () => {
    sendToRenderer('window-maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    sendToRenderer('window-maximized', false);
  });

  mainWindow.on('close', (event) => {
    // Destroy helper windows if they exist
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      try {
        settingsWindow.destroy();
      } catch (e) {}
    }
    if (hoverPreviewWindow && !hoverPreviewWindow.isDestroyed()) {
      try {
        hoverPreviewWindow.destroy();
      } catch (e) {}
    }
    // Quit app completely to release memory and free up port 30120
    app.quit();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    createHoverPreviewWindow();
  });

  mainWindow.on('blur', () => {
    if (hoverPreviewWindow && !hoverPreviewWindow.isDestroyed()) {
      try {
        hoverPreviewWindow.hide();
      } catch (e) {}
    }
  });

  // Main window keystroke listener for Ctrl+T, Ctrl+W
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const isControl = process.platform === 'darwin' ? input.meta : input.control;
      if (isControl && input.key.toLowerCase() === 't') {
        createTab();
        event.preventDefault();
      } else if (isControl && input.key.toLowerCase() === 'w') {
        if (activeTabId !== null) {
          closeTab(activeTabId);
        }
        event.preventDefault();
      }
    }
  });

  // Initialize bounds resize listener
  mainWindow.on('resize', handleResize);

  // Wait until index.html finishes DOM loading, then spawn first tab
  mainWindow.webContents.once('did-finish-load', () => {
    const argUrl = process.argv.find(arg => (arg.startsWith('http://') || arg.startsWith('https://') || (arg.includes('.') && arg !== '.')) && !arg.startsWith('-') && !arg.includes('main.js') && !arg.includes('electron') && !arg.endsWith('electron.exe'));
    if (argUrl) {
      createTab(argUrl);
    } else {
      createTab();
    }
  });
}

function bindTabEvents(tab) {
  const id = tab.id;
  const view = tab.view;

  // Intercept hotkeys inside the tab webContents
  view.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const isControl = process.platform === 'darwin' ? input.meta : input.control;
      if (isControl && input.key.toLowerCase() === 't') {
        createTab();
        event.preventDefault();
      } else if (isControl && input.key.toLowerCase() === 'w') {
        closeTab(id);
        event.preventDefault();
      }
    }
  });

  view.webContents.on('page-title-updated', (e, title) => {
    tab.title = title;
    sendToRenderer('tab-title-changed', { id, title });
    if (id === activeTabId && mainWindow) {
      mainWindow.setTitle("Nexora Browser");
    }
    updateHistoryTitle(tab.url, title);
  });

  view.webContents.on('did-navigate', (event, url) => {
    tab.url = url;
    if (id === activeTabId) {
      sendToRenderer('browser-url-changed', url);
    }
    addToHistory(url, tab.title);
  });

  view.webContents.on('did-navigate-in-page', (event, url) => {
    tab.url = url;
    if (id === activeTabId) {
      sendToRenderer('browser-url-changed', url);
    }
    addToHistory(url, tab.title);
  });

  view.webContents.on('dom-ready', () => {
    if (isPickModeActive && id === activeTabId) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab && activeTab.url !== 'homepage.html' && !activeTab.url.startsWith('file://')) {
        startPickerOnTab(id);
      }
    }
    captureTabThumbnail(id);
  });

  view.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (message.startsWith('__element-picker-picked:')) {
      const jsonStr = message.substring('__element-picker-picked:'.length);
      try {
        const details = JSON.parse(jsonStr);
        if (isPickModeActive && id === activeTabId) {
          sendToRenderer('pick-completed', details);
        }
      } catch (err) {
        console.error('Failed to parse picked element details:', err);
      }
    }
  });
}

function captureTabThumbnail(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab || !tab.view) return;
  setTimeout(() => {
    try {
      if (tab.view && !tab.view.webContents.isDestroyed()) {
        tab.view.webContents.capturePage().then(image => {
          if (tab.view && !tab.view.webContents.isDestroyed()) {
            const dataUrl = image.toDataURL();
            sendToRenderer('tab-thumbnail', { id, thumbnail: dataUrl });
          }
        }).catch(() => {});
      }
    } catch (e) {}
  }, 400); // 400ms delay to allow content rendering
}

// Tab Creation
function createTab(urlToLoad) {
  const id = ++tabIdCounter;
  
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Set background color to prevent white flash during resize/load
  try {
    view.setBackgroundColor('#0c0c0e');
  } catch (e) {
    console.error('Failed to set WebContentsView background color:', e);
  }

  const tab = {
    id,
    view,
    title: 'Nexora Browser',
    url: urlToLoad || 'homepage.html'
  };

  tabs.push(tab);

  bindTabEvents(tab);

  // Load URL
  if (tab.url === 'homepage.html') {
    const homepagePath = path.join(__dirname, 'src', 'homepage.html');
    view.webContents.loadFile(homepagePath);
  } else {
    view.webContents.loadURL(tab.url).catch(() => {});
  }

  // Notify renderer to create tab button element
  sendToRenderer('tab-created', { id, title: tab.title, url: tab.url });

  // Switch to the newly created tab immediately
  switchTab(id);

  return tab;
}

// Workspace tab swapping
function handleWorkspaceSwitch(newWorkspaceId) {
  const sessions = loadWorkspaceSessions();

  // Save current tabs for previous workspace
  if (currentWorkspaceId) {
    sessions[currentWorkspaceId] = tabs.map(t => t.url);
    saveWorkspaceSessions(sessions);
  }

  currentWorkspaceId = newWorkspaceId;

  const newTabUrls = sessions[newWorkspaceId] || ['homepage.html'];
  const tabsToClose = [...tabs];
  const newCreatedTabIds = [];

  newTabUrls.forEach(url => {
    const id = ++tabIdCounter;
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    try {
      view.setBackgroundColor('#0c0c0e');
    } catch (e) {}

    const tab = {
      id,
      view,
      title: 'Nexora Browser',
      url
    };

    tabs.push(tab);
    newCreatedTabIds.push(id);

    bindTabEvents(tab);

    if (tab.url === 'homepage.html') {
      const homepagePath = path.join(__dirname, 'src', 'homepage.html');
      view.webContents.loadFile(homepagePath);
    } else {
      view.webContents.loadURL(tab.url).catch(() => {});
    }

    sendToRenderer('tab-created', { id, title: tab.title, url: tab.url });
  });

  // Switch to first newly created tab
  if (newCreatedTabIds.length > 0) {
    switchTab(newCreatedTabIds[0]);
  }

  // Close old tabs
  tabsToClose.forEach(oldTab => {
    const index = tabs.findIndex(t => t.id === oldTab.id);
    if (index !== -1) {
      if (oldTab.id === activeTabId) {
        mainWindow.contentView.removeChildView(oldTab.view);
      }
      try {
        oldTab.view.webContents.destroy();
      } catch (e) {}
      tabs.splice(index, 1);
      sendToRenderer('tab-closed', oldTab.id);
    }
  });

  if (tabs.length === 0) {
    createTab();
  }
}

// Tab Switching
function switchTab(id) {
  if (activeTabId === id) return;

  const oldTab = tabs.find(t => t.id === activeTabId);
  const newTab = tabs.find(t => t.id === id);

  if (!newTab) return;

  if (oldTab) {
    captureTabThumbnail(oldTab.id);
  }

  // Manage pick mode state across tabs
  if (isPickModeActive) {
    if (oldTab) {
      stopPickerOnTab(oldTab.id);
    }
    if (newTab && newTab.url !== 'homepage.html' && !newTab.url.startsWith('file://')) {
      startPickerOnTab(id);
    } else {
      isPickModeActive = false;
      sendToRenderer('pick-mode-disabled');
    }
  }

  // Remove current tab view
  if (oldTab && oldTab.view) {
    mainWindow.contentView.removeChildView(oldTab.view);
  }

  // Add new tab view
  mainWindow.contentView.addChildView(newTab.view);
  activeTabId = id;

  updateViewBounds();

  // Notify renderer to activate tab UI and update URL
  sendToRenderer('tab-activated', {
    id,
    url: newTab.url,
    canGoBack: newTab.view.webContents.canGoBack(),
    canGoForward: newTab.view.webContents.canGoForward()
  });

  mainWindow.setTitle("Nexora Browser");
}

// Tab Closing
function closeTab(id) {
  const index = tabs.findIndex(t => t.id === id);
  if (index === -1) return;

  const tabToClose = tabs[index];
  
  if (id === activeTabId) {
    mainWindow.contentView.removeChildView(tabToClose.view);
  }

  tabToClose.view.webContents.destroy();
  tabs.splice(index, 1);

  sendToRenderer('tab-closed', id);

  if (tabs.length === 0) {
    createTab();
  } else if (id === activeTabId) {
    const nextActiveIndex = Math.min(index, tabs.length - 1);
    switchTab(tabs[nextActiveIndex].id);
  }
}

function updateViewBounds() {
  if (!mainWindow) return;
  const [width, height] = mainWindow.getContentSize();

  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.view) {
    // 128px header height accounts for 32px custom title bar + 44px tab bar + 52px nav bar
    const availableWidth = isSidebarOpen ? Math.max(0, width - 380) : width;
    const availableHeight = Math.max(0, height - 128);

    let viewWidth = availableWidth;
    let viewHeight = availableHeight;

    if (emulationMode === 'mobile') {
      viewWidth = Math.min(375, availableWidth);
      viewHeight = Math.min(720, availableHeight);
    } else if (emulationMode === 'tablet') {
      viewWidth = Math.min(768, availableWidth);
      viewHeight = Math.min(960, availableHeight);
    } else if (emulationMode === 'desktop') {
      viewWidth = Math.min(1440, availableWidth);
      viewHeight = Math.min(900, availableHeight);
    }

    const x = Math.max(0, Math.floor((availableWidth - viewWidth) / 2));
    const y = 128 + Math.max(0, Math.floor((availableHeight - viewHeight) / 2));

    activeTab.view.setBounds({ x, y, width: viewWidth, height: viewHeight });
  }
}

let resizeThrottled = false;
function handleResize() {
  if (!resizeThrottled) {
    resizeThrottled = true;
    updateViewBounds();
    setTimeout(() => {
      updateViewBounds();
      resizeThrottled = false;
    }, 16); // Throttle to ~60fps
  }
}

function sendToRenderer(channel, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

// Window controls IPC
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// IPC Handlers targeting active tab's webContents
ipcMain.on('browser-back', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.view && activeTab.view.webContents.canGoBack()) {
    activeTab.view.webContents.goBack();
  }
});

ipcMain.on('browser-forward', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.view && activeTab.view.webContents.canGoForward()) {
    activeTab.view.webContents.goForward();
  }
});

ipcMain.on('browser-reload', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.view) {
    activeTab.view.webContents.reloadIgnoringCache();
  }
});

ipcMain.on('browser-go-home', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.view) {
    const homepagePath = path.join(__dirname, 'src', 'homepage.html');
    activeTab.view.webContents.loadFile(homepagePath);
  }
});

ipcMain.on('browser-navigate', (event, inputUrl) => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab || !activeTab.view) return;

  let targetUrl = inputUrl.trim();
  if (!targetUrl) return;

  const hasScheme = /^[a-zA-Z0-9+-.]+:\/\//.test(targetUrl);
  const hasSpaces = targetUrl.includes(' ');

  if (!hasScheme) {
    if (hasSpaces || !targetUrl.includes('.')) {
      targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(targetUrl);
    } else {
      targetUrl = 'https://' + targetUrl;
    }
  }

  if (targetUrl.startsWith('file://') || targetUrl.includes('homepage.html')) {
    const homepagePath = path.join(__dirname, 'src', 'homepage.html');
    activeTab.view.webContents.loadFile(homepagePath);
  } else {
    activeTab.view.webContents.loadURL(targetUrl).catch(err => {
      console.error('Failed to load URL:', targetUrl, err);
    });
  }
});

// Element Picker IPC Handlers
ipcMain.on('toggle-sidebar', (event, isOpen) => {
  isSidebarOpen = isOpen;
  updateViewBounds();
});

ipcMain.on('test-selector', (event, selector) => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.view) {
    activeTab.view.webContents.send('highlight-selector', selector);
  }
});

ipcMain.on('selector-test-result', (event, result) => {
  sendToRenderer('selector-test-result', result);
});

ipcMain.on('click-tester-match', (event, index) => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.view) {
    activeTab.view.webContents.send('click-tester-match', index);
  }
});

ipcMain.on('hover-tester-match', (event, index) => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.view) {
    activeTab.view.webContents.send('hover-tester-match', index);
  }
});

ipcMain.on('clear-hover-tester-match', (event) => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.view) {
    activeTab.view.webContents.send('clear-hover-tester-match');
  }
});

ipcMain.on('selector-test-click', (event, details) => {
  sendToRenderer('pick-completed', details);
});

ipcMain.on('set-emulation-mode', (event, mode) => {
  emulationMode = mode;
  updateViewBounds();
});

ipcMain.on('set-pick-mode', async (event, active) => {
  isPickModeActive = active;

  if (active) {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.url !== 'homepage.html' && !activeTab.url.startsWith('file://')) {
      startPickerOnTab(activeTabId);
    } else {
      isPickModeActive = false;
      event.reply('pick-mode-disabled');
    }
  } else {
    stopPickerOnTab(activeTabId);
  }
});

ipcMain.on('copy-to-clipboard', (event, text) => {
  clipboard.writeText(text);
});

// History IPC Handlers
ipcMain.on('get-history', (event) => {
  event.reply('history-data', history);
});

ipcMain.on('delete-history-item', (event, url) => {
  history = history.filter(item => item.url !== url);
  saveHistory();
  event.reply('history-data', history);
  sendToAllDefaultTabs('history-updated', history);
});

ipcMain.on('clear-history', (event) => {
  history = [];
  saveHistory();
  event.reply('history-data', history);
  sendToAllDefaultTabs('history-updated', history);
});

// Site Settings & Permissions Handlers
ipcMain.on('get-site-settings', (event, { tabId, url }) => {
  let origin = '';
  try {
    origin = new URL(url).hostname;
  } catch (e) {
    origin = url;
  }

  const sitePerms = permissions[origin] || { microphone: true, notifications: true };
  
  const tab = tabs.find(t => t.id === tabId);
  let soundAllowed = true;
  if (tab && tab.view) {
    soundAllowed = !tab.view.webContents.isAudioMuted();
  }

  event.reply('site-settings-data', {
    origin,
    microphone: sitePerms.microphone !== false,
    notifications: sitePerms.notifications !== false,
    sound: soundAllowed
  });
});

ipcMain.on('set-site-permission', (event, { url, permissionType, allowed }) => {
  let origin = '';
  try {
    origin = new URL(url).hostname;
  } catch (e) {
    origin = url;
  }

  if (!permissions[origin]) {
    permissions[origin] = { microphone: true, notifications: true };
  }
  permissions[origin][permissionType] = allowed;
  savePermissions();
});

ipcMain.on('set-tab-sound', (event, { tabId, allowed }) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab && tab.view) {
    tab.view.webContents.setAudioMuted(!allowed);
  }
});

ipcMain.on('reset-site-permissions', (event, { tabId, url }) => {
  let origin = '';
  try {
    origin = new URL(url).hostname;
  } catch (e) {
    origin = url;
  }

  if (permissions[origin]) {
    delete permissions[origin];
    savePermissions();
  }

  const tab = tabs.find(t => t.id === tabId);
  if (tab && tab.view) {
    tab.view.webContents.setAudioMuted(false);
  }

  event.reply('site-settings-data', {
    origin,
    microphone: true,
    notifications: true,
    sound: true
  });
});

ipcMain.on('show-settings-popup', (event, { x, y, tabId, url }) => {
  if (!mainWindow) return;
  const contentBounds = mainWindow.getContentBounds();
  const screenX = contentBounds.x + x;
  const screenY = contentBounds.y + y;
  showSettingsWindow(screenX, screenY, tabId, url);
});

ipcMain.on('confirm-close-popup', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    try {
      settingsWindow.hide();
      setImmediate(() => {
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.close();
        }
      });
    } catch (e) {}
  }
});

ipcMain.on('copy-element-screenshot', async (event, bounds) => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab || !activeTab.view || !bounds) return;
  try {
    const rect = {
      x: Math.max(0, bounds.x),
      y: Math.max(0, bounds.y),
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height)
    };
    const image = await activeTab.view.webContents.capturePage(rect);
    clipboard.writeImage(image);
  } catch (err) {
    console.error('Failed to capture page for element:', err);
  }
});

ipcMain.on('open-element-devtools', (event, coords) => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab || !activeTab.view || !coords) return;
  activeTab.view.webContents.openDevTools();
  setTimeout(() => {
    activeTab.view.webContents.inspectElement(coords.x, coords.y);
  }, 500);
});

// Tab IPC Actions
ipcMain.on('create-tab', (event, url) => {
  createTab(url);
});

ipcMain.on('switch-tab', (event, id) => {
  switchTab(id);
});

ipcMain.on('close-tab', (event, id) => {
  closeTab(id);
});

ipcMain.on('show-tab-hover-preview', (event, { x, y, title, thumbnail }) => {
  if (!mainWindow) return;
  if (!hoverPreviewWindow || hoverPreviewWindow.isDestroyed()) {
    createHoverPreviewWindow();
  }

  if (hoverPreviewWindow && !hoverPreviewWindow.isDestroyed()) {
    const contentBounds = mainWindow.getContentBounds();
    const screenX = contentBounds.x + x;
    const screenY = contentBounds.y + y;

    try {
      hoverPreviewWindow.setPosition(screenX, screenY);
      if (!hoverPreviewWindow.isVisible()) {
        hoverPreviewWindow.showInactive();
      }
      hoverPreviewWindow.webContents.send('update-hover-preview', { title, thumbnail });
    } catch (e) {}
  }
});

ipcMain.on('hide-tab-hover-preview', () => {
  if (hoverPreviewWindow && !hoverPreviewWindow.isDestroyed()) {
    try {
      hoverPreviewWindow.hide();
      hoverPreviewWindow.webContents.send('clear-hover-preview');
    } catch (e) {}
  }
});

ipcMain.on('reorder-tabs', (event, newIdOrder) => {
  const reorderedTabs = [];
  newIdOrder.forEach(id => {
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      reorderedTabs.push(tab);
    }
  });
  tabs.forEach(tab => {
    if (!reorderedTabs.includes(tab)) {
      reorderedTabs.push(tab);
    }
  });
  tabs = reorderedTabs;
});

app.whenReady().then(() => {
  loadHistory();
  loadPermissions();

  // Hook session permission checks
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    try {
      const url = webContents.getURL();
      if (!url) return callback(false);
      const origin = new URL(url).hostname;
      
      let key = null;
      if (permission === 'notifications') key = 'notifications';
      else if (permission === 'media') key = 'microphone';
      
      if (key && permissions[origin] && permissions[origin][key] !== undefined) {
        return callback(permissions[origin][key]);
      }
      
      return callback(true);
    } catch (err) {
      console.error('Error handling permission request:', err);
      callback(false);
    }
  });

  startControlServer();
  createWindow();

  // Local Ports Monitor
  const devPorts = [3000, 3001, 3002, 5173, 5174, 8000, 8080, 8081];
  const activePorts = new Set();

  function checkPortActive(port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const onError = () => {
        socket.destroy();
        resolve(false);
      };
      socket.setTimeout(250);
      socket.on('error', onError);
      socket.on('timeout', onError);
      socket.connect(port, '127.0.0.1', () => {
        socket.destroy();
        resolve(true);
      });
    });
  }

  async function scanLocalPorts() {
    for (const port of devPorts) {
      const isListening = await checkPortActive(port);
      const wasListening = activePorts.has(port);

      if (isListening && !wasListening) {
        activePorts.add(port);
        sendToRenderer('port-detected', port);
      } else if (!isListening && wasListening) {
        activePorts.delete(port);
      }
    }
  }

  // Scan every 4 seconds
  setInterval(scanLocalPorts, 4000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    process.exit(0);
  }
});
