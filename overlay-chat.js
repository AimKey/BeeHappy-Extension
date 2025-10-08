/* BeeHappy Overlay Chat System
   - If this script is injected into an iframe (chat iframe), it will act as a lightweight helper:
     it observes yt-live-chat message nodes and posts them to the parent window using postMessage.
   - If it's running in the top frame, it will create an overlay and listen for messages from iframe helpers.
*/
let chatRootElement = null;
let defaultOverlayHeight = -1;
// --- If running inside a frame (chat iframe), bootstrap a helper observer that posts messages to parent ---
if (window.top !== window.self) {
  (function setupIframeHelper() {
    try {
      const doc = document;
      const sendToParent = (author, text) => {
        try {
          window.parent.postMessage({ source: "BeeHappy", type: "chat_message", author, text }, "*");
        } catch (err) {
          // ignore postMessage failures
        }
      };

      const processMessageNode = (node) => {
        try {
          const author = node.querySelector("#author-name")?.textContent?.trim() || "";
          const message = node.querySelector("#message")?.innerHTML || "";
          if (author || message) sendToParent(author, message);
        } catch (e) {
          // ignore individual node errors
        }
      };

      const scanExisting = () => {
        const existing = doc.querySelectorAll("yt-live-chat-text-message-renderer");
        existing.forEach(processMessageNode);
      };

      const attachObserver = (container) => {
        if (!container) return false;
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((m) => {
            m.addedNodes.forEach((n) => {
              if (n.nodeType === 1 && n.tagName === "YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER") {
                processMessageNode(n);
              } else if (n.querySelectorAll) {
                const found = n.querySelectorAll("yt-live-chat-text-message-renderer");
                found.forEach(processMessageNode);
              }
            });
          });
        });
        observer.observe(container, { childList: true, subtree: true });
        return true;
      };

      const tryStart = () => {
        // common chat containers inside iframe
        const selectors = [
          "yt-live-chat-renderer #items",
          "#items",
          "yt-live-chat-item-list-renderer",
          "#chat-messages",
          "yt-live-chat-renderer",
        ];

        for (const s of selectors) {
          const c = doc.querySelector(s);
          if (c) {
            scanExisting();
            attachObserver(c);
            return;
          }
        }

        // Retry after delay if not found
        setTimeout(tryStart, 1500);
      };

      tryStart();
    } catch (err) {
      // If anything fails, retry once after a delay
      setTimeout(setupIframeHelper, 2000);
    }
  })();
}

// --- Continue with main overlay class (top-frame behavior will run below) ---
class BeeHappyOverlayChat {
  constructor() {
    this.overlay = null;
    this.chatContainer = null;
    this.isMinimized = false;
    this.isDragging = false;
    this.isResizing = false;
    this.dragOffset = { x: 0, y: 0 };
    this.resizeStart = { x: 0, y: 0 };
    this.originalSize = { width: 0, height: 0 };
    this.messageCount = 0;
    this.maxMessages = 50; // Limit messages to prevent memory issues
    this.loggedUsers = new Set();

    // Centralized emote maps
    // this.emoteMap = (window.BeeHappyEmotes && window.BeeHappyEmotes.getMap()) || {};
    // this.emoteRegex =
    //   (window.BeeHappyEmotes && window.BeeHappyEmotes.getRegex && window.BeeHappyEmotes.getRegex()) || null;
    // this.emoteImageMap = {};
    // console.log("[Overlay-chat] Inited emote map: ", this.emoteMap);

    this.init();
  }

  async init() {
    console.log("🐝 Initializing BeeHappy Overlay Chat...");
    await this.createOverlay();
    // Ensure emote map is ready, and subscribe to updates
    if (window.BeeHappyEmotes?.init) {
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
        this.emoteMap = map || {};
        this.emoteRegex = regex || null;
        const nextGlobal = Array.isArray(lists.global) ? lists.global : [];
        const nextStreamer = Array.isArray(lists.streamer) ? lists.streamer : [];
        this.emoteImageMap = mergeListsToImageMap(nextGlobal, nextStreamer);
      });
    } else {
      // Set time out and retries until init success
      setTimeout(() => {
        this.init();
      }, 1000);
      return;
    }
    this.setupEventListeners();
    this.startChatMonitoring();
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
      this.chatContainer = this.overlay.querySelector("#chatContainer");

      // Start hidden by default and set a very high z-index
      this.overlay.style.display = "none";
      this.overlay.style.zIndex = window.BeeHappyConstants?.UI_CONFIG.OVERLAY_Z_INDEX || 10000;

      // console.log("🐝 Overlay created successfully");
      // console.log("🐝 Overlay element:", this.overlay);
      // console.log("🐝 Overlay parent:", this.overlay.parentElement);
      // console.log("🐝 Overlay in DOM:", document.contains(this.overlay));

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
        corner.style.width = "12px";
        corner.style.height = "12px";
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
        this.startResize(ev, "both");
      });
      rightEdge.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        this.startResize(ev, "x");
      });
      bottomEdge.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
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
    const minimizeBtn = this.overlay.querySelector("#minimizeBtn");
    const closeBtn = this.overlay.querySelector("#closeBtn");

    // Dragging functionality - exclude control buttons
    header.addEventListener("mousedown", (e) => {
      // Don't start dragging if clicking on control buttons
      if (e.target.closest(".control-btn")) {
        return;
      }
      this.startDrag(e);
    });
    document.addEventListener("mousemove", (e) => this.drag(e));
    document.addEventListener("mouseup", () => this.stopDrag());

    // Control buttons
    minimizeBtn.addEventListener("click", () => this.toggleMinimize());

    closeBtn.addEventListener("click", () => this.closeOverlay());

    // Prevent text selection while dragging
    header.addEventListener("selectstart", (e) => e.preventDefault());
  }

  startDrag(e) {
    // Don't start dragging if emote picker is visible
    const emotePicker = document.getElementById("emotePicker");
    if (emotePicker && emotePicker.classList.contains("visible")) {
      return;
    }

    this.isDragging = true;
    const rect = this.overlay.getBoundingClientRect();
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;
    this.overlay.style.cursor = "grabbing";
  }

  drag(e) {
    if (!this.isDragging) return;

    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;

    // Keep overlay within viewport
    const maxX = window.innerWidth - this.overlay.offsetWidth;
    const maxY = window.innerHeight - this.overlay.offsetHeight;

    const clampedX = Math.max(0, Math.min(x, maxX));
    const clampedY = Math.max(0, Math.min(y, maxY));

    this.overlay.style.left = clampedX + "px";
    this.overlay.style.top = clampedY + "px";
    this.overlay.style.right = "auto";
  }

  stopDrag() {
    if (this.isDragging) {
      this.isDragging = false;
      this.overlay.style.cursor = "default";
      this.savePosition();
    }
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    this.overlay.classList.toggle("overlay-minimized", this.isMinimized);
    this.overlay.style.height = this.isMinimized ? "48px" : defaultOverlayHeight;

    const minimizeBtn = this.overlay.querySelector("#minimizeBtn");
    minimizeBtn.textContent = this.isMinimized ? "+" : "−";
    minimizeBtn.title = this.isMinimized ? "Restore" : "Minimize";
    // Update chat sizing after minimize toggle
    setTimeout(() => this._applyChatSizing(), 0);
  }

  closeOverlay() {
    if (this.overlay) {
      this.overlay.style.display = "none";
      // console.log("🐝 Overlay hidden");
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
      }
    } catch (error) {
      console.log("🐝 No saved position found, using default");
    }
  }

  /**
   * Starts monitoring YouTube chat messages and processes them for overlay display.
   */
  /// SECTION: CHAT_MONITORING
  startChatMonitoring() {
    console.log("🐝 Starting YouTube chat monitoring...");

    // Monitor for new chat messages
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.tagName === "YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER") {
            this.processChatMessage(node);
          }
        });
      });
    });

    // Find chat container and start observing
    const findChatContainer = () => {
      const chatFrame = document.querySelector("#chatframe");

      if (!chatFrame) {
        setTimeout(findChatContainer, 1000); // Reduced delay
        return;
      }

      // Get the iframe's document robustly
      let chatDoc = null;
      if (chatFrame) {
        if (chatFrame.contentDocument) {
          chatDoc = chatFrame.contentDocument;
        } else if (chatFrame.contentWindow && chatFrame.contentWindow.document) {
          chatDoc = chatFrame.contentWindow.document;
        }
      }

      if (!chatDoc) {
        setTimeout(findChatContainer, 1000); // Reduced delay
        return;
      }

      chatRootElement = chatDoc;

      const chatContainer =
        chatDoc.querySelector("yt-live-chat-renderer #items") ||
        chatDoc.querySelector("#chat-messages") ||
        chatDoc.querySelector("yt-live-chat-item-list-renderer");

      if (chatContainer) {
        observer.observe(chatContainer, {
          childList: true,
          subtree: true,
        });
        this.updateStatus("Monitoring YouTube chat");

        // Process existing messages
        this.processExistingMessages();
      } else {
        setTimeout(findChatContainer, 1000); // Reduced delay
      }
    };

    findChatContainer();
  }

  processExistingMessages() {
    if (!chatRootElement) return;

    const existingMessages = chatRootElement.querySelectorAll("yt-live-chat-text-message-renderer");
    const recentMessages = Array.from(existingMessages);
    recentMessages.forEach((msg) => this.processChatMessage(msg));
  }

  processChatMessage(messageElement) {
    try {
      // Extract message data
      const authorElement = messageElement.querySelector("#author-name");
      const messageContentElement = messageElement.querySelector("#message");

      if (!authorElement || !messageContentElement) return;

      const author = authorElement.textContent.trim();
      const messageHtml = messageContentElement.innerHTML;

      // Create a temporary div to process the message
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = messageHtml;

      // Process our emotes while preserving YouTube emojis
      const processedHtml = this.processEmotes(tempDiv);

      // Add message to overlay
      this.addMessageToOverlay(author, processedHtml);

      // Lookup BeeHappy user details in background (non-blocking)
      // this.lookupAndLogUser(author);
    } catch (error) {
      console.error("🐝 Error processing chat message:", error);
    }
  }

  processEmotes(container) {
    // Create a wrapper span to ensure inline flow
    const wrapper = document.createElement("span");
    wrapper.style.whiteSpace = "pre-wrap";

    const replaceTextWithNodes = (text) => {
      if (!text) return document.createTextNode("");
      const frag = document.createDocumentFragment();
      if (!this.emoteRegex) {
        console.warn("🐝 Emote regex not ready, skipping emote processing");
        frag.appendChild(document.createTextNode(text));
        return frag;
      }
      this.emoteRegex.lastIndex = 0;
      let m;
      let last = 0; // The previous regex match end position
      while ((m = this.emoteRegex.exec(text)) !== null) {
        const start = m.index; // Matching start position
        const end = start + m[0].length; // Matching end position
        // This happens when the current word is matched, and there is word(s) between this and the next match
        // Ex: "[bh:1] and [bh:2]" => match [bh:1], then " and " is between [bh:1] and [bh:2]
        // Therefore, we need to preserve the " and " characters by slice it and then add it back
        if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
        const token = m[0];
        const url = this.emoteImageMap[token] || "";
        if (url) {
          const img = document.createElement("img");
          img.className = "bh-emote";
          img.setAttribute("alt", token);
          img.setAttribute("src", url);
          img.setAttribute("loading", "lazy");
          img.style.width = "24px";
          img.style.height = "24px";
          img.style.verticalAlign = "middle";
          frag.appendChild(img);
        } else {
          // fallback to text map (emoji) if available
          const mapped = this.emoteMap[token];
          frag.appendChild(document.createTextNode(mapped || token));
        }
        last = end;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      return frag;
    };

    // Process each node
    Array.from(container.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        wrapper.appendChild(replaceTextWithNodes(node.textContent));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === "IMG" && (node.classList.contains("emoji") || node.classList.contains("bh-emoji"))) {
          const clone = node.cloneNode(true);
          clone.classList.add("yt-emoji-converted");
          if (clone.src) clone.setAttribute("src", clone.src);
          // Make sure the emoji image is appropriately sized
          clone.style.width = "24px";
          clone.style.height = "24px";
          clone.style.verticalAlign = "middle";
          wrapper.appendChild(clone);
        } else {
          const emojiImg = node.querySelector("img.emoji");
          if (emojiImg) {
            const clone = emojiImg.cloneNode(true);
            clone.classList.add("bh-emote");
            clone.style.width = "24px";
            clone.style.height = "24px";
            clone.style.verticalAlign = "middle";
            if (clone.src) clone.setAttribute("src", clone.src);
            wrapper.appendChild(clone);
          } else {
            wrapper.appendChild(replaceTextWithNodes(node.textContent));
          }
        }
      }
    });

    const result = wrapper.innerHTML
    return result;
  }

  addMessageToOverlay(author, processedHtml) {
    if (!this.chatContainer) return;

    // Remove "no messages" placeholder
    const noMessages = this.chatContainer.querySelector(".no-messages");
    if (noMessages) {
      noMessages.remove();
    }

    // Create message element with default styling
    const messageDiv = document.createElement("div");
    messageDiv.className = "chat-message";
    messageDiv.innerHTML = `
      <span class="message-author">${this.escapeHtml(author)}</span>
      <span class="message-content">${processedHtml}</span>
    `;

    // If the message author is the current streamer, add a special class so CSS
    // can display a crown or other highlight. Use available helper if present.
    try {
      const getStreamer = window.BeeHappyUsers?.getStreamerMeta;
      if (typeof getStreamer === "function") {
        const streamerName = getStreamer().name;
        if (streamerName) {
          const norm = (s) => (s || "").toString().trim().toLowerCase();
          if (norm(streamerName) === norm(author)) {
            // add classes for styling (author span + message wrapper)
            const authorSpan = messageDiv.querySelector(".message-author");
            if (authorSpan) authorSpan.classList.add("message-author--streamer");
            messageDiv.classList.add("chat-message--streamer");
            // also mark attribute for possible JS hooks
            messageDiv.setAttribute("data-streamer", "1");
          }
        }
      }
    } catch (e) {
      // ignore streamer detection failures
    }
    messageDiv.style.color = "#ffffff";

    // Add to chat container immediately
    this.chatContainer.appendChild(messageDiv);
    this.messageCount++;

    // Limit messages to prevent memory issues
    if (this.messageCount > this.maxMessages) {
      const firstMessage = this.chatContainer.querySelector(".chat-message");
      if (firstMessage) {
        firstMessage.remove();
        this.messageCount--;
      }
    }

    // Auto-scroll to bottom after rendering
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;

    // Enhance styling with user data once available
    // TODO: Handle gradient features
    const getUserFn = window.BeeHappyUsers?.getUser;
    if (typeof getUserFn === "function") {
      Promise.resolve()
        .then(() => getUserFn(author))
        .then((user) => {
          // console.log("🐝 [Overlay][Users] Fetched user data for", author, user);
          if (!user) return;
          const paints = Array.isArray(user.paints) ? user.paints : [];
          const firstPaint = paints[0];
          const color = typeof firstPaint === "string" ? firstPaint : firstPaint?.color;
          // console.log("[Overlay][Users] Applying color", color, "for user", author);
          if (color) {
            messageDiv.style.color = color;
          }
        })
        .catch((error) => {
          // console.warn("🐝 [Overlay][Users] Failed to style message for", author, error);
        });
    }
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  updateStatus(message) {
    const statusText = this.overlay?.querySelector("#statusText");
    if (statusText) {
      statusText.textContent = message;
    }
  }

  show() {
    if (this.overlay) {
      const chatFrame = document.querySelector("#chatframe");
      if (chatFrame) {
        const rect = chatFrame.getBoundingClientRect();
        // Position overlay at the top-left of the chat iframe, with some offset
        // this.overlay.style.position = "fixed";
        // If user previously resized/positioned, loadPosition() already applied sizes. Only set defaults when missing.
        if (!this.overlay.style.left || this.overlay.style.left === "") this.overlay.style.left = rect.left + "px";
        if (!this.overlay.style.top || this.overlay.style.top === "") this.overlay.style.top = rect.top + "px";
        this.overlay.style.right = "auto";
        this.overlay.style.bottom = "auto";
        // Default height/width from chatframe if user hasn't set them
        if (!this.overlay.style.height || this.overlay.style.height === "") {
          defaultOverlayHeight = rect.height - 55 + "px";
          this.overlay.style.height = defaultOverlayHeight; // 55 is the height of the chat input
        }
        if (!this.overlay.style.width || this.overlay.style.width === "") {
          this.overlay.style.width = rect.width + "px"; // Match chat iframe width
        }
      } else {
        // Fallback to default position
        // this.overlay.style.position = "fixed";
        this.overlay.style.top = "100px";
        this.overlay.style.right = "20px";
        this.overlay.style.left = "auto";
        this.overlay.style.bottom = "auto";
        // this.overlay.style.height = "500px";
      }
      this.overlay.style.display = "flex";
      // Auto-scroll chat container to bottom after rendering
      if (this.chatContainer) {
        setTimeout(() => {
          this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
          // Ensure chat container sizing reflects overlay size
          this._applyChatSizing();
        }, 0);
      }
    }
  }

  // Ensure chat container height/width follow overlay size so it becomes responsive
  _applyChatSizing() {
    if (!this.overlay || !this.chatContainer) return;
    // Use clientHeight/clientWidth to operate on inner sizes (excludes borders)
    const overlayRect = this.overlay.getBoundingClientRect();
    const overlayInnerH = this.overlay.clientHeight || Math.round(overlayRect.height);
    // Try to compute header height dynamically for better accuracy
    let headerHeight = 56; // fallback
    try {
      const headerEl = this.overlay.querySelector("#overlayHeader") || this.overlay.querySelector(".overlay-header");
      if (headerEl) headerHeight = Math.round(headerEl.getBoundingClientRect().height);
    } catch (e) {
      /* ignore and use fallback */
    }
    const bottomPadding = 12;
    const contentH = Math.max(80, overlayInnerH - headerHeight - bottomPadding);
    this.chatContainer.style.boxSizing = "border-box";
    this.chatContainer.style.height = contentH + "px";
    this.chatContainer.style.overflowY = "auto";
  }

  // axis: 'x' | 'y' | 'both'
  startResize(ev, axis = "both") {
    if (!this.overlay) return;
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
  }

  _onResizeMouseMove(ev) {
    if (!this.isResizing) return;
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

    this._applyChatSizing();
  }

  _onResizeMouseUp() {
    if (!this.isResizing) return;
    this.isResizing = false;
    document.removeEventListener("mousemove", this._onResizeMouseMove);
    document.removeEventListener("mouseup", this._onResizeMouseUp);
    if (this.overlay) this.overlay.classList.remove("resizing");
    this.savePosition();
  }

  hide() {
    if (this.overlay) {
      this.overlay.style.display = "none";
    }
  }

  toggle() {
    if (this.overlay) {
      const isCurrentlyVisible = this.overlay.style.display === "flex";
      if (isCurrentlyVisible) {
        this.hide();
      } else {
        this.show();
        // After showing, ensure overlay is positioned on screen
        const rect = this.overlay.getBoundingClientRect();
        if (rect.right > window.innerWidth || rect.left < 0 || rect.top < 0 || rect.bottom > window.innerHeight) {
          this.overlay.style.top = "100px";
          this.overlay.style.right = "20px";
          this.overlay.style.left = "auto";
          this.overlay.style.bottom = "auto";
        }
      }
    }
  }

  // lookupAndLogUser(author) {
  //   if (!author) return;
  //   const trimmed = author.trim();
  //   if (!trimmed) return;
  //   const key = trimmed.toLowerCase();
  //   if (this.loggedUsers.has(key)) {
  //     return;
  //   }
  //   if (!window.BeeHappyUsers || typeof window.BeeHappyUsers.updateUserList !== "function") {
  //     return;
  //   }

  //   this.loggedUsers.add(key);

  //   window.BeeHappyUsers.updateUserList(trimmed)
  //     .then((user) => {
  //       if (user) {
  //         console.log("🐝 [Overlay][Users] Fetched user info:", trimmed, user);
  //       } else {
  //         this.loggedUsers.delete(key);
  //       }
  //     })
  //     .catch((error) => {
  //       this.loggedUsers.delete(key);
  //       console.warn("🐝 [Overlay][Users] Failed to fetch user info for", trimmed, error);
  //     })
  //     .finally(() => {
  //       // Log the final array of users
  //       var snapshot = window.BeeHappyUsers.cache;
  //       for (const [normalizedName, user] of snapshot) {
  //         console.log("Cached user: ", normalizedName, user);
  //       }
  //     });
  // }
}

// Export for use in content script
window.BeeHappyOverlayChat = BeeHappyOverlayChat;
