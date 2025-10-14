class BeeHappyEmotePicker {
  constructor() {
    this.emotes = {
      global: [],
      streamer: [],
    };
    this.searchTerm = "";
    this.maxRetries = 50; // Maximum number of retries for initialization
    this.retryCount = 0;
    this.initialized = false;
    this.activeTab = "global";

    // Start initialization
    this.init();
  }

  async init() {
    try {
      // Get elements
      this.picker = document.getElementById("emotePicker");
      this.searchInput = document.getElementById("emoteSearchInput");
      this.searchResetBtn = document.getElementById("searchResetBtn");
      this.emoteGridGlobal = document.getElementById("emoteGridGlobal");
      this.emoteGridStreamer = document.getElementById("emoteGridStreamer");
      this.tabButtons = Array.from(document.querySelectorAll(".picker-tab"));

      // Wait for elements to be ready
      while (!this.searchInput || !this.searchResetBtn || !this.emoteGridGlobal || !this.emoteGridStreamer || this.tabButtons.length === 0) {
        if (this.retryCount >= this.maxRetries) {
          console.warn("[EmotePicker] Element initialization timeout, will retry later");
          return;
        }
        this.retryCount++;
        // Try to get it again
        this.picker = document.getElementById("emotePicker");
        this.searchInput = document.getElementById("emoteSearchInput");
        this.searchResetBtn = document.getElementById("searchResetBtn");
        this.emoteGridGlobal = document.getElementById("emoteGridGlobal");
        this.emoteGridStreamer = document.getElementById("emoteGridStreamer");
        this.tabButtons = Array.from(document.querySelectorAll(".picker-tab"));
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // console.log("🐝 [Picker] All elements found, proceeding with initialization");

      // Initialize once everything is ready
      if (!this.initialized) {
        this.initialized = true;

        // Set up the picker
        await this.setupPicker();
      }
    } catch (error) {
      console.error("[EmotePicker] Initialization error:", error);
      // Retry until the max retries is reached
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        setTimeout(() => this.init(), 500);
      } else {
        // Still try to set up with default emotes if possible
        if (!this.initialized && this.picker) {
          this.initialized = true;
          await this.setupPicker();
        }
      }
    }
  }

  async setupPicker() {
    // Ensure picker starts hidden
    this.picker.classList.remove("visible");

    this.setupEventListeners();
    // Ensure centralized emote map is ready
    try {
      await window.BeeHappyEmotes?.init?.();
    } catch (_) { }

    // ✅ Subscribe to updates FIRST, before any loading
    window.BeeHappyEmotes?.onUpdate?.((map, regex, lists = {}) => {
      const globalList = Array.isArray(lists.global) ? lists.global : [];
      const streamerList = Array.isArray(lists.streamer) ? lists.streamer : [];

      if (globalList.length !== 0) {
        this.updateEmotesFromGlobal(globalList);
      }
      if (streamerList.length !== 0) {
        this.updateEmotesFromStreamer(streamerList);
      }
      this.renderEmotes();
    });

    await this.loadEmotes();
    this.renderEmotes();
  }

  setupEventListeners() {
    // Search input handler
    if (this.searchInput) {
      this.searchInput.addEventListener("input", () => {
        this.searchTerm = this.searchInput.value.toLowerCase();
        this.updateResetButtonVisibility();
        this.renderEmotes();
      });

      // Clear search on Escape key
      this.searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          this.clearSearch();
        }
      });
    }

    // Search reset button handler
    if (this.searchResetBtn) {
      this.searchResetBtn.addEventListener("click", () => {
        this.clearSearch();
      });
    }

    if (Array.isArray(this.tabButtons)) {
      this.tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const targetTab = button.dataset.tab || "global";
          this.setActiveTab(targetTab);
          this.renderEmotes();
        });
      });
    }

    // Ensure the correct tab is visible on startup
    this.setActiveTab(this.activeTab);
  }

  clearSearch() {
    if (this.searchInput) {
      this.searchInput.value = "";
      this.searchTerm = "";
      this.updateResetButtonVisibility();
      this.renderEmotes();
      // Focus the search input after clearing
      this.searchInput.focus();
    }
  }

  updateResetButtonVisibility() {
    if (this.searchResetBtn) {
      const shouldShow = this.searchTerm && this.searchTerm.length > 0;
      if (shouldShow) {
        this.searchResetBtn.classList.add("visible");
      } else {
        this.searchResetBtn.classList.remove("visible");
      }
    }
  }

  cleanupTooltips() {
    // Remove any existing BeeHappy emote tooltips from the DOM
    const existingTooltips = document.querySelectorAll(".bh-emote-tooltip");
    existingTooltips.forEach(tooltip => {
      try {
        tooltip.remove();
      } catch (e) {
        // Ignore errors if tooltip is already removed
      }
    });
  }

  async loadEmotes() {
    try {
      const lists = window.BeeHappyEmotes?.getLists?.();
      if (lists) {
        this.updateEmotesFromLists(lists.global || [], lists.streamer || []);
      } else {
        this.updateEmotesFromLists([], []);
      }

      if (!this.emotes.global.length && !this.emotes.streamer.length) {
        try {
          const result = await window.BeeHappyEmotes.refreshFromApi();
          if (result) {
            const refreshedLists = window.BeeHappyEmotes?.getLists?.() || {};
            this.updateEmotesFromLists(refreshedLists.global || [], refreshedLists.streamer || []);
          }
        } catch (error) {
          console.error("[EmotePicker] refreshFromApi failed:", error);
        }
      }
    } catch (error) {
      console.warn("[EmotePicker] Error loading BeeHappy emotes:", error);
    }
  }

  updateEmotesFromLists(globalList, streamerList) {
    this.emotes.global = this.prepareDisplayList(globalList, "global");
    this.emotes.streamer = this.prepareDisplayList(streamerList, "streamer");
  }

  updateEmotesFromGlobal(globalList) {
    this.emotes.global = this.prepareDisplayList(globalList, "global");
  }

  updateEmotesFromStreamer(streamerList) {
    this.emotes.streamer = this.prepareDisplayList(streamerList, "streamer");
  }


  prepareDisplayList(list, type) {
    if (!Array.isArray(list)) return [];
    return list.map((item) => ({
      id: item.token,
      name: item.token,
      url: item.url || "",
      type,
      label: item.name || item.token,
      byUser: item.byUser || "Unknown user",
    }));
  }

  setActiveTab(tab) {
    this.activeTab = tab === "streamer" ? "streamer" : "global";

    if (Array.isArray(this.tabButtons)) {
      this.tabButtons.forEach((button) => {
        const isActive = (button.dataset.tab || "global") === this.activeTab;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
      });
    }

    if (this.emoteGridGlobal && this.emoteGridStreamer) {
      this.emoteGridGlobal.classList.toggle("hidden", this.activeTab !== "global");
      this.emoteGridStreamer.classList.toggle("hidden", this.activeTab !== "streamer");
      this.emoteGridGlobal.setAttribute("aria-hidden", this.activeTab === "global" ? "false" : "true");
      this.emoteGridStreamer.setAttribute("aria-hidden", this.activeTab === "streamer" ? "false" : "true");
    }
  }

  renderEmotes() {
    this.renderGrid(this.emoteGridGlobal, this.emotes.global);
    this.renderGrid(this.emoteGridStreamer, this.emotes.streamer);
    this.setActiveTab(this.activeTab);
  }

  filterEmotes(emotes) {
    if (!this.searchTerm) return emotes;
    const term = this.searchTerm;
    return emotes.filter((emote) => {
      const label = emote.label || "";
      return (
        (emote.name && emote.name.toLowerCase().includes(term)) ||
        (label && label.toLowerCase().includes(term)) ||
        (emote.id && emote.id.toLowerCase().includes(term))
      );
    });
  }

  renderGrid(grid, emotes) {
    if (!grid) return;

    // Clean up any existing tooltips before re-rendering
    this.cleanupTooltips();

    const filteredEmotes = this.filterEmotes(emotes || []);
    const fragment = (grid?.ownerDocument || document).createDocumentFragment();

    if (!filteredEmotes.length) {
      const empty = document.createElement("div");
      empty.className = "picker-empty";
      empty.textContent = "No emotes found";
      fragment.appendChild(empty);
    } else {
      filteredEmotes.forEach((emote) => {
        const emoteElement = document.createElement("div");
        emoteElement.className = "emote-item";
        emoteElement.setAttribute("role", "button");
        emoteElement.setAttribute("aria-label", `Select emote ${emote.label || emote.name}`);

        if (emote.url) {
          const img = document.createElement("img");
          img.setAttribute("src", emote.url);
          img.setAttribute("alt", emote.label || emote.name);
          img.setAttribute("loading", "lazy");
          // img.setAttribute("width", "36");
          // img.style.maxWidth = "36px";
          img.setAttribute("height", "36");
          img.style.maxHeight = "36px";
          img.style.maxWidth = "120px";
          img.style.display = "block";
          emoteElement.appendChild(img);
        } else {
          const fallbackText = document.createElement("span");
          fallbackText.textContent = emote.label || emote.name;
          fallbackText.style.fontSize = "18px";
          fallbackText.style.fontWeight = "600";
          emoteElement.appendChild(fallbackText);
        }

        emoteElement.addEventListener("mouseenter", () => {
          const tooltip = document.createElement("div");
          tooltip.className = "bh-emote-tooltip";
          tooltip.style.position = "fixed";
          tooltip.style.zIndex = 10010;
          // Visual style requested by user: translucent background, border, blur and shadow
          tooltip.style.background = "rgba(0, 0, 0, 0.45)";
          tooltip.style.color = "#fff";
          tooltip.style.padding = "8px 12px";
          tooltip.style.borderRadius = "16px";
          tooltip.style.boxShadow = "0 4px 30px rgba(0, 0, 0, 0.1)";
          tooltip.style.backdropFilter = "blur(6.5px)";
          tooltip.style.webkitBackdropFilter = "blur(6.5px)";
          tooltip.style.border = "1px solid rgba(0, 0, 0, 0.3)";
          tooltip.style.fontSize = "14px";
          tooltip.style.pointerEvents = "none";
          // Stack tooltip contents vertically so text lines appear one above the other
          tooltip.style.display = "flex";
          tooltip.style.flexDirection = "column";
          tooltip.style.alignItems = "center";
          tooltip.style.justifyContent = "center";
          tooltip.style.gap = "6px";

          if (emote.url) {
            const img = document.createElement("img");
            img.src = emote.url;
            img.alt = emote.label || emote.name;
            // img.width = 64;
            img.height = 64;
            img.style.display = "inline-block";
            img.style.verticalAlign = "middle";
            tooltip.appendChild(img);
          } else {
            const span = document.createElement("span");
            span.textContent = emote.label || emote.name;
            span.style.fontSize = "24px";
            span.style.marginRight = "8px";
            tooltip.appendChild(span);
          }

          // Create a text container so name + uploader stack and are centered
          const textContainer = document.createElement("div");
          textContainer.style.display = "flex";
          textContainer.style.flexDirection = "column";
          textContainer.style.alignItems = "center";
          // Ensure the text sits slightly away from the image (6px)
          textContainer.style.marginTop = "6px";
          textContainer.style.lineHeight = "1.1";

          const nameSpan = document.createElement("span");
          nameSpan.textContent = emote.label || emote.name;
          nameSpan.style.fontWeight = "bold";
          nameSpan.style.textAlign = "center";
          textContainer.appendChild(nameSpan);

          // Show uploader information if available (support string or object shapes)
          try {
            let uploader = "Unknown";
            if (emote && emote.byUser) {
              if (typeof emote.byUser === "string") {
                uploader = emote.byUser;
              } else if (typeof emote.byUser === "object") {
                uploader = emote.byUser.username || emote.byUser.name || emote.byUser.ownerName || "Unknown";
              }
            }
            const uploaderSpan = document.createElement("div");
            uploaderSpan.textContent = `By: ${uploader}`;
            uploaderSpan.style.fontSize = "12px";
            uploaderSpan.style.color = "#cfcfcf";
            uploaderSpan.style.marginTop = "4px";
            uploaderSpan.style.textAlign = "center";
            textContainer.appendChild(uploaderSpan);
          } catch (e) {
            // ignore tooltip enrich failures
          }

          tooltip.appendChild(textContainer);

          document.body.appendChild(tooltip);

          const emoteRect = emoteElement.getBoundingClientRect();
          const tooltipRect = tooltip.getBoundingClientRect();
          const left = emoteRect.left + emoteRect.width / 2 - tooltipRect.width / 2;
          const top = emoteRect.top - tooltipRect.height - 8;
          tooltip.style.left = Math.max(left, 8) + "px";
          tooltip.style.top = Math.max(top, 8) + "px";

          emoteElement._bhTooltip = tooltip;
        });

        emoteElement.addEventListener("mouseleave", () => {
          if (emoteElement._bhTooltip) {
            emoteElement._bhTooltip.remove();
            emoteElement._bhTooltip = null;
          }
        });

        emoteElement.addEventListener("click", () => this.selectEmote(emote));
        fragment.appendChild(emoteElement);
      });
    }

    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }

    grid.appendChild(fragment);
  }

  async selectEmote(emote) {
    if (!this.picker) return;

    const textToCopy = emote?.name || "";
    let copied = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy + " ");
        copied = true;
      } else {
        // Fallback for environments without async clipboard API
        const ta = document.createElement("textarea");
        ta.value = textToCopy;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
          const ok = document.execCommand("copy");
          if (ok) copied = true;
        } catch (_) { }
        ta.remove();
        if (copied) {
          // Successfully copied via fallback
        }
      }
    } catch (err) {
      console.error("[EmotePicker] Failed to copy emote to clipboard:", err);
    } finally {
      // Show a transient toast if the copy succeeded, then hide the picker
      if (copied) {
        try {
          this.showCopiedToast(emote.label || textToCopy);
        } catch (e) {
          // Ignore toast failures
        }
      }
      this.hidePicker();
      // Then reset the search bar
      // this.clearSearch();
    }
  }

  // Small transient toast to confirm clipboard copy
  showCopiedToast(text) {
    try {
      const msg = text ? `${text} copied` : "Copied to clipboard";
      const toast = document.createElement("div");
      toast.className = "bh-toast";
      toast.textContent = msg;
      // Restore critical inline styles for visibility
      toast.style.position = "fixed";
      toast.style.left = "50%";
      toast.style.bottom = "8%";
      toast.style.transform = "translateX(-50%)";
      toast.style.background = "#7C3AED";
      toast.style.color = "#fff";
      toast.style.padding = "8px 12px";
      toast.style.borderRadius = "8px";
      toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
      toast.style.zIndex = 500;
      toast.style.opacity = "0";
      toast.style.transition = "opacity 180ms ease-in-out, transform 180ms ease-in-out";
      toast.style.pointerEvents = "none";
      toast.style.fontSize = "18px";

      // Query for the overlay
      const overlay = document.querySelector("#overlay-footer");
      if (overlay) {
        overlay.appendChild(toast);
      } else {
        document.body.appendChild(toast);
      }

      // Force reflow then animate in
      // eslint-disable-next-line no-unused-expressions
      toast.offsetHeight;
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(-6px)";

      // Remove after short delay
      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(0)";
        setTimeout(() => {
          try {
            toast.remove();
          } catch (_) { }
        }, 200);
      }, 1400);
    } catch (e) {
      console.warn("[EmotePicker] Failed to show toast", e);
    }
  }

  togglePicker() {
    if (!this.picker) {
      console.error("[EmotePicker] Picker element not found");
      return;
    }

    const isVisible = this.picker.classList.contains("visible");

    if (isVisible) {
      this.hidePicker();
    } else {
      this.showPicker();
    }
  }

  showPicker() {
    if (!this.picker) {
      console.error("[EmotePicker] Picker element not found in showPicker");
      return;
    }

    // Simply add the visible class
    this.picker.classList.add("visible");

    // Ensure picker stays within viewport
    this.adjustPickerPosition();

    const emoteBtn = document.getElementById("emoteBtn");
    if (emoteBtn) {
      emoteBtn.classList.add("active");
    }

    // Update search term from current input value and reset button visibility
    if (this.searchInput) {
      this.searchTerm = this.searchInput.value.toLowerCase();
    }
    this.updateResetButtonVisibility();

    // Focus the search input when picker opens
    if (this.searchInput) {
      setTimeout(() => this.searchInput.focus(), 100);
    }
  }

  adjustPickerPosition() {
    if (!this.picker) return;

    // Get the emote button position to determine optimal picker placement
    const emoteBtn = document.getElementById("emoteBtn");
    if (!emoteBtn) {
      console.warn("[EmotePicker] Emote button not found for positioning");
      return;
    }

    const btnRect = emoteBtn.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const pickerHeight = 250; // Updated to match new compact height
    const margin = 6;

    // Determine if there's enough space above the button for smart vertical positioning
    const spaceAbove = btnRect.top;
    const spaceBelow = viewportHeight - btnRect.bottom;
    const preferBottom = spaceAbove < pickerHeight + margin && spaceBelow >= pickerHeight + margin;

    if (preferBottom) {
      // Position below button
      this.picker.style.bottom = "auto";
      this.picker.style.top = "100%";
      this.picker.style.marginTop = margin + "px";
      this.picker.style.marginBottom = "0";
      this.picker.style.borderRadius = "0 0 8px 8px";
    } else {
      // Position above button (default)
      this.picker.style.bottom = "100%";
      this.picker.style.top = "auto";
      this.picker.style.marginTop = "0";
      this.picker.style.marginBottom = margin + "px";
      this.picker.style.borderRadius = "8px";
    }

    // Always align to the right edge of the button container to avoid left/right jumping
    this.picker.style.right = "0";
    this.picker.style.left = "auto";

    // If picker would go off the left edge, shift it right but keep stable anchor
    const pickerRect = this.picker.getBoundingClientRect();
    if (pickerRect.left < 0) {
      // Shift just enough to stay in bounds
      const shiftAmount = Math.abs(pickerRect.left) + 10; // 10px buffer
      this.picker.style.transform = `translateX(${shiftAmount}px)`;
    } else {
      // Reset transform if no adjustment needed
      this.picker.style.transform = "";
    }
  } hidePicker() {
    if (!this.picker) return;

    // console.log("🐝 [Picker] Hiding picker");

    // Clean up any existing tooltips before hiding
    this.cleanupTooltips();

    // Simply remove the visible class
    this.picker.classList.remove("visible");

    const emoteBtn = document.getElementById("emoteBtn");
    if (emoteBtn) {
      emoteBtn.classList.remove("active");
    }

    // Clear search when hiding - ensure both input value and internal state are cleared
    if (this.searchInput) {
      this.searchInput.value = "";
      this.searchTerm = "";
      this.updateResetButtonVisibility();
      // Re-render emotes to show all emotes when search is cleared
      this.renderEmotes();
    }
  }
}

document.addEventListener("BeeHappyOverlayReady", () => {
  if (!window.beeHappyEmotePicker) {
    window.beeHappyEmotePicker = new BeeHappyEmotePicker();
  }
});

// Fallback: respond to custom event dispatched from page/overlay if picker isn't available yet
document.addEventListener("beehappy:togglePicker", () => {
  try {
    if (window.beeHappyEmotePicker && typeof window.beeHappyEmotePicker.togglePicker === "function") {
      window.beeHappyEmotePicker.togglePicker();
    } else {
      console.warn("[EmotePicker] beehappy:togglePicker received but picker not ready");
    }
  } catch (e) {
    console.error("[EmotePicker] Error handling beehappy:togglePicker", e);
  }
});
