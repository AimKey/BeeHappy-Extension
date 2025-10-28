// BeeHappy YouTube Chat Emote Replacer
class BeeHappyEmoteReplacer {
  constructor() {
    this.emoteMap = window.BeeHappyEmotes?.getMap() || {};
    this.observer = null;
    this.isProcessing = false;
    this.listenerRegistered = false; // Add this flag
    this.intervalId = null; // Track the rescan interval

    // Use the centralized regex from emote-map.js instead of building our own
    this.tokenRegex = window.BeeHappyEmotes?.getRegex() || null;

    // Build emote image map for displaying images instead of text
    this.emoteImageMap = {};
    this.updateEmoteImageMap();

    // Only register once
    if (!this.listenerRegistered) {
      window.BeeHappyEmotes?.onUpdate(this.handleEmoteUpdate.bind(this));
      this.listenerRegistered = true;
    }

    this.initialized = false;
    this.initPromise = null;

    // Chat document will be retrieved dynamically as needed
    console.log("[ContentScript] BeeHappyEmoteReplacer initialized");
  }

  /**
   * Retrieves the current chat document with a single attempt
   * @returns {Document|null} The chat document or null if not found
   */
  getChatDocSingle() {
    // Try multiple selectors for chat frame
    const chatFrameSelectors = [
      "#chatframe",
      "iframe#chatframe",
      'iframe[src*="live_chat"]',
      'iframe[src*="chat"]'
    ];

    let chatFrame = null;
    for (const selector of chatFrameSelectors) {
      chatFrame = document.querySelector(selector);
      if (chatFrame) {
        break;
      }
    }

    if (chatFrame) {
      const chatDoc = chatFrame.contentDocument || chatFrame.contentWindow?.document;
      if (chatDoc && chatDoc.readyState !== 'loading') {
        return chatDoc;
      }
    }

    return null;
  }

  /**
   * Asynchronously retrieves the chat document with proper retry delays
   * This is the main method that should be used for getting chat documents
   * @param {number} maxRetries - Maximum number of retry attempts
   * @param {number} retryDelay - Delay between retries in milliseconds
   * @returns {Promise<Document|null>} The chat document or null if not found
   */
  async getChatDoc(maxRetries = 12, retryDelay = 5000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const chatDoc = this.getChatDocSingle();
      if (chatDoc) {
        return chatDoc;
      }

      // If not the last attempt, wait before retrying to allow DOM to update
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    console.warn(`[ContentScript] Failed to get chat document after ${maxRetries} attempts`);
    return null;
  }

  handleEmoteUpdate(map, regex, lists) {
    try {
      // Update internal maps so our replacer can act on new emotes immediately
      this.emoteMap = map || this.emoteMap;
      this.tokenRegex = regex || this.tokenRegex;

      // Update image map when emotes are refreshed (if a list was provided)
      const nextGlobal = Array.isArray(lists.global) ? lists.global : [];
      const nextStreamer = Array.isArray(lists.streamer) ? lists.streamer : [];
      const allEntries = [...nextGlobal, ...nextStreamer];
      if (allEntries.length) {
        this.emoteImageMap = allEntries.reduce((acc, item) => {
          if (item && item.token) acc[item.token] = item.url || "";
          return acc;
        }, {});
      } else {
        // Fallback to reading from the exposed API lists
        this.updateEmoteImageMap();
      }

      // Re-scan messages on map update to apply new emotes
      this.processMessages({ verbose: true }).catch(error => {
        console.error("[ContentScript] Error in handleEmoteUpdate processMessages:", error);
      });
    } catch (error) {
      console.error("[ContentScript] (onupdate) Error processing emote update:", error);
      throw error; // Re-throw so it's caught by the emote map error handler
    }
  }

  updateEmoteImageMap() {
    const lists = window.BeeHappyEmotes?.getLists ? window.BeeHappyEmotes.getLists() : {};
    const globalList = Array.isArray(lists.global) ? lists.global : [];
    const streamerList = Array.isArray(lists.streamer) ? lists.streamer : [];
    const entries = [...globalList, ...streamerList];
    this.emoteImageMap = entries.reduce((acc, item) => {
      if (item && item.token) acc[item.token] = item.url || "";
      return acc;
    }, {});
  }

  async processMessages(options = {}) {
    const { verbose = false } = options;

    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    // Ensure we have the latest emote map and regex
    this.emoteMap = window.BeeHappyEmotes?.getMap() || this.emoteMap;
    this.tokenRegex = window.BeeHappyEmotes?.getRegex() || this.tokenRegex;

    try {
      // Get the current chat document dynamically with retries for quick checks
      const chatDoc = await this.getChatDoc(5, 1000); // Moderate retries for frequent calls
      if (!chatDoc) {
        return;
      }

      // Try multiple selectors for YouTube chat messages
      const selectors = window.BeeHappyConstants?.YOUTUBE_SELECTORS?.CHAT_MESSAGES || [
        "yt-live-chat-text-message-renderer #message",
        "yt-live-chat-text-message-renderer .message",
        'yt-live-chat-text-message-renderer span[id="message"]',
        ".yt-live-chat-text-message-renderer #message",
      ];

      let messages = [];
      for (const selector of selectors) {
        messages = chatDoc.querySelectorAll(selector);
        if (messages.length > 0) {
          break;
        }
      }

      if (messages.length === 0) {
        return;
      }

      // DOM-safe replace: transform text nodes into spans without touching structure
      for (const msg of messages) {
        await this.transformMessage(msg, chatDoc);
      }
    } catch (error) {
      console.error("[ContentScript] Error processing messages:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  // This one transform the message in youtube chat
  async transformMessage(msg, chatDoc = null) {
    // Get chat document dynamically if not provided
    if (!chatDoc) {
      chatDoc = await this.getChatDoc(5, 1000); // Moderate retries for transform calls
      if (!chatDoc) {
        return;
      }
    }

    // If we already added our spans here, skip until YouTube re-renders
    const emoteClass = window.BeeHappyConstants?.UI_CONFIG?.EMOTE_CLASS || "bh-emote";
    if (msg.querySelector(`.${emoteClass}`)) return;
    if (!this.tokenRegex) return;

    const walker = chatDoc.createTreeWalker(msg, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    let t;
    while ((t = walker.nextNode())) {
      const value = t.nodeValue;
      if (!value) continue;
      this.tokenRegex.lastIndex = 0;
      if (this.tokenRegex.test(value)) targets.push(t);
    }

    targets.forEach((textNode) => {
      const original = textNode.nodeValue || "";
      if (!original) return;
      const frag = chatDoc.createDocumentFragment();
      let last = 0;
      this.tokenRegex.lastIndex = 0;
      let m;
      while ((m = this.tokenRegex.exec(original)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (start > last) frag.appendChild(chatDoc.createTextNode(original.slice(last, start)));

        const token = m[0];
        const url = this.emoteImageMap[token] || "";

        if (url && url !== "") {
          // Create image element like overlay chat does
          const img = chatDoc.createElement("img");
          img.className = emoteClass;
          img.setAttribute("alt", token);
          img.setAttribute("src", url);
          img.setAttribute("loading", "lazy");
          img.style.width = "auto";
          img.style.maxWidth = "120px";
          img.style.objectFit = "cover";
          img.style.height = "36px";
          img.style.verticalAlign = "middle";
          frag.appendChild(img);
        } else {
          // Fallback to text replacement or original token
          const span = chatDoc.createElement("span");
          span.className = window.BeeHappyConstants?.UI_CONFIG?.EMOTE_CLASS || "bh-emote";
          span.textContent = this.emoteMap[token] || token;
          frag.appendChild(span);
        }
        last = end;
      }
      if (last < original.length) frag.appendChild(chatDoc.createTextNode(original.slice(last)));
      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  async startObserver() {
    if (this.observer) {
      return;
    }
    // Get chat document dynamically with retries - use full retry capability for initialization
    const chatDoc = await this.getChatDoc(); // Uses default: 12 retries, 5 seconds each = up to 60 seconds
    if (!chatDoc) {
      console.warn("[ContentScript] Chat document unavailable after retries, retrying observer setup");
      setTimeout(() => this.startObserver(), 2000);
      return;
    }

    const chatContainer =
      chatDoc.querySelector("yt-live-chat-renderer") ||
      chatDoc.querySelector("#chatframe") ||
      chatDoc.querySelector("#chat");

    if (!chatContainer) {
      console.warn("[ContentScript] Chat container not found, retrying observer setup");
      setTimeout(() => this.startObserver(), 2000);
      return;
    }

    this.observer = new MutationObserver(async (mutations) => {
      // Skip if already processing to avoid race conditions
      if (this.isProcessing) return;

      // Get fresh chat document for each mutation batch (single attempt for performance)
      const currentChatDoc = this.getChatDocSingle();
      if (!currentChatDoc) return;

      let touched = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === "YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER") {
            const msg = node.querySelector("#message") || node.querySelector(".message");
            if (msg) {
              await this.transformMessage(msg, currentChatDoc);
              touched = true;
            }
          } else {
            const inner =
              node.querySelector &&
              (node.querySelector("yt-live-chat-text-message-renderer #message") ||
                node.querySelector("yt-live-chat-text-message-renderer .message"));
            if (inner) {
              await this.transformMessage(inner, currentChatDoc);
              touched = true;
            }
          }
        }
      }
    });

    this.observer.observe(chatContainer, {
      childList: true,
      subtree: true,
    });

    console.log("[ContentScript] Chat observer started successfully");

    // Process existing messages once on startup
    await this.processMessages({ verbose: true });
    // Repeatedly rescan to catch rehydrated messages
    this.intervalId = setInterval(async () => {
      await this.processMessages({ verbose: false }); // Less verbose for interval calls
    }, 1000);
  }

  // Cleanup method to stop observer and intervals
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Reset processing state
    this.isProcessing = false;
    this.initialized = false;
    this.initPromise = null;
  }

  async init() {
    if (this.initialized) {
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // Wait for emote map to be ready (this should already be done by parent, but double-check)
        await (window.BeeHappyEmotes?.init?.() || Promise.resolve());

        // Get current state
        this.emoteMap = window.BeeHappyEmotes?.getMap() || this.emoteMap;
        this.tokenRegex = window.BeeHappyEmotes?.getRegex() || this.tokenRegex;

        // Update image map after initialization
        this.updateEmoteImageMap();

        await this.startObserver();
        this.initialized = true;
        return true;
      } catch (error) {
        this.initialized = false;
        throw error;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }
}

// Global overlay chat instance
let overlayChat = null;
// Global replacer instance - prevent multiple initializations
let emoteReplacer = null;
let isContentScriptInitialized = false;

const bootstrapState = {
  inFlight: false, // true = currently initializing; prevents duplicate init calls
  attempts: 0,
  maxAttempts: 20,
  retryDelay: 2000,
  timerId: null,
};

function cancelBootstrapRetry() {
  if (bootstrapState.timerId) {
    clearTimeout(bootstrapState.timerId);
    bootstrapState.timerId = null;
  }
}

function scheduleBootstrapRetry(reason = "unspecified") {
  if (isContentScriptInitialized) {
    return;
  }

  if (bootstrapState.attempts >= bootstrapState.maxAttempts) {
    console.warn("[ContentScript] Bootstrap retry limit reached", { reason, attempts: bootstrapState.attempts });
    return;
  }

  cancelBootstrapRetry();
  // The delay increases with each attempt (exponential backoff)
  const backoffFactor = Math.max(bootstrapState.attempts - 1, 0);
  const delayMs = Math.min(
    Math.round(bootstrapState.retryDelay * Math.pow(1.5, backoffFactor)),
    10000
  );
  console.log("[ContentScript] Scheduling bootstrap retry", {
    reason,
    attempt: bootstrapState.attempts,
    delayMs,
  });

  bootstrapState.timerId = setTimeout(() => {
    bootstrapState.timerId = null;
    initializeOverlayAndReplacer({ reason: `retry-${reason}` }).catch((error) => {
      console.error("[ContentScript] Bootstrap retry failed", error);
      scheduleBootstrapRetry("retry-error");
    });
  }, delayMs);
}

// Track current page state
let currentPageState = {
  isYouTubePage: false,
  lastUrl: window.location.href
};

// Check if current page is a YouTube watch/live page
function isYouTubeWatchPage(url = window.location.href) {
  return url.includes("youtube.com/watch") || url.includes("youtube.com/live");
}

// Initialize overlay and emote replacer on YouTube pages
async function initializeOverlayAndReplacer(options = {}) {
  const { reason = "manual" } = options;

  if (isContentScriptInitialized) {
    return true;
  }

  if (bootstrapState.inFlight) {
    console.log("[ContentScript] Bootstrap already in flight, skipping", { reason });
    return false;
  }

  bootstrapState.inFlight = true;
  bootstrapState.attempts += 1;

  console.log("[ContentScript] Bootstrap attempt", {
    attempt: bootstrapState.attempts,
    reason,
  });

  try {
    if (!window.BeeHappyEmotes || typeof window.BeeHappyEmotes.init !== "function") {
      console.warn("[ContentScript] BeeHappyEmotes API not ready yet");
      scheduleBootstrapRetry("emotes-api-missing");
      return false;
    }

    const emoteMapReady = await window.BeeHappyEmotes.init();
    if (!emoteMapReady) {
      console.log("[ContentScript] Emote map not ready, retrying");
      scheduleBootstrapRetry("emote-map-not-ready");
      return false;
    }

    const emoteMap = window.BeeHappyEmotes.getMap?.();
    const emoteRegex = window.BeeHappyEmotes.getRegex?.();
    const streamerMeta = window.BeeHappyEmotes.getStreamerMeta?.();
    const streamerApiStatus = streamerMeta?.apiStatus;

    if (!emoteMap || !emoteRegex || streamerApiStatus !== "fetched") {
      console.log("[ContentScript] Waiting for required data", {
        emoteMap: !!emoteMap,
        emoteRegex: !!emoteRegex,
        streamerApiStatus,
      });
      scheduleBootstrapRetry("emote-data-pending");
      return false;
    }

    if (!emoteReplacer) {
      emoteReplacer = new BeeHappyEmoteReplacer();
    }

    await emoteReplacer.init();

    if (!overlayChat) {
      if (window.BeeHappyControls) {
        overlayChat = new window.BeeHappyControls();
      } else {
        console.warn("[ContentScript] BeeHappyControls not available yet");
        scheduleBootstrapRetry("controls-missing");
        return false;
      }
    }

    isContentScriptInitialized = true;
    cancelBootstrapRetry();
    bootstrapState.attempts = 0;

    console.log("[ContentScript] Extension initialized successfully");

    try {
      document.dispatchEvent(
        new CustomEvent("BeeHappy:ExtensionReady", {
          detail: { timestamp: Date.now() },
        })
      );
    } catch (eventError) {
      console.warn("[ContentScript] Failed to dispatch BeeHappy:ExtensionReady", eventError);
    }

    return true;
  } catch (error) {
    console.error("[ContentScript] Initialization error", error);
    isContentScriptInitialized = false;
    scheduleBootstrapRetry("init-error");
    return false;
  } finally {
    bootstrapState.inFlight = false;
  }
}

if (window.top === window) {
  const getChatDocSingle = () => {
    // Try multiple selectors for chat frame
    const chatFrameSelectors = [
      "#chatframe",
      "iframe#chatframe",
      'iframe[src*="live_chat"]',
      'iframe[src*="chat"]'
    ];

    let chatFrame = null;
    for (const selector of chatFrameSelectors) {
      chatFrame = document.querySelector(selector);
      if (chatFrame) {
        break;
      }
    }

    if (chatFrame) {
      const chatDoc = chatFrame.contentDocument || chatFrame.contentWindow?.document;
      if (chatDoc && chatDoc.readyState !== 'loading') {
        return chatDoc;
      }
    }

    return null;
  }

  const getChatDoc = async (maxRetries = 3, retryDelay = 1000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const chatDoc = await getChatDocSingle();
      if (chatDoc) {
        return chatDoc;
      }

      // If not the last attempt, wait before retrying to allow DOM to update
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    console.warn(`[ContentScript] Failed to get chat document after ${maxRetries} attempts`);
    return null;
  };

  const InitContentScriptAsync = async () => {
    const chatDoc = await getChatDoc(10, 1000);
    const isOnLivePage = chatDoc !== null;

    console.log("[ContentScript] Detecting live page:", isOnLivePage);
    if (isOnLivePage) {
      console.log("[ContentScript] YouTube live page detected");

      // Wait for DOM to be ready before initializing
      if (document.readyState === "loading") {
        document.addEventListener(
          "DOMContentLoaded",
          () => {
            initializeOverlayAndReplacer({ reason: "dom-content-loaded" }).catch((error) => {
              console.error("[ContentScript] Bootstrap on DOMContentLoaded failed", error);
            });
          },
          { once: true }
        );
      } else {
        // DOM already ready
        await initializeOverlayAndReplacer({ reason: "initial-dom-ready" });
      }

      // Fallback initialization after delay
      if (!isContentScriptInitialized) {
        scheduleBootstrapRetry("initial-fallback");
      }
    } else if (window.location.href.includes(window.BeeHappyConstants?.API_CONFIG?.PRODUCTION_URL || "") ||
      window.location.href.includes(window.BeeHappyConstants?.API_CONFIG?.DEVELOPMENT_URL || "")) {
      // We are in the auth bridge page, only init the listener
      authMessageListener();
    } else {
      console.log("[ContentScript] Not a YouTube live page");
    }
  }

  // Start initialization immediately
  (async () => {
    console.log("[ContentScript] Starting initialization");
    await InitContentScriptAsync();
  })();

  // Listeners
  chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (window.top !== window) {
      sendResponse({ error: "Not available in iframe" });
      return true;
    }

    try {
      switch (request.action) {
        case "toggleOverlay":
          if (overlayChat) {
            await overlayChat.toggle();
            sendResponse({ success: true, message: "Overlay toggled" });
          } else {
            // Try to initialize if not already done
            if (window.location.href.includes("youtube.com/watch") || window.location.href.includes("youtube.com/live")) {
              try {
                overlayChat = new BeeHappyControls();
              } catch (error) {
                sendResponse({ success: false, error: "Failed to initialize overlay: " + error.message });
              }
            } else {
              sendResponse({ success: false, error: "Not on YouTube page" });
            }
          }
          break;
        // Handle extension when url changed
        case "url_changed": {
          console.log("[ContentScript] URL changed:", request.url);
          try {
            const chatDoc = await getChatDoc();
            const isOnLivePage = chatDoc !== null;
            if (isOnLivePage) {
              console.log("[ContentScript] Debug the BeeHappyControls and BeeHappyEmotes state:", {
                isContentScriptInitialized,
                BeeHappyControls: window.BeeHappyControls,
                BeeHappyEmotes: window.BeeHappyEmotes
              });
              const bootstrapResult = await initializeOverlayAndReplacer({ reason: "url-change" });
              if (!bootstrapResult) {
                scheduleBootstrapRetry("url-change-pending");
              }

              if (isContentScriptInitialized) {
                console.log("[ContentScript] Chat detected on URL change, ensuring overlay is visible and data fresh");
                window.ManualFuncs?.showOverlayManually();
                window.BeeHappyEmotes?.refreshFromApi();
              }

              sendResponse({ success: true, initialized: isContentScriptInitialized });
            } else {
              console.log("[ContentScript] No chat detected on URL change, turning off overlay");
              window.ManualFuncs?.hideOverlayManually();
              sendResponse({ success: true });
            }
          } catch (error) {
            console.error("[ContentScript] Error refreshing emote map (When URL changed):", error);
            sendResponse({ success: false, error: error.message });
          }
          break;
        }
        default:
          sendResponse({ error: "Unknown action" });
      }
    } catch (error) {
      sendResponse({ error: error.message });
    }

    return true; // Keep message channel open
  });

  // Listener for auth bridge messages
  function authMessageListener() {
    window.addEventListener("message", async (event) => {
      // Only accept messages from BeeHappy's configured API origins (prod or dev)
      try {
        const prodBase = window.BeeHappyConstants?.API_CONFIG?.PRODUCTION_URL || "";
        const devBase = window.BeeHappyConstants?.API_CONFIG?.DEVELOPMENT_URL || "";
        const allowed = [prodBase, devBase].filter(Boolean);
        const ok = allowed.some((base) => event.origin && event.origin.includes(base));
        if (!ok) {
          return;
        }
      } catch (e) {
        return;
      }

      if (event.data?.type === "BEEHAPPY_TOKEN") {
        // Get token from the storage and compare if it is the same
        const stored = await chrome.storage.local.get(["token"]);
        const token = event.data.token;
        if (stored.token === token) {
          return;
        }
        if (token) {
          await chrome.storage.local.set({ token });
        }
      }
    });
  }
}



