class BeeHappyEmotePicker {
  constructor() {
    this.currentTab = "youtube";
    this.emotes = {
      youtube: [],
      beehappy: [],
    };
    this.searchTerm = "";
    this.maxRetries = 50; // Maximum number of retries for initialization
    this.retryCount = 0;
    this.initialized = false;
    this.beeHappyRefreshedOnce = false;

    // Common emoji list for YouTube tab
    this.youtubeEmojis = [
      "😀",
      "😄",
      "😁",
      "😅",
      "😂",
      "🤣",
      "😊",
      "😇",
      "🙂",
      "🙃",
      "😉",
      "😌",
      "😍",
      "🥰",
      "😘",
      "😗",
      "😙",
      "😚",
      "😋",
      "😛",
      "😝",
      "😜",
      "🤪",
      "🤨",
      "🧐",
      "🤓",
      "😎",
      "🤩",
      "🥳",
      "😏",
      "😒",
      "😞",
      "😔",
      "😟",
      "😕",
      "🙁",
      "☹️",
      "😣",
      "😖",
      "😩",
      "🥺",
      "😢",
      "😭",
      "😤",
      "😠",
      "😡",
      "🤬",
      "🤯",
      "😳",
      "🥵",
      "🥶",
      "😱",
      "😨",
      "😰",
      "😥",
      "😓",
      "🤗",
      "🤔",
      "🤭",
      "🤫",
      "🤥",
      "😶",
      "😐",
      "😑",
      "🙄",
      "😯",
      "😦",
      "😧",
      "😮",
      "😲",
      "🥱",
      "😴",
      "🤤",
      "😪",
      "😵",
    ];

    // Start initialization
    this.init();
  }

  async init() {
    try {
      // Get elements
      this.picker = document.getElementById("emotePicker");
      this.searchInput = document.getElementById("emoteSearchInput");
      // Two dedicated grids (one per tab)
      this.emoteGridYoutube = document.getElementById("emoteGridYoutube");
      this.emoteGridBeeHappy = document.getElementById("emoteGridBeeHappy");
      this.tabs = document.querySelectorAll(".picker-tab");

      // Wait for elements to be ready
      while (!this.searchInput || !this.emoteGridYoutube || !this.emoteGridBeeHappy || !this.tabs) {
        if (this.retryCount >= this.maxRetries) {
          console.warn("🐝 Element initialization timeout, will retry later");
          return;
        }
        this.retryCount++;
        // Try to get it again
        this.picker = document.getElementById("emotePicker");
        this.searchInput = document.getElementById("emoteSearchInput");
        this.emoteGridYoutube = document.getElementById("emoteGridYoutube");
        this.emoteGridBeeHappy = document.getElementById("emoteGridBeeHappy");
        this.tabs = document.querySelectorAll(".picker-tab");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log("🐝 [Picker] All elements found, proceeding with initialization");

      // Initialize once everything is ready
      if (!this.initialized) {
        this.initialized = true;
        console.log("🐝 Emote picker initialized");

        // Set up the picker
        await this.setupPicker();
      }
    } catch (error) {
      console.error("🐝 Initialization error:", error);
      // Retry until the max retries is reached
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(`🐝 Retrying initialization (${this.retryCount}/${this.maxRetries})...`);
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
    } catch (_) {}

    // ✅ Subscribe to updates FIRST, before any loading
    window.BeeHappyEmotes?.onUpdate?.((map, regex, list) => {
      if (!Array.isArray(list) || list.length === 0) {
        console.warn("🐝 [Picker] onUpdate received empty list, skipping update");
        return;
      }

      if (Array.isArray(list)) {
        this.updateBeeHappyFromList(list);
        this.renderInto("beehappy");
      }
    });

    console.log("🐝 [Picker] Pre-Loading emotes...");
    await this.loadEmotes();
    // Preload both grids so switching tabs is instant
    this.renderInto("youtube");
    this.renderInto("beehappy");
    // Ensure initial tab visibility and content
    const yt = this.emoteGridYoutube;
    const bh = this.emoteGridBeeHappy;
    if (yt && bh) {
      bh.classList.remove("hidden");
      yt.classList.add("hidden");
    }
  }

  setupEventListeners() {
    // Search input handler
    if (this.searchInput) {
      this.searchInput.addEventListener("input", () => {
        this.searchTerm = this.searchInput.value.toLowerCase();
        this.renderEmotes();
      });
    }

    // Tab switching
    this.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        // Remove active class from all tabs
        this.tabs.forEach((t) => {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        // Add active class to clicked tab
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");

        this.currentTab = tab.dataset.tab;

        // Update tabpanel
        const yt = this.emoteGridYoutube;
        const bh = this.emoteGridBeeHappy;
        if (yt && bh) {
          if (this.currentTab === "youtube") {
            yt.classList.remove("hidden");
            bh.classList.add("hidden");
            yt.setAttribute("aria-labelledby", "youtube-tab");
          } else {
            bh.classList.remove("hidden");
            yt.classList.add("hidden");
            bh.setAttribute("aria-labelledby", "beehappy-tab");
          }
        }

        // No auto-fetch on switch; grids are preloaded
      });
    });

    // Close picker on escape key - DISABLED per user request
    // document.addEventListener('keydown', (e) => {
    //     if (e.key === 'Escape' && this.picker && this.picker.classList.contains('visible')) {
    //         this.hidePicker();
    //     }
    // });
  }

  // Event handler attachment removed - now handled directly in HTML

  async loadEmotes() {
    try {
      // Load YouTube emojis first (these are local so they'll always work)
      this.emotes.youtube = this.youtubeEmojis.map((emoji) => ({
        id: emoji,
        name: emoji,
        type: "youtube",
      }));

      // Then load BeeHappy emotes from centralized list
      const list = window.BeeHappyEmotes?.getList?.();
      // console.log("🐝 [Picker] initial BeeHappy list:", list);

      if (!list || !list.length) {
        try {
          const result = await window.BeeHappyEmotes.refreshFromApi();
          if (result) {
            const updatedList = window.BeeHappyEmotes.getList();
            if (updatedList && updatedList.length > 0) {
              this.updateBeeHappyFromList(updatedList);
            }
          }
        } catch (error) {
          console.error("🐝 [Picker] refreshFromApi failed:", error);
        }
      } else {
        // ✅ If list already exists, update immediately
        this.updateBeeHappyFromList(list);
      }
    } catch (error) {
      console.warn("🐝 Error loading BeeHappy emotes:", error);
    }
  }

  renderInto(tab) {
    const prev = this.currentTab;
    this.currentTab = tab;
    this.renderEmotes();
    this.currentTab = prev;
  }

  updateBeeHappyFromList(list) {
    this.emotes.beehappy = list.map((item) => ({
      id: item.token,
      name: item.token, // use token as the value we copy
      url: item.url || "",
      type: "beehappy",
      label: item.name || item.token,
    }));
  }

  // ensureBeeHappyList removed – grids are preloaded and updated via onUpdate

  renderEmotes() {
    const grid = this.currentTab === "youtube" ? this.emoteGridYoutube : this.emoteGridBeeHappy;
    if (!grid) {
      console.warn("🐝 [Picker] renderEmotes: emoteGrid not ready");
      return;
    }

    const emotes = this.emotes[this.currentTab] || [];
    const filteredEmotes = this.searchTerm
      ? emotes.filter(
          (emote) =>
            emote.name.toLowerCase().includes(this.searchTerm) ||
            (emote.id && emote.id.toLowerCase().includes(this.searchTerm))
        )
      : emotes;

    // Create elements using the same ownerDocument as the target grid
    const fragment = (grid?.ownerDocument || document).createDocumentFragment();

    emotes.forEach((emote) => {
      const emoteElement = document.createElement("div");
      emoteElement.className = "emote-item";
      emoteElement.setAttribute("role", "button");
      emoteElement.setAttribute("aria-label", `Select emote ${emote.name}`);

      if (emote.type === "youtube") {
        const textNode = document.createTextNode(emote.name);
        emoteElement.appendChild(textNode);
      } else {
        if (emote.url) {
          const img = document.createElement("img");
          img.setAttribute("src", emote.url);
          img.setAttribute("alt", emote.name);
          img.setAttribute("loading", "lazy");
          img.setAttribute("width", "32");
          img.setAttribute("height", "32");
          img.style.maxWidth = "32px";
          img.style.maxHeight = "32px";
          img.style.display = "block";
          emoteElement.appendChild(img);
        }
      }

      // Tooltip logic
      emoteElement.addEventListener("mouseenter", (e) => {
        let tooltip = document.createElement("div");
        tooltip.className = "bh-emote-tooltip";
        tooltip.style.position = "fixed";
        tooltip.style.zIndex = 10010;
        tooltip.style.background = "#222";
        tooltip.style.color = "#fff";
        tooltip.style.padding = "8px 12px";
        tooltip.style.borderRadius = "8px";
        tooltip.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
        tooltip.style.fontSize = "14px";
        tooltip.style.pointerEvents = "none";
        tooltip.style.display = "flex";
        tooltip.style.alignItems = "center";
        tooltip.style.gap = "8px";

        // Emote preview
        if (emote.url) {
          const img = document.createElement("img");
          img.src = emote.url;
          img.alt = emote.name;
          img.width = 64;
          img.height = 64;
          img.style.display = "inline-block";
          img.style.verticalAlign = "middle";
          tooltip.appendChild(img);
        } else {
          const span = document.createElement("span");
          span.textContent = emote.name;
          span.style.fontSize = "24px";
          span.style.marginRight = "8px";
          tooltip.appendChild(span);
        }

        // Emote name
        const nameSpan = document.createElement("span");
        nameSpan.textContent = emote.label || emote.name;
        nameSpan.style.fontWeight = "bold";
        tooltip.appendChild(nameSpan);

        document.body.appendChild(tooltip);

        // Position tooltip above the hovered emote element
        const emoteRect = emoteElement.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        // Center tooltip horizontally to emote, and place above
        const left = emoteRect.left + emoteRect.width / 2 - tooltipRect.width / 2;
        const top = emoteRect.top - tooltipRect.height - 8; // 8px gap above
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

    // Clear and update grid safely
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
        await navigator.clipboard.writeText(textToCopy);
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
        } catch (_) {}
        ta.remove();
        if (copied) {
          // Successfully copied via fallback
        }
      }
    } catch (err) {
      console.error("🐝 Failed to copy emote to clipboard:", err);
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
          } catch (_) {}
        }, 200);
      }, 1400);
    } catch (e) {
      console.warn("🐝 Failed to show toast", e);
    }
  }

  togglePicker() {
    if (!this.picker) {
      console.error("🐝 Picker element not found");
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
      console.error("🐝 Picker element not found in showPicker");
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

    // Focus the search input when picker opens
    if (this.searchInput) {
      setTimeout(() => this.searchInput.focus(), 100);
    }
  }

  adjustPickerPosition() {
    if (!this.picker) return;

    const rect = this.picker.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // If picker goes above viewport, position it below the button instead
    if (rect.top < 0) {
      this.picker.style.bottom = "auto";
      this.picker.style.top = "100%";
      this.picker.style.marginTop = "8px";
      this.picker.style.marginBottom = "0";
      this.picker.style.borderRadius = "0 0 12px 12px";
    } else {
      // Reset to default position (above button)
      this.picker.style.bottom = "100%";
      this.picker.style.top = "auto";
      this.picker.style.marginTop = "0";
      this.picker.style.marginBottom = "8px";
      this.picker.style.borderRadius = "12px";
    }

    // If picker goes off the right edge, adjust right position
    if (rect.right > viewportWidth) {
      this.picker.style.right = "0";
      this.picker.style.left = "auto";
    }
  }

  hidePicker() {
    if (!this.picker) return;

    // Simply remove the visible class
    this.picker.classList.remove("visible");

    const emoteBtn = document.getElementById("emoteBtn");
    if (emoteBtn) {
      emoteBtn.classList.remove("active");
    }

    // Clear search when hiding
    if (this.searchInput) {
      this.searchInput.value = "";
      this.searchTerm = "";
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
      console.warn("🐝 beehappy:togglePicker received but picker not ready");
    }
  } catch (e) {
    console.error("🐝 Error handling beehappy:togglePicker", e);
  }
});
