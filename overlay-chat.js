/* BeeHappy Controls System
   - Creates a floating controls panel with emote picker and refresh functionality
   - Handles emote picker initialization and refresh operations
*/

// --- Continue with main controls class (top-frame behavior will run below) ---
class BeeHappyControls {
  constructor() {
    this.overlay = null;
    this.isDragging = false;
    this.isResizing = false;
    this.dragOffset = { x: 0, y: 0 };
    this.resizeStart = { x: 0, y: 0 };
    this.originalSize = { width: 0, height: 0 };
    this.userPositioned = false; // Track if user has positioned the overlay
    this._resizeHandler = null; // Store resize handler for cleanup

    this.init();
  }

  async init() {
    // Ensure emote map is ready, and subscribe to updates
    var isInited = await window.BeeHappyEmotes?.init();
    console.log("[Overlay-controls] Initializing BeeHappy Controls, emote map status: ", isInited);
    if (isInited) {
      console.log("[Overlay-controls] Initializing emote picker...");
      await this.createOverlay();
      await window.BeeHappyEmotes.init();
      this.emoteMap = window.BeeHappyEmotes.getMap();
      this.emoteRegex = window.BeeHappyEmotes.getRegex();
      const lists = window.BeeHappyEmotes.getLists ? window.BeeHappyEmotes.getLists() : {};
      const initialGlobal = Array.isArray(lists.global) ? lists.global : [];
      const initialStreamer = Array.isArray(lists.streamer) ? lists.streamer : [];

      const mergeListsToImageMap = (globalList = [], streamerList = []) => {
        return [...globalList, ...streamerList].reduce((acc, item) => {
          if (item && item.token) acc[item.token] = item.url || "";
          return acc;
        }, {});
      };

      this.emoteImageMap = mergeListsToImageMap(initialGlobal, initialStreamer);

      // Subscribe to future updates
      window.BeeHappyEmotes.onUpdate((map, regex, lists = {}) => {
        console.log("[Overlay-controls] Emote map updated (onupdate), refreshing local data:", { mapSize: Object.keys(map || {}).length, hasRegex: !!regex });
        this.emoteMap = map || {};
        this.emoteRegex = regex || null;
        const nextGlobal = Array.isArray(lists.global) ? lists.global : [];
        const nextStreamer = Array.isArray(lists.streamer) ? lists.streamer : [];
        this.emoteImageMap = mergeListsToImageMap(nextGlobal, nextStreamer);
      });
    } else {
      console.warn("[Overlay-controls] Some of the emote is not ready yet., retrying...");
      // Set time out and retries until init success
      setTimeout(() => {
        this.init();
      }, 1000);
      return;
    }
    this.setupEventListeners();
    this.setupResizeListener();

    // Toggle the overlay for user
    await this.toggle();
  }

  async createOverlay() {
    try {
      // Fetch the overlay HTML
      const response = await fetch(chrome.runtime.getURL("overlay-chat.html"));
      const html = await response.text();

      // Create a temporary container to parse HTML (use document for overlay creation)
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;

      // Extract and inject the CSS styles
      const styleElement = tempDiv.querySelector("style");
      if (styleElement) {
        const injectedStyles = document.createElement("style");
        injectedStyles.textContent = styleElement.textContent;
        injectedStyles.id = "beehappy-overlay-styles";

        // Remove existing styles if they exist
        const existingStyles = document.querySelector("#beehappy-overlay-styles");
        if (existingStyles) {
          existingStyles.remove();
        }

        document.head.appendChild(injectedStyles);
        // console.log("🐝 CSS styles injected");
      }

      // Initialize emote picker after overlay is ready
      const initEmotePicker = () => {
        // Wait for overlay elements to be ready
        const emotePicker = document.getElementById("emotePicker");
        const emoteSearch = document.getElementById("emoteSearchInput");
        const emoteGridGlobal = document.getElementById("emoteGridGlobal");
        const emoteGridStreamer = document.getElementById("emoteGridStreamer");

        if (!emotePicker || !emoteSearch || !emoteGridGlobal || !emoteGridStreamer) {
          console.log("🐝 Waiting for emote picker elements...");
          setTimeout(initEmotePicker, 50); // Reduced delay
          return;
        }

        // Ensure picker starts hidden
        emotePicker.classList.remove("visible");

        // Attach a content-script click handler to the emote button so it calls the
        // content-script picker instance (avoids page-context onclick issues).
        const emoteBtn = document.getElementById("emoteBtn");
        if (emoteBtn) {
          emoteBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            try {
              if (window.beeHappyEmotePicker && typeof window.beeHappyEmotePicker.togglePicker === "function") {
                window.beeHappyEmotePicker.togglePicker();
              } else {
                // Fallback: dispatch an event for other listeners
                document.dispatchEvent(new CustomEvent("beehappy:togglePicker"));
              }
            } catch (e) {
              console.error("🐝 Emote button click handler error", e);
            }
          });
        }

        // Wire refresh button: call BeeHappyEmotes.refreshFromApi() with UI feedback
        const refreshBtn = document.getElementById("refreshEmotesBtn");
        if (refreshBtn) {
          const doRefresh = async () => {
            if (refreshBtn.dataset.loading === "1") return;
            refreshBtn.dataset.loading = "1";
            refreshBtn.classList.add("loading");
            const prevTitle = refreshBtn.title;
            refreshBtn.title = "Refreshing emotes...";
            try {
              if (window.BeeHappyEmotes && typeof window.BeeHappyEmotes.refreshFromApi === "function") {
                const ok = await window.BeeHappyEmotes.refreshFromApi();

                // Update local emote data after successful refresh
                // if (ok) {
                //   this.emoteMap = window.BeeHappyEmotes.getMap();
                //   this.emoteRegex = window.BeeHappyEmotes.getRegex();
                //   const lists = window.BeeHappyEmotes.getLists ? window.BeeHappyEmotes.getLists() : {};
                //   const refreshedGlobal = Array.isArray(lists.global) ? lists.global : [];
                //   const refreshedStreamer = Array.isArray(lists.streamer) ? lists.streamer : [];

                //   const mergeListsToImageMap = (globalList = [], streamerList = []) => {
                //     return [...globalList, ...streamerList].reduce((acc, item) => {
                //       if (item && item.token) acc[item.token] = item.url || "";
                //       return acc;
                //     }, {});
                //   };

                //   this.emoteImageMap = mergeListsToImageMap(refreshedGlobal, refreshedStreamer);
                //   console.log("🐝 [Overlay] Local emote data updated after refresh:", {
                //     mapSize: Object.keys(this.emoteMap).length,
                //     imageMapSize: Object.keys(this.emoteImageMap).length,
                //     hasRegex: !!this.emoteRegex
                //   });
                // }

                refreshBtn.title = ok ? "Refreshed" : "Refresh failed";
              } else {
                // Fallback: dispatch an event for other modules that may handle refresh
                document.dispatchEvent(new CustomEvent("beehappy:requestRefresh"));
                refreshBtn.title = "Requested refresh";
              }
            } catch (err) {
              console.error("🐝 Refresh emotes error:", err);
              refreshBtn.title = "Refresh failed";
            } finally {
              setTimeout(() => {
                refreshBtn.title = prevTitle;
                refreshBtn.classList.remove("loading");
                delete refreshBtn.dataset.loading;
              }, 1200);
            }
          };

          refreshBtn.addEventListener("click", (e) => {
            e.preventDefault();
            doRefresh();
          });
        }

        // Notify other scripts the overlay (and picker button) are ready
        document.dispatchEvent(new Event("BeeHappyOverlayReady"));
      };

      // Extract the overlay element
      this.overlay = tempDiv.querySelector(".beehappy-overlay");

      if (!this.overlay) {
        console.error("🐝 Failed to create overlay from HTML");
        return;
      }

      // Inject into page (use document for overlay injection)
      document.body.appendChild(this.overlay);

      // Start hidden by default and set a very high z-index
      this.overlay.style.display = "none";
      this.overlay.style.zIndex = window.BeeHappyConstants?.UI_CONFIG.OVERLAY_Z_INDEX || 10000;

      // Add CSS properties to prevent interference with underlying elements
      this.overlay.style.userSelect = "none";
      this.overlay.style.webkitUserSelect = "none";
      this.overlay.style.msUserSelect = "none";
      this.overlay.style.pointerEvents = "auto";
      this.overlay.style.position = "fixed";
      this.overlay.style.isolation = "isolate"; // Create new stacking context

      // Load saved position
      this.loadPosition();

      // Ensure there are resize handles: corner, right-edge, and bottom-edge.
      // This allows resizing from the edges as well as the corner.
      let corner = this.overlay.querySelector(".beehappy-overlay-resizer-corner");
      let rightEdge = this.overlay.querySelector(".beehappy-overlay-resizer-right");
      let bottomEdge = this.overlay.querySelector(".beehappy-overlay-resizer-bottom");

      // Create corner handle if missing (small square at bottom-right)
      if (!corner) {
        corner = document.createElement("div");
        corner.className = "beehappy-overlay-resizer-corner";
        corner.style.position = "absolute";
        corner.style.width = "6px";
        corner.style.height = "6px";
        corner.style.right = "6px";
        corner.style.bottom = "6px";
        corner.style.cursor = "nwse-resize";
        corner.style.zIndex = "10001";
        corner.style.background = "transparent";
        this.overlay.appendChild(corner);
      }

      // Create right-edge handle if missing (full-height thin strip on the right)
      if (!rightEdge) {
        rightEdge = document.createElement("div");
        rightEdge.className = "beehappy-overlay-resizer-right";
        rightEdge.style.position = "absolute";
        rightEdge.style.top = "6px";
        rightEdge.style.bottom = "6px";
        rightEdge.style.right = "0px";
        rightEdge.style.width = "10px";
        rightEdge.style.cursor = "ew-resize";
        rightEdge.style.zIndex = "10000";
        rightEdge.style.background = "transparent";
        this.overlay.appendChild(rightEdge);
      }

      // Create bottom-edge handle if missing (full-width thin strip on the bottom)
      if (!bottomEdge) {
        bottomEdge = document.createElement("div");
        bottomEdge.className = "beehappy-overlay-resizer-bottom";
        bottomEdge.style.position = "absolute";
        bottomEdge.style.left = "6px";
        bottomEdge.style.right = "6px";
        bottomEdge.style.bottom = "0px";
        bottomEdge.style.height = "10px";
        bottomEdge.style.cursor = "ns-resize";
        bottomEdge.style.zIndex = "10000";
        bottomEdge.style.background = "transparent";
        this.overlay.appendChild(bottomEdge);
      }

      // Bind resize handlers
      this._onResizeMouseMove = this._onResizeMouseMove.bind(this);
      this._onResizeMouseUp = this._onResizeMouseUp.bind(this);

      // Wire mousedown on handles to kick off resize with the appropriate axis
      corner.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.startResize(ev, "both");
      });
      rightEdge.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.startResize(ev, "x");
      });
      bottomEdge.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.startResize(ev, "y");
      });

      // Now that overlay is in the DOM, start picker initialization
      initEmotePicker();
    } catch (error) {
      console.error("🐝 Error creating overlay:", error);
    }
  }

  /**
   * Sets up event listeners for overlay interactions (dragging, buttons, etc.)
   */
  setupEventListeners() {
    if (!this.overlay) return;

    const header = this.overlay.querySelector("#overlayHeader");
    const closeBtn = this.overlay.querySelector("#closeBtn");

    // Dragging functionality - exclude control buttons
    header.addEventListener("mousedown", (e) => {
      // Don't start dragging if clicking on control buttons
      if (e.target.closest(".control-btn")) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.startDrag(e);
    });
    document.addEventListener("mousemove", (e) => this.drag(e));
    document.addEventListener("mouseup", () => this.stopDrag());

    // Control buttons
    closeBtn.addEventListener("click", () => this.closeOverlay());

    // Prevent text selection while dragging
    header.addEventListener("selectstart", (e) => e.preventDefault());
  }

  /**
   * Sets up window resize listener to reposition overlay relative to chat container
   */
  setupResizeListener() {
    // Debounced resize handler to avoid excessive repositioning
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.repositionToChatContainer();
      }, 250); // 250ms debounce delay
    };

    window.addEventListener('resize', handleResize);

    // Store the handler so we can remove it later if needed
    this._resizeHandler = handleResize;
  }

  /**
   * Finds the YouTube chat container and repositions the overlay relative to it
   */
  repositionToChatContainer() {
    // if (!this.overlay || this.userPositioned || this.overlay.style.display === 'none') {
    //   return; // Don't auto-reposition if user has manually positioned or overlay is hidden
    // }

    const chatFrame = this.findChatContainer();
    if (chatFrame) {
      const rect = chatFrame.getBoundingClientRect();
      const overlayWidth = 200; // Updated to match new compact width
      const overlayHeight = 80; // Updated to match new compact height
      const offset = 10; // Offset from chat container

      // Position at the top-left of the chat container
      const left = rect.left;
      const top = rect.top;

      // Ensure overlay stays within viewport bounds
      const finalLeft = Math.max(0, Math.min(left, window.innerWidth - overlayWidth));
      const finalTop = Math.max(0, Math.min(top, window.innerHeight - overlayHeight));

      // Apply position
      this.overlay.style.position = "fixed";
      this.overlay.style.left = finalLeft + "px";
      this.overlay.style.top = finalTop + "px";
      this.overlay.style.right = "auto";
      this.overlay.style.bottom = "auto";

      // Set default dimensions if not already set
      if (!this.overlay.style.width || this.overlay.style.width === "") {
        this.overlay.style.width = overlayWidth + "px";
      }
      if (!this.overlay.style.height || this.overlay.style.height === "") {
        this.overlay.style.height = "auto";
      }

      console.log("🐝 Positioned controls at top-left of chat container:", {
        chatRect: rect,
        overlayLeft: this.overlay.style.left,
        overlayTop: this.overlay.style.top,
        finalLeft,
        finalTop
      });
    } else {
      // Fallback to default position if chat container not found
      this.overlay.style.position = "fixed";
      this.overlay.style.left = "20px";
      this.overlay.style.top = "100px";
      this.overlay.style.right = "auto";
      this.overlay.style.bottom = "auto";
      this.overlay.style.width = "200px";
      this.overlay.style.height = "auto";

      console.log("🐝 Chat container not found, using fallback position");
    }
  }

  /**
   * Finds the YouTube chat container element
   * @returns {Element|null} The chat container element or null if not found
   */
  findChatContainer() {
    // Try multiple selectors for different YouTube layouts
    const selectors = [
      "#chatframe", // Main chat iframe
      "ytd-live-chat-frame", // Live chat frame element
      "#chat", // Alternative chat selector
      "yt-live-chat-renderer", // Chat renderer element
      "#secondary #chat", // Chat in secondary column
      "ytd-watch-flexy #secondary #chat" // Specific watch page chat
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      console.log("🐝 Checking chat selector:", selector, element);
      if (element && element.getBoundingClientRect().width > 0) {
        console.log("🐝 Found chat container using selector:", selector, element);
        return element;
      }
    }

    return null;
  }

  startDrag(e) {
    // Don't start dragging if emote picker is visible
    const emotePicker = document.getElementById("emotePicker");
    if (emotePicker && emotePicker.classList.contains("visible")) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    this.isDragging = true;
    const rect = this.overlay.getBoundingClientRect();
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;
    this.overlay.style.cursor = "grabbing";

    // Add pointer-events: none to body to prevent interference with underlying elements
    document.body.style.pointerEvents = "none";
    this.overlay.style.pointerEvents = "auto";
  }

  drag(e) {
    if (!this.isDragging) return;

    e.preventDefault();
    e.stopPropagation();

    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;

    this.overlay.style.left = x + "px";
    this.overlay.style.top = y + "px";
    this.overlay.style.right = "auto";
  }

  stopDrag() {
    if (this.isDragging) {
      this.isDragging = false;
      this.overlay.style.cursor = "default";
      this.userPositioned = true; // Mark that user has positioned the overlay
      this.savePosition();

      // Restore pointer events to body
      document.body.style.pointerEvents = "";
    }
  }

  closeOverlay() {
    if (this.overlay) {
      this.overlay.style.display = "none";
      // console.log("🐝 Overlay hidden");
    }
  }

  /**
   * Cleanup method to remove event listeners
   */
  destroy() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  savePosition() {
    if (!this.overlay) return;

    const rect = this.overlay.getBoundingClientRect();
    const position = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };

    chrome.storage.local.set({ bh_overlay_position: position });
  }

  async loadPosition() {
    try {
      const result = await chrome.storage.local.get(["bh_overlay_position"]);
      if (result.bh_overlay_position) {
        const pos = result.bh_overlay_position;
        this.overlay.style.left = pos.left + "px";
        this.overlay.style.top = pos.top + "px";
        this.overlay.style.right = "auto";
        if (pos.width) this.overlay.style.width = pos.width + "px";
        if (pos.height) this.overlay.style.height = pos.height + "px";
        this.userPositioned = true; // Mark as user positioned since we loaded a saved position
      }
    } catch (error) {
      console.log("🐝 No saved position found, using default");
    }
  }

  show() {
    if (this.overlay) {
      // If user hasn't positioned the overlay manually, position it relative to chat
      if (!this.userPositioned) {
        this.repositionToChatContainer();
      }
      this.overlay.style.display = "flex";
    }
  }

  // axis: 'x' | 'y' | 'both'
  startResize(ev, axis = "both") {
    if (!this.overlay) return;

    ev.preventDefault();
    ev.stopPropagation();

    this.isResizing = true;
    this.resizeAxis = axis;
    this.resizeStart.x = ev.clientX;
    this.resizeStart.y = ev.clientY;
    const rect = this.overlay.getBoundingClientRect();
    this.originalSize.width = rect.width;
    this.originalSize.height = rect.height;
    document.addEventListener("mousemove", this._onResizeMouseMove);
    document.addEventListener("mouseup", this._onResizeMouseUp);
    this.overlay.classList.add("resizing");

    // Add pointer-events: none to body to prevent interference with underlying elements
    document.body.style.pointerEvents = "none";
    this.overlay.style.pointerEvents = "auto";
  }

  _onResizeMouseMove(ev) {
    if (!this.isResizing) return;

    ev.preventDefault();
    ev.stopPropagation();

    const dx = ev.clientX - this.resizeStart.x;
    const dy = ev.clientY - this.resizeStart.y;
    const minW = 200;
    const minH = 100;
    const maxW = window.innerWidth - 20;
    const maxH = window.innerHeight - 20;

    if (this.resizeAxis === "both" || this.resizeAxis === "x") {
      const newW = Math.round(this.originalSize.width + dx);
      this.overlay.style.width = Math.min(maxW, Math.max(minW, newW)) + "px";
    }

    if (this.resizeAxis === "both" || this.resizeAxis === "y") {
      const newH = Math.round(this.originalSize.height + dy);
      this.overlay.style.height = Math.min(maxH, Math.max(minH, newH)) + "px";
    }
  }

  _onResizeMouseUp() {
    if (!this.isResizing) return;
    this.isResizing = false;
    document.removeEventListener("mousemove", this._onResizeMouseMove);
    document.removeEventListener("mouseup", this._onResizeMouseUp);
    if (this.overlay) this.overlay.classList.remove("resizing");
    this.savePosition();

    // Restore pointer events to body
    document.body.style.pointerEvents = "";
  }

  hide() {
    if (this.overlay) {
      this.overlay.style.display = "none";
    }
  }

  async toggle() {
    if (this.overlay) {
      const isCurrentlyVisible = this.overlay.style.display === "flex";
      if (isCurrentlyVisible) {
        this.hide();
      } else {
        this.show();
        // Note: Removed viewport positioning restrictions to allow free dragging
      }
    }
  }
}

// Export for use in content script
window.BeeHappyControls = BeeHappyControls;
