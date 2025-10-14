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
  }

  async init() {
    // Wait for emote map to be ready (this should already be done by parent, but double-check)
    await (window.BeeHappyEmotes?.init?.() || Promise.resolve());

    // Get current state
    this.emoteMap = window.BeeHappyEmotes?.getMap() || this.emoteMap;
    this.tokenRegex = window.BeeHappyEmotes?.getRegex() || this.tokenRegex;

    // Update image map after initialization
    this.updateEmoteImageMap();

    await this.startObserver();
  }
}

// Global overlay chat instance
let overlayChat = null;
// Global replacer instance - prevent multiple initializations
let emoteReplacer = null;
let isContentScriptInitialized = false;

// Track current page state
let currentPageState = {
  isYouTubePage: false,
  lastUrl: window.location.href
};

// Check if current page is a YouTube watch/live page
function isYouTubeWatchPage(url = window.location.href) {
  return url.includes("youtube.com/watch") || url.includes("youtube.com/live");
}

// Cleanup function to destroy all extension components
function cleanupExtension() {
  if (emoteReplacer) {
    emoteReplacer.destroy();
    emoteReplacer = null;
  }

  if (overlayChat) {
    overlayChat.destroy();
    overlayChat = null;
  }

  // Reset initialization state
  isContentScriptInitialized = false;
  currentPageState.isYouTubePage = false;
}

// Monitor page navigation for YouTube's SPA routing
function setupNavigationMonitoring() {
  // Listen for URL changes (YouTube uses pushState for navigation)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  function handleUrlChange() {
    const newUrl = window.location.href;
    const wasYouTubePage = currentPageState.isYouTubePage;
    const isNowYouTubePage = isYouTubeWatchPage(newUrl);

    if (wasYouTubePage && !isNowYouTubePage) {
      console.log("[ContentScript] Left YouTube watch page, cleaning up");
      cleanupExtension();
    } else if (!wasYouTubePage && isNowYouTubePage) {
      console.log("[ContentScript] Navigated to YouTube watch page, initializing");
      setTimeout(() => {
        if (!isContentScriptInitialized) {
          initializeOverlay();
        }
      }, 1000); // Give YouTube time to load content
    } else if (isNowYouTubePage && !isContentScriptInitialized) {
      // Handle case where we're already on a YouTube page but not initialized
      // This covers navigation within YouTube (homepage -> watch page)
      console.log("[ContentScript] YouTube watch page detected, initializing");
      setTimeout(() => {
        if (!isContentScriptInitialized) {
          initializeOverlay();
        }
      }, 1000);
    }

    currentPageState.isYouTubePage = isNowYouTubePage;
    currentPageState.lastUrl = newUrl;
  }

  // Override history methods to detect pushState navigation
  history.pushState = function (...args) {
    originalPushState.apply(history, args);
    setTimeout(handleUrlChange, 100);
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(history, args);
    setTimeout(handleUrlChange, 100);
  };

  // Also listen for popstate (back/forward navigation)
  window.addEventListener('popstate', () => {
    setTimeout(handleUrlChange, 100);
  });

  // Listen for YouTube's DOM changes that indicate navigation
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Check if the URL changed (YouTube updates without triggering standard events)
      if (window.location.href !== currentPageState.lastUrl) {
        setTimeout(handleUrlChange, 200);
      }
    });
  });

  // Observe the document for changes
  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-page-type'] // YouTube sets this attribute
  });

  // Initial state
  currentPageState.isYouTubePage = isYouTubeWatchPage();
}

// Message handling for communication with popup and background
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  // Skip message handling in iframes
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

// Initialize overlay and emote replacer on YouTube pages
const initializeOverlay = async () => {
  // Prevent duplicate initialization
  if (isContentScriptInitialized) {
    return;
  }

  try {
    // Wait for the emote map to be ready
    const emoteMapReady = await window.BeeHappyEmotes?.init();

    if (!emoteMapReady) {
      console.log("[ContentScript] Emote map not ready, retrying...");
      setTimeout(() => {
        if (!isContentScriptInitialized) {
          initializeOverlay();
        }
      }, 2000);
      return;
    }

    // Check if we have the necessary data
    const emoteMap = window.BeeHappyEmotes?.getMap();
    const emoteRegex = window.BeeHappyEmotes?.getRegex();
    const streamerMeta = window.BeeHappyEmotes?.getStreamerMeta();
    const streamerApiStatus = streamerMeta?.apiStatus;

    // Init the emote replacer on the document like every other normal scripts
    if (!emoteReplacer) {
      emoteReplacer = new BeeHappyEmoteReplacer();
      emoteReplacer.init();
    }

    if (!emoteMap || !emoteRegex || streamerApiStatus !== "fetched") {
      console.log("[ContentScript] Waiting for required data:", {
        emoteMap: !!emoteMap,
        emoteRegex: !!emoteRegex,
        streamerApiStatus
      });
      setTimeout(() => {
        if (!isContentScriptInitialized) {
          initializeOverlay();
        }
      }, 2000);
      return;
    }

    console.log("[ContentScript] Extension initialized successfully");
    isContentScriptInitialized = true;

    // Initialize emote replacer
    if (!emoteReplacer) {
      emoteReplacer = new BeeHappyEmoteReplacer();
      await emoteReplacer.init();
    }

    // Initialize overlay controls
    if (!overlayChat) {
      if (window.BeeHappyControls) {
        overlayChat = new window.BeeHappyControls();
      } else {
        console.warn("[ContentScript] BeeHappyControls not available");
      }
    }
  } catch (error) {
    console.error("[ContentScript] Initialization error:", error);
    isContentScriptInitialized = false;
    // Retry initialization after error
    setTimeout(() => {
      if (!isContentScriptInitialized) {
        initializeOverlay();
      }
    }, 3000);
  }
};

// Initialize the BeeHappy system
console.log("[ContentScript] BeeHappy extension loaded");

if (window.top !== window) {
  // We're in an iframe (chat frame) - emote replacer will be initialized automatically
} else {
  // In main page: setup navigation monitoring and initialize if on YouTube
  setupNavigationMonitoring();

  if (isYouTubeWatchPage()) {
    console.log("[ContentScript] YouTube watch page detected");

    const initialize = () => {
      if (!isContentScriptInitialized) {
        initializeOverlay();
      }
    };

    // Wait for DOM to be ready before initializing
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initialize);
    } else {
      // DOM already ready
      initialize();
    }

    // Fallback initialization after delay
    setTimeout(() => {
      if (!isContentScriptInitialized) {
        initialize();
      }
    }, 3000);

    // Additional monitoring for YouTube SPA navigation
    const checkYouTubePageInterval = setInterval(() => {
      if (isYouTubeWatchPage() && !isContentScriptInitialized) {
        initialize();
        clearInterval(checkYouTubePageInterval); // Stop checking once initialized
      } else if (!isYouTubeWatchPage() && isContentScriptInitialized) {
        clearInterval(checkYouTubePageInterval);
      }
    }, 2000); // Check every 2 seconds

    // Clear interval after 30 seconds to avoid infinite checking
    setTimeout(() => {
      clearInterval(checkYouTubePageInterval);
    }, 30000);
  } else if (
    window.location.href.includes(window.BeeHappyConstants?.API_CONFIG?.PRODUCTION_URL || "") ||
    window.location.href.includes(window.BeeHappyConstants?.API_CONFIG?.DEVELOPMENT_URL || "")
  ) {
    // We are in the auth bridge page, only init the listener
    authMessageListener();
  }
}
