window.addEventListener("DOMContentLoaded", () => {
  const backBtn = document.getElementById("back-btn");
  const forwardBtn = document.getElementById("forward-btn");
  const reloadBtn = document.getElementById("reload-btn");
  const homeBtn = document.getElementById("home-btn");
  const goBtn = document.getElementById("go-btn");
  const addressInput = document.getElementById("address-input");
  const loadingOverlay = document.getElementById("loading-overlay");

  // Element Picker Elements
  const inspectBtn = document.getElementById("inspect-btn");
  const sidebar = document.getElementById("element-picker-sidebar");
  const closePickerBtn = document.getElementById("close-picker-btn");
  const pickModeCheckbox = document.getElementById("pick-mode-checkbox");
  const computedStylesTrigger = document.getElementById("computed-styles-trigger");
  const computedStylesContent = document.getElementById("computed-styles-content");

  // Element Stats Display
  const pickedSelector = document.getElementById("picked-selector");
  const pickedTag = document.getElementById("picked-tag");
  const pickedId = document.getElementById("picked-id");
  const pickedClasses = document.getElementById("picked-classes");
  const pickedText = document.getElementById("picked-text");
  const stylesTable = document.getElementById("styles-table");
  const accRole = document.getElementById("accessibility-role");
  const accLabel = document.getElementById("accessibility-label");
  const accFocusable = document.getElementById("accessibility-focusable");

  // Action Buttons
  const btnCopySelector = document.getElementById("action-copy-selector");
  const btnCopyOuterHtml = document.getElementById("action-copy-outer-html");
  const btnCopyInnerHtml = document.getElementById("action-copy-inner-html");
  const btnCopyStyles = document.getElementById("action-copy-styles");
  const btnCopyScreenshot = document.getElementById("action-copy-screenshot");
  const btnOpenDevtools = document.getElementById("action-open-devtools");

  // Tab Elements
  const newTabBtn = document.getElementById("new-tab-btn");
  const tabsList = document.getElementById("tabs-list");

  const tabThumbnails = {};
  let currentPickedDetails = null;

  // Navigation handlers
  backBtn.addEventListener("click", () => {
    window.electron.send("browser-back");
  });

  forwardBtn.addEventListener("click", () => {
    window.electron.send("browser-forward");
  });

  reloadBtn.addEventListener("click", () => {
    window.electron.send("browser-reload");
  });

  // Home page navigation
  const goHome = () => {
    window.electron.send("browser-go-home");
  };

  homeBtn.addEventListener("click", goHome);

  // Address bar submission
  const navigate = () => {
    const url = addressInput.value.trim();
    if (url) {
      // Trigger loading overlay only for external navigation
      if (!url.includes("homepage.html") && !url.startsWith("file://")) {
        loadingOverlay.classList.remove("hidden");
      }
      window.electron.send("browser-navigate", url);
    }
  };

  addressInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      navigate();
      addressInput.blur();
    }
  });

  goBtn.addEventListener("click", navigate);

  // Element Picker Sidebar toggle
  const toggleSidebar = (forceState) => {
    const isCurrentlyHidden = sidebar.classList.contains("hidden");
    const open = forceState !== undefined ? forceState : isCurrentlyHidden;

    if (open) {
      sidebar.classList.remove("hidden");
      inspectBtn.classList.add("active");
      window.electron.send("toggle-sidebar", true);
    } else {
      sidebar.classList.add("hidden");
      inspectBtn.classList.remove("active");
      setPickMode(false);
      window.electron.send("toggle-sidebar", false);
    }
  };

  const setPickMode = (active) => {
    pickModeCheckbox.checked = active;
    window.electron.send("set-pick-mode", active);
  };

  const updateInspectButtonState = (url) => {
    const isDefaultTab = url.includes("homepage.html") || url.startsWith("file://");
    if (isDefaultTab) {
      toggleSidebar(false);
      inspectBtn.disabled = true;
      inspectBtn.style.opacity = "0.4";
      inspectBtn.style.pointerEvents = "none";
      inspectBtn.title = "Element picker not available on default tab";
    } else {
      inspectBtn.disabled = false;
      inspectBtn.style.opacity = "1";
      inspectBtn.style.pointerEvents = "auto";
      inspectBtn.title = "Inspect Element";
    }
  };

  const updateAddressBarIcons = (url) => {
    const isDefaultTab = url.includes("homepage.html") || url.startsWith("file://");
    if (isDefaultTab) {
      siteSettingsBtn.style.display = "none";
      searchIndicator.style.display = "flex";
      siteSettingsBtn.classList.remove("active");
    } else {
      siteSettingsBtn.style.display = "flex";
      searchIndicator.style.display = "none";
    }
  };

  inspectBtn.addEventListener("click", () => toggleSidebar());
  closePickerBtn.addEventListener("click", () => toggleSidebar(false));

  const pickerToggleContainer = document.querySelector(".picker-toggle-container");
  if (pickerToggleContainer) {
    pickerToggleContainer.addEventListener("click", (e) => {
      if (e.target.closest('.switch')) {
        return;
      }
      pickModeCheckbox.checked = !pickModeCheckbox.checked;
      pickModeCheckbox.dispatchEvent(new Event('change'));
    });
  }

  pickModeCheckbox.addEventListener("change", (e) => {
    window.electron.send("set-pick-mode", e.target.checked);
  });

  // Collapsible Computed Styles Toggle
  computedStylesTrigger.addEventListener("click", () => {
    computedStylesTrigger.classList.toggle("active");
    computedStylesContent.classList.toggle("collapsed");
  });

  // Handle Pick Completion
  window.electron.on("pick-completed", (details) => {
    if (!details) {
      pickModeCheckbox.checked = false;
      return;
    }

    currentPickedDetails = details;

    // Fill UI
    pickedSelector.textContent = details.selector;
    pickedTag.textContent = details.tag;
    pickedId.textContent = details.id;
    pickedClasses.textContent = details.classes;
    pickedText.textContent = details.text || "None";

    // Accessibility
    accRole.textContent = details.accessibility.role;
    accLabel.textContent = details.accessibility.label || "None";
    accFocusable.textContent = details.accessibility.focusable;

    // Styles table population
    stylesTable.innerHTML = "";
    for (const [prop, val] of Object.entries(details.styles)) {
      const tr = document.createElement("tr");
      const tdLabel = document.createElement("td");
      tdLabel.className = "label-col";
      tdLabel.textContent = prop;
      const tdValue = document.createElement("td");
      tdValue.className = "value-col";
      tdValue.textContent = val;
      tr.appendChild(tdLabel);
      tr.appendChild(tdValue);
      stylesTable.appendChild(tr);
    }
  });

  // Helper for copy success toast notification
  const showToast = (message) => {
    const toast = document.getElementById("toast-notification");
    const toastMsg = document.getElementById("toast-message");
    if (!toast || !toastMsg) return;

    toastMsg.textContent = message;
    toast.classList.add("show");

    // Clear any existing timeout
    if (toast.timeoutId) {
      clearTimeout(toast.timeoutId);
    }

    toast.timeoutId = setTimeout(() => {
      toast.classList.remove("show");
    }, 2500);
  };

  // Action Button Listeners
  btnCopySelector.addEventListener("click", () => {
    if (currentPickedDetails) {
      window.electron.send("copy-to-clipboard", currentPickedDetails.selector);
      showToast("Selector copied to clipboard!");
    }
  });

  btnCopyOuterHtml.addEventListener("click", () => {
    if (currentPickedDetails) {
      window.electron.send("copy-to-clipboard", currentPickedDetails.outerHTML);
      showToast("Outer HTML copied to clipboard!");
    }
  });

  btnCopyInnerHtml.addEventListener("click", () => {
    if (currentPickedDetails) {
      window.electron.send("copy-to-clipboard", currentPickedDetails.innerHTML);
      showToast("Inner HTML copied to clipboard!");
    }
  });

  btnCopyStyles.addEventListener("click", () => {
    if (currentPickedDetails) {
      const stylesString = Object.entries(currentPickedDetails.styles)
        .map(([prop, val]) => `${prop}: ${val};`)
        .join("\n");
      window.electron.send("copy-to-clipboard", stylesString);
      showToast("Styles copied to clipboard!");
    }
  });

  btnCopyScreenshot.addEventListener("click", () => {
    if (currentPickedDetails && currentPickedDetails.bounds) {
      window.electron.send("copy-element-screenshot", currentPickedDetails.bounds);
      showToast("Element screenshot copied to clipboard!");
    }
  });

  btnOpenDevtools.addEventListener("click", () => {
    if (currentPickedDetails && currentPickedDetails.clientCoords) {
      window.electron.send("open-element-devtools", currentPickedDetails.clientCoords);
    }
  });

  // ==========================================================================
  // MULTIPLE TABS LISTENERS
  // ==========================================================================

  // Request new tab creation on plus button click
  newTabBtn.addEventListener("click", () => {
    window.electron.send("create-tab");
  });

  // Tab Created Event
  window.electron.on("tab-created", (tab) => {
    let hoverTimeout = null;
    const tabEl = document.createElement("div");
    tabEl.className = "tab";
    tabEl.id = `tab-${tab.id}`;
    tabEl.dataset.id = tab.id;
    tabEl.draggable = true;

    tabEl.innerHTML = `
      <div class="tab-inner">
        <div class="tab-icon">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
        </div>
        <span class="tab-title" id="tab-title-${tab.id}">${tab.title}</span>
        <button class="tab-close-btn" id="tab-close-${tab.id}">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    // Switch focus on click
    tabEl.addEventListener("click", (e) => {
      if (e.target.closest(".tab-close-btn")) return;
      if (hoverTimeout) clearTimeout(hoverTimeout);
      window.electron.send("hide-tab-hover-preview");
      window.electron.send("switch-tab", tab.id);
    });

    // Close button click
    const closeBtn = tabEl.querySelector(".tab-close-btn");
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (hoverTimeout) clearTimeout(hoverTimeout);
      window.electron.send("hide-tab-hover-preview");
      window.electron.send("close-tab", tab.id);
    });

    // Tab hover preview event handlers
    tabEl.addEventListener("mouseenter", () => {
      const cachedThumbnail = tabThumbnails[tab.id];
      if (cachedThumbnail) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        
        hoverTimeout = setTimeout(() => {
          const rect = tabEl.getBoundingClientRect();
          const tabTitleSpan = document.getElementById(`tab-title-${tab.id}`);
          const title = tabTitleSpan ? tabTitleSpan.textContent : tab.title;

          // Position window: x is center of tab, y is bottom of tab + offset
          // Adjust x by -98px to center a 196px width window
          const x = Math.round(rect.left + (rect.width / 2) - 98);
          const y = Math.round(rect.bottom + 6);

          window.electron.send("show-tab-hover-preview", {
            x,
            y,
            title,
            thumbnail: cachedThumbnail
          });
        }, 150); // 150ms hover intent delay
      }
    });

    tabEl.addEventListener("mouseleave", () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      window.electron.send("hide-tab-hover-preview");
    });

    // HTML5 Drag and Drop events for reordering
    tabEl.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tab.id);
      tabEl.classList.add("dragging");
    });

    tabEl.addEventListener("dragend", () => {
      tabEl.classList.remove("dragging");
      document.querySelectorAll(".tab").forEach(t => {
        t.classList.remove("drag-over-left", "drag-over-right");
      });
    });

    tabEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      
      const draggingTab = document.querySelector(".tab.dragging");
      if (!draggingTab || draggingTab === tabEl) return;
      
      const rect = tabEl.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      
      if (e.clientX < midpoint) {
        tabEl.classList.add("drag-over-left");
        tabEl.classList.remove("drag-over-right");
      } else {
        tabEl.classList.add("drag-over-right");
        tabEl.classList.remove("drag-over-left");
      }
    });

    tabEl.addEventListener("dragleave", () => {
      tabEl.classList.remove("drag-over-left", "drag-over-right");
    });

    tabEl.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedId = parseInt(e.dataTransfer.getData("text/plain"));
      const targetId = tab.id;
      
      if (draggedId === targetId) return;
      
      const draggedTab = document.getElementById(`tab-${draggedId}`);
      if (!draggedTab) return;
      
      const rect = tabEl.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      
      if (e.clientX < midpoint) {
        tabsList.insertBefore(draggedTab, tabEl);
      } else {
        tabsList.insertBefore(draggedTab, tabEl.nextSibling);
      }
      
      // Calculate and send new tab order to main process
      const newOrder = Array.from(tabsList.querySelectorAll(".tab")).map(t => parseInt(t.dataset.id));
      window.electron.send("reorder-tabs", newOrder);
      
      tabEl.classList.remove("drag-over-left", "drag-over-right");
    });

    tabsList.appendChild(tabEl);
  });

  // Tab Activated Event
  window.electron.on("tab-activated", (data) => {
    // Remove active class from all tabs
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));

    // Add active class to active tab
    const activeTab = document.getElementById(`tab-${data.id}`);
    if (activeTab) {
      activeTab.classList.add("active");
      activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }

    // Update Address bar
    if (data.url.includes("homepage.html") || data.url.startsWith("file://")) {
      addressInput.value = "";
      addressInput.placeholder = "Search Google or type a URL...";
    } else {
      addressInput.value = data.url;
    }

    // Check if default/home tab
    updateInspectButtonState(data.url);
    updateAddressBarIcons(data.url);

    // Enable/disable navigation controls state
    backBtn.disabled = !data.canGoBack;
    forwardBtn.disabled = !data.canGoForward;

    // Reset element picker values in sidebar for new tab context
    currentPickedDetails = null;
    pickedSelector.textContent = "None";
    pickedTag.textContent = "-";
    pickedId.textContent = "-";
    pickedClasses.textContent = "-";
    pickedText.textContent = "-";
    accRole.textContent = "-";
    accLabel.textContent = "-";
    accFocusable.textContent = "-";
    stylesTable.innerHTML = "";

    loadingOverlay.classList.add("hidden");
  });

  // Tab Closed Event
  window.electron.on("tab-closed", (id) => {
    const tabEl = document.getElementById(`tab-${id}`);
    if (tabEl) {
      tabEl.remove();
    }
  });

  // Tab Title Changed Event
  window.electron.on("tab-title-changed", (data) => {
    const titleSpan = document.getElementById(`tab-title-${data.id}`);
    if (titleSpan) {
      titleSpan.textContent = data.title;
    }
  });

  // Tab URL Changed Event
  window.electron.on("tab-url-changed", (data) => {
    // Handled in tab-activated or browser-url-changed. 
    // Left as placeholder hook for future features (e.g. bookmarks, history).
  });

  // Listen for URL changes from Main process (compatibility with direct address bar updates)
  window.electron.on("browser-url-changed", (url) => {
    loadingOverlay.classList.add("hidden");

    const activeTab = document.querySelector(".tab.active");
    if (activeTab) {
      const activeId = parseInt(activeTab.dataset.id);
      
      if (url.includes("homepage.html") || url.startsWith("file://")) {
        addressInput.value = "";
        addressInput.placeholder = "Search Google or type a URL...";
      } else {
        addressInput.value = url;
      }
    }
    
    // Sync inspect button state when URL changes
    updateInspectButtonState(url);
    updateAddressBarIcons(url);
  });

  window.electron.on("pick-mode-disabled", () => {
    pickModeCheckbox.checked = false;
  });

  // ==========================================================================
  // SITE SETTINGS & PERMISSIONS EVENT LISTENERS
  // ==========================================================================
  const siteSettingsBtn = document.getElementById("site-settings-btn");
  const searchIndicator = document.getElementById("search-indicator");

  const getActiveTabId = () => {
    const activeTabEl = document.querySelector(".tab.active");
    return activeTabEl ? parseInt(activeTabEl.dataset.id) : null;
  };

  // Click Tune settings button to open settings window popup
  siteSettingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    
    // Get the bounds of the Tune button
    const rect = siteSettingsBtn.getBoundingClientRect();
    
    const tabId = getActiveTabId();
    const url = addressInput.value.trim();
    if (tabId && url) {
      siteSettingsBtn.classList.add("active");
      
      // Request settings popup from main process
      window.electron.send('show-settings-popup', {
        x: Math.round(rect.left),
        y: Math.round(rect.bottom),
        tabId,
        url
      });
    }
  });

  // Remove active state when popup is closed
  window.electron.on('settings-popup-closed', () => {
    siteSettingsBtn.classList.remove("active");
  });

  // ==========================================================================
  // CSS SELECTOR TESTER WIRING
  // ==========================================================================
  const selectorTesterInput = document.getElementById("selector-tester-input");
  const selectorTesterResults = document.getElementById("selector-tester-results");

  let testSelectorTimeout = null;
  
  const runSelectorTest = () => {
    const selector = selectorTesterInput.value.trim();
    if (!selector) {
      selectorTesterResults.classList.add("hidden");
      window.electron.send("test-selector", ""); // Clears highlights
      return;
    }

    window.electron.send("test-selector", selector);
  };

  selectorTesterInput.addEventListener("input", () => {
    if (testSelectorTimeout) clearTimeout(testSelectorTimeout);
    testSelectorTimeout = setTimeout(runSelectorTest, 250); // Debounce to prevent lag
  });

  const testerMatchesList = document.getElementById("tester-matches-list");

  window.electron.on("selector-test-result", (result) => {
    selectorTesterResults.classList.remove("hidden");
    testerMatchesList.innerHTML = "";
    
    if (result.count === -1) {
      selectorTesterResults.textContent = "Invalid selector";
      selectorTesterResults.classList.add("error");
      testerMatchesList.classList.add("hidden");
    } else {
      selectorTesterResults.classList.remove("error");
      selectorTesterResults.textContent = `${result.count} match${result.count === 1 ? '' : 'es'}`;
      
      if (result.matchesList && result.matchesList.length > 0) {
        testerMatchesList.classList.remove("hidden");
        result.matchesList.forEach(item => {
          const card = document.createElement("div");
          card.className = "tester-match-card";
          
          card.innerHTML = `
            <div class="tester-match-header">
              <span class="tester-match-tag">${item.tag}</span>
              ${item.id ? `<span class="tester-match-id">${item.id}</span>` : ''}
              ${item.classes ? `<span class="tester-match-classes">${item.classes}</span>` : ''}
            </div>
            ${item.text ? `<div class="tester-match-text">${item.text}</div>` : ''}
          `;
          
          card.addEventListener("mouseenter", () => {
            window.electron.send("hover-tester-match", item.index);
          });
          
          card.addEventListener("mouseleave", () => {
            window.electron.send("clear-hover-tester-match");
          });
          
          card.addEventListener("click", () => {
            document.querySelectorAll(".tester-match-card").forEach(c => c.classList.remove("active"));
            card.classList.add("active");
            window.electron.send("click-tester-match", item.index);
          });
          
          testerMatchesList.appendChild(card);
        });
      } else {
        testerMatchesList.classList.add("hidden");
      }
    }
  });

  // Clear tester input and results when pick mode changes or sidebar toggles
  pickModeCheckbox.addEventListener("change", () => {
    selectorTesterInput.value = "";
    selectorTesterResults.classList.add("hidden");
    testerMatchesList.innerHTML = "";
    testerMatchesList.classList.add("hidden");
    window.electron.send("test-selector", "");
  });

  // ==========================================================================
  // DEVICE EMULATION VIEWPORT WIRING
  // ==========================================================================
  const emulationBtn = document.getElementById("emulation-btn");
  const emulationMenu = document.getElementById("emulation-menu");
  const emulationMenuItems = document.querySelectorAll(".emulation-menu-item");

  if (emulationBtn && emulationMenu) {
    emulationBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      emulationMenu.classList.toggle("show");
      emulationBtn.classList.toggle("active");
    });

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!emulationMenu.contains(e.target) && !emulationBtn.contains(e.target)) {
        emulationMenu.classList.remove("show");
        emulationBtn.classList.remove("active");
      }
    });

    emulationMenuItems.forEach(item => {
      item.addEventListener("click", () => {
        const mode = item.getAttribute("data-value");
        
        // Update active class on menu items
        emulationMenuItems.forEach(btn => btn.classList.remove("active"));
        item.classList.add("active");

        // Update the main button's SVG icon to match the selected mode's icon
        const selectedSvg = item.querySelector("svg");
        const mainSvg = emulationBtn.querySelector("svg");
        if (selectedSvg && mainSvg) {
          mainSvg.outerHTML = selectedSvg.outerHTML;
        }

        // Show/hide active mode dot on the main button
        if (mode !== "responsive") {
          emulationBtn.classList.add("custom-active");
        } else {
          emulationBtn.classList.remove("custom-active");
        }

        // Send IPC event
        window.electron.send("set-emulation-mode", mode);

        // Close menu
        emulationMenu.classList.remove("show");
        emulationBtn.classList.remove("active");
      });
    });
  }

  // ==========================================================================
  // CUSTOM ALERT MODAL WIRING (SHELL UI)
  // ==========================================================================
  const alertModal = document.getElementById("alert-modal");
  const alertBody = document.getElementById("alert-body");
  const alertOkBtn = document.getElementById("alert-ok-btn");
  const alertCloseBtn = document.getElementById("alert-close-btn");

  if (alertModal && alertBody && alertOkBtn && alertCloseBtn) {
    window.alert = function(message) {
      alertBody.textContent = message;
      alertModal.classList.add("active");
    };

    const closeAlertModal = () => {
      alertModal.classList.remove("active");
    };

    alertOkBtn.addEventListener("click", closeAlertModal);
    alertCloseBtn.addEventListener("click", closeAlertModal);

    alertModal.addEventListener("click", (e) => {
      if (e.target === alertModal) {
        closeAlertModal();
      }
    });
  }

  // ==========================================================================
  // TAB THUMBNAIL CACHE LISTENER
  // ==========================================================================
  window.electron.on("tab-thumbnail", (data) => {
    tabThumbnails[data.id] = data.thumbnail;
  });

  // ==========================================================================
  // LOCAL PORT DETECTOR WIRING
  // ==========================================================================
  const portNotification = document.getElementById("port-detector-notification");
  const detectedPortNum = document.getElementById("detected-port-num");
  const openPortBtn = document.getElementById("open-detected-port-btn");
  const closePortBtn = document.getElementById("close-port-notification");
  let activeDetectedPort = null;

  window.electron.on("port-detected", (port) => {
    activeDetectedPort = port;
    if (detectedPortNum && portNotification) {
      detectedPortNum.textContent = port;
      portNotification.classList.add("show");
    }
  });

  if (openPortBtn && portNotification) {
    openPortBtn.addEventListener("click", () => {
      if (activeDetectedPort) {
        window.electron.send("create-tab", `http://localhost:${activeDetectedPort}`);
      }
      portNotification.classList.remove("show");
    });
  }

  if (closePortBtn && portNotification) {
    closePortBtn.addEventListener("click", () => {
      portNotification.classList.remove("show");
    });
  }

  document.addEventListener("mouseleave", () => {
    window.electron.send("hide-tab-hover-preview");
  });
});
