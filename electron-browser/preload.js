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
        'confirm-close-popup',
        'test-selector',
        'set-emulation-mode',
        'click-tester-match',
        'hover-tester-match',
        'clear-hover-tester-match',
        'show-tab-hover-preview',
        'hide-tab-hover-preview',
        'window-minimize',
        'window-maximize',
        'window-close'
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
        'request-close-popup',
        'selector-test-result',
        'tab-thumbnail',
        'port-detected',
        'update-hover-preview',
        'clear-hover-preview',
        'window-maximized'
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

// Guest-side CSS Selector Highlight mechanism
if (window.location.protocol !== 'file:') {
  let activeHighlights = [];

  const clearHighlights = () => {
    activeHighlights.forEach(el => {
      if (el) {
        el.style.outline = el.dataset.prevOutline || '';
        el.style.boxShadow = el.dataset.prevBoxShadow || '';
        delete el.dataset.prevOutline;
        delete el.dataset.prevBoxShadow;
        el.classList.remove('nexora-highlighted-test-el');
      }
    });
    activeHighlights = [];
    
    // Remove custom style sheet if it exists
    const existingStyle = document.getElementById('nexora-highlight-styles');
    if (existingStyle) existingStyle.remove();
  };

  const injectHighlightStyles = () => {
    if (document.getElementById('nexora-highlight-styles')) return;
    const style = document.createElement('style');
    style.id = 'nexora-highlight-styles';
    style.textContent = `
      @keyframes nexoraPulseHighlight {
        0% { box-shadow: 0 0 4px rgba(192, 132, 252, 0.4); }
        50% { box-shadow: 0 0 16px rgba(192, 132, 252, 0.85); }
        100% { box-shadow: 0 0 4px rgba(192, 132, 252, 0.4); }
      }
      .nexora-highlighted-test-el {
        outline: 2px solid #c084fc !important;
        outline-offset: 1px !important;
        animation: nexoraPulseHighlight 1.5s infinite ease-in-out !important;
        transition: outline 0.15s ease, box-shadow 0.15s ease !important;
      }
      .nexora-highlighted-test-active {
        outline: 3px solid #f59e0b !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 20px rgba(245, 158, 11, 0.9) !important;
        animation: none !important;
      }
    `;
    if (document.documentElement) {
      document.documentElement.appendChild(style);
    }
  };

  const getElementDetails = (el) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id || 'None';
    const classes = el.className || 'None';
    const text = (el.innerText || el.textContent || '').trim();

    const getSelector = (curr) => {
      if (curr.id) return '#' + curr.id;
      let path = [];
      while (curr && curr.nodeType === Node.ELEMENT_NODE) {
        let selStr = curr.nodeName.toLowerCase();
        if (curr.className && typeof curr.className === 'string') {
          const classList = Array.from(curr.classList).filter(c => !c.startsWith('__element-picker') && !c.startsWith('nexora-'));
          if (classList.length > 0) {
            selStr += '.' + classList.slice(0, 3).join('.');
          }
        }
        let sib = curr, nth = 1;
        while (sib = sib.previousElementSibling) {
          if (sib.nodeName.toLowerCase() === curr.nodeName.toLowerCase()) nth++;
        }
        if (nth > 1) {
          selStr += ':nth-of-type(' + nth + ')';
        }
        path.unshift(selStr);
        curr = curr.parentNode;
      }
      return path.join(' > ');
    };

    const selector = getSelector(el);

    const computed = window.getComputedStyle(el);
    const styleProps = [
      'display', 'position', 'width', 'height', 'margin', 'padding',
      'color', 'background-color', 'font-family', 'font-size', 'font-weight',
      'border-width', 'border-style', 'border-color', 'box-shadow', 'opacity', 'z-index'
    ];
    const styles = styleProps.map(prop => ({
      name: prop,
      value: computed.getPropertyValue(prop)
    }));

    const role = el.getAttribute('role') || 'None';
    const label = el.getAttribute('aria-label') || el.getAttribute('title') || el.placeholder || 'None';
    const focusable = el.tabIndex >= 0 ? 'Yes' : 'No';

    const rect = el.getBoundingClientRect();
    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };

    return {
      tag,
      id,
      classes,
      text: text.substring(0, 150),
      selector,
      styles,
      accessibility: { role, label: label.substring(0, 150), focusable },
      bounds,
      clientCoords: { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) },
      outerHTML: el.outerHTML,
      innerHTML: el.innerHTML
    };
  };

  ipcRenderer.on('highlight-selector', (event, selector) => {
    clearHighlights();
    if (!selector || !selector.trim()) {
      ipcRenderer.send('selector-test-result', { count: 0, matchesList: [] });
      return;
    }
    
    try {
      injectHighlightStyles();
      const matches = document.querySelectorAll(selector);
      const matchesList = [];
      matches.forEach((el, idx) => {
        el.dataset.prevOutline = el.style.outline;
        el.dataset.prevBoxShadow = el.style.boxShadow;
        el.classList.add('nexora-highlighted-test-el');
        activeHighlights.push(el);

        if (idx < 15) {
          const tag = el.tagName.toLowerCase();
          const id = el.id ? '#' + el.id : '';
          let classStr = '';
          if (el.className && typeof el.className === 'string') {
            const classes = Array.from(el.classList).filter(c => !c.startsWith('__element-picker') && !c.startsWith('nexora-'));
            if (classes.length > 0) {
              classStr = '.' + classes.slice(0, 2).join('.');
            }
          }
          const text = (el.innerText || el.textContent || '').trim().substring(0, 45);
          matchesList.push({
            tag,
            id,
            classes: classStr,
            text,
            index: idx
          });
        }
      });
      
      ipcRenderer.send('selector-test-result', { count: matches.length, matchesList });
    } catch (err) {
      ipcRenderer.send('selector-test-result', { count: -1, error: err.message, matchesList: [] });
    }
  });

  ipcRenderer.on('hover-tester-match', (event, index) => {
    const el = activeHighlights[index];
    if (el) {
      el.classList.add('nexora-highlighted-test-active');
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  ipcRenderer.on('clear-hover-tester-match', () => {
    activeHighlights.forEach(el => {
      if (el) el.classList.remove('nexora-highlighted-test-active');
    });
  });

  ipcRenderer.on('click-tester-match', (event, index) => {
    const el = activeHighlights[index];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Remove any temporary active class on others
      activeHighlights.forEach(h => {
        if (h) h.classList.remove('nexora-highlighted-test-active');
      });
      el.classList.add('nexora-highlighted-test-active');
      
      const details = getElementDetails(el);
      ipcRenderer.send('selector-test-click', details);
    }
  });

  ipcRenderer.on('clear-selector-highlights', () => {
    clearHighlights();
  });
}
