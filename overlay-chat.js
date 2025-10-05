/* BeeHappy Overlay Chat System
   - If this script is injected into an iframe (chat iframe), it will act as a lightweight helper:
     it observes yt-live-chat message nodes and posts them to the parent window using postMessage.
   - If it's running in the top frame, it will create an overlay and listen for messages from iframe helpers.
*/
let chatRootElement = null;

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
    this.dragOffset = { x: 0, y: 0 };
    this.messageCount = 0;
    this.maxMessages = 50; // Limit messages to prevent memory issues

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
      let list = window.BeeHappyEmotes.getList ? window.BeeHappyEmotes.getList() : [];

      if (!list || !list.length) {
        console.warn("🐝 Warning: Emote list is empty, emotes may not display correctly.");
        console.log("🐝 [DEBUG][Overlay-chat][init]: Attempting to refresh from API...");
        // Try to refresh from API
        try {
          const refreshResult = await window.BeeHappyEmotes.refreshFromApi();
          if (refreshResult) {
            this.emoteMap = window.BeeHappyEmotes.getMap();
            this.emoteRegex = window.BeeHappyEmotes.getRegex();
            list = window.BeeHappyEmotes.getList(); // ← Update the list variable with fresh data
            console.log("🐝 [DEBUG][Overlay-chat][init]: Updated emote list after API:", list);
          }
        } catch (err) {
          console.error("🐝 [DEBUG][Overlay-chat][init]: API refresh failed:", err);
        }
      }

      // Emote image map object:
      // {
      //   "[bh:poggers]": "https://api.com/poggers.png",
      //   "[bh:fire]": "https://api.com/fire.gif",
      //   "[bh:kappa]": "https://api.com/kappa.jpg"
      // }
      this.emoteImageMap = Array.isArray(list)
        ? list.reduce((acc, item) => {
            if (item && item.token) acc[item.token] = item.url || "";
            return acc;
          }, {})
        : {};

      // Subscribe to future updates
      window.BeeHappyEmotes.onUpdate((map, regex, updatedList) => {
        this.emoteMap = map || {};
        this.emoteRegex = regex || null;
        if (Array.isArray(updatedList)) {
          this.emoteImageMap = updatedList.reduce((acc, item) => {
            if (item && item.token) acc[item.token] = item.url || "";
            return acc;
          }, {});
        }
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
        console.log("🐝 CSS styles injected");
      }

      // Initialize emote picker after overlay is ready
      const initEmotePicker = () => {
        // Wait for overlay elements to be ready
        const emotePicker = document.getElementById("emotePicker");
        const emoteSearch = document.getElementById("emoteSearchInput");
        const emoteGridYt = document.getElementById("emoteGridYoutube");
        const emoteGridBh = document.getElementById("emoteGridBeeHappy");
        const pickerTabs = document.querySelectorAll(".picker-tab");

        if (!emotePicker || !emoteSearch || !(emoteGridYt && emoteGridBh) || !pickerTabs.length) {
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

      console.log("🐝 Overlay created successfully");
      console.log("🐝 Overlay element:", this.overlay);
      console.log("🐝 Overlay parent:", this.overlay.parentElement);
      console.log("🐝 Overlay in DOM:", document.contains(this.overlay));

      // Load saved position
      this.loadPosition();

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
    // const testBtn = this.overlay.querySelector("#testBtn");
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

    // Emote selection events no longer add messages to overlay.
    // Intentionally left blank to avoid duplicate UI writes.

    // Control buttons
    minimizeBtn.addEventListener("click", () => this.toggleMinimize());
    // if (testBtn) {
    //   testBtn.addEventListener("click", () => {
    //     console.log("🐝 Overlay force test triggered");
    //     // this.addTestMessage();
    //   });
    // }
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

    const minimizeBtn = this.overlay.querySelector("#minimizeBtn");
    minimizeBtn.textContent = this.isMinimized ? "+" : "−";
    minimizeBtn.title = this.isMinimized ? "Restore" : "Minimize";
  }

  closeOverlay() {
    if (this.overlay) {
      this.overlay.style.display = "none";
      console.log("🐝 Overlay hidden");
    }
  }

  savePosition() {
    if (!this.overlay) return;

    const rect = this.overlay.getBoundingClientRect();
    const position = {
      left: rect.left,
      top: rect.top,
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
        if (node.tagName === "IMG" && (node.classList.contains("emoji") || node.classList.contains("yt-emoji"))) {
          const clone = node.cloneNode(true);
          clone.classList.add("yt-emoji");
          if (clone.src) clone.setAttribute("src", clone.src);
          // Make sure the emoji image is appropriately sized
          clone.style.width = "24px";
          clone.style.height = "24px";
          wrapper.appendChild(clone);
        } else {
          const emojiImg = node.querySelector("img.emoji");
          if (emojiImg) {
            const clone = emojiImg.cloneNode(true);
            clone.classList.add("bh-emote");
            clone.style.width = "24px";
            clone.style.height = "24px";
            if (clone.src) clone.setAttribute("src", clone.src);
            wrapper.appendChild(clone);
          } else {
            wrapper.appendChild(replaceTextWithNodes(node.textContent));
          }
        }
      }
    });

    // Debug: Log what we're returning
    const result = wrapper.innerHTML;
    // if (result.includes("<img")) {
    //   console.log("🐝 DEBUG: Images found in processed HTML:", result);
    // }
    // if (result.includes("[bh:")) {
    //   console.log("🐝 DEBUG: Unprocessed tokens found:", result);
    // }

    return result;
  }

  addMessageToOverlay(author, processedHtml) {
    if (!this.chatContainer) return;

    // Remove "no messages" placeholder
    const noMessages = this.chatContainer.querySelector(".no-messages");
    if (noMessages) {
      noMessages.remove();
    }

    // Create message element
    // TODO: Premium features here
    const messageDiv = document.createElement("div");
    messageDiv.className = "chat-message";
    messageDiv.innerHTML = `
            <div class="message-author">${this.escapeHtml(author)}</div>
            <div class="message-content">${processedHtml}</div>
        `;

    // Add to chat container
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

    // Auto-scroll to bottom
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
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
        this.overlay.style.position = "fixed";
        this.overlay.style.left = rect.left + "px";
        this.overlay.style.top = rect.top + "px";
        this.overlay.style.right = "auto";
        this.overlay.style.bottom = "auto";
        this.overlay.style.height = rect.height - 55 + "px"; // 55 is the height of the chat input lol
      } else {
        // Fallback to default position
        this.overlay.style.position = "fixed";
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
        }, 0);
      }
    }
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
          this.overlay.style.position = "fixed";
          this.overlay.style.top = "100px";
          this.overlay.style.right = "20px";
          this.overlay.style.left = "auto";
          this.overlay.style.bottom = "auto";
        }
      }
    }
  }
}

// Export for use in content script
window.BeeHappyOverlayChat = BeeHappyOverlayChat;
