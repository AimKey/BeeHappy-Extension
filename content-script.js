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

    // Init the fricking chatframe mf
    this.chatFrame = document.querySelector("#chatframe");
    this.chatDoc = this.chatFrame?.contentDocument || this.chatFrame?.contentWindow?.document;
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
      this.processMessages({ verbose: true });
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

  processMessages(options = {}) {
    const { verbose = false } = options;

    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    // Ensure we have the latest emote map and regex
    this.emoteMap = window.BeeHappyEmotes?.getMap() || this.emoteMap;
    this.tokenRegex = window.BeeHappyEmotes?.getRegex() || this.tokenRegex;

    try {
      // Try multiple selectors for YouTube chat messages
      const selectors = window.BeeHappyConstants?.YOUTUBE_SELECTORS?.CHAT_MESSAGES || [
        "yt-live-chat-text-message-renderer #message",
        "yt-live-chat-text-message-renderer .message",
        'yt-live-chat-text-message-renderer span[id="message"]',
        ".yt-live-chat-text-message-renderer #message",
      ];

      let messages = [];
      for (const selector of selectors) {
        messages = this.chatDoc.querySelectorAll(selector);
        if (messages.length > 0) break;
      }

      if (messages.length === 0) return;

      // DOM-safe replace: transform text nodes into spans without touching structure
      messages.forEach((msg) => this.transformMessage(msg));
    } catch (error) {
      // Error processing emotes
    } finally {
      this.isProcessing = false;
    }
  }

  // This one transform the message in youtube chat
  transformMessage(msg) {
    // If we already added our spans here, skip until YouTube re-renders
    const emoteClass = window.BeeHappyConstants?.UI_CONFIG?.EMOTE_CLASS || "bh-emote";
    if (msg.querySelector(`.${emoteClass}`)) return;
    if (!this.tokenRegex) return;

    const walker = this.chatDoc.createTreeWalker(msg, NodeFilter.SHOW_TEXT, null);
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
      const frag = this.chatDoc.createDocumentFragment();
      let last = 0;
      this.tokenRegex.lastIndex = 0;
      let m;
      while ((m = this.tokenRegex.exec(original)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (start > last) frag.appendChild(this.chatDoc.createTextNode(original.slice(last, start)));

        const token = m[0];
        const url = this.emoteImageMap[token] || "";

        if (url && url !== "") {
          // Create image element like overlay chat does
          const img = this.chatDoc.createElement("img");
          img.className = emoteClass;
          img.setAttribute("alt", token);
          img.setAttribute("src", url);
          img.setAttribute("loading", "lazy");
          img.style.width = "36px";
          img.style.height = "auto";
          img.style.verticalAlign = "middle";
          frag.appendChild(img);
        } else {
          // Fallback to text replacement or original token
          const span = this.chatDoc.createElement("span");
          span.className = window.BeeHappyConstants?.UI_CONFIG?.EMOTE_CLASS || "bh-emote";
          span.textContent = this.emoteMap[token] || token;
          frag.appendChild(span);
        }
        last = end;
      }
      if (last < original.length) frag.appendChild(this.chatDoc.createTextNode(original.slice(last)));
      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  startObserver() {
    const chatContainer =
      this.chatDoc.querySelector("yt-live-chat-renderer") ||
      this.chatDoc.querySelector("#chatframe") ||
      this.chatDoc.querySelector("#chat");

    if (!chatContainer) {
      setTimeout(() => this.startObserver(), 2000);
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      // Skip if already processing to avoid race conditions
      if (this.isProcessing) return;

      let touched = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.tagName === "YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER") {
            const msg = node.querySelector("#message") || node.querySelector(".message");
            if (msg) {
              this.transformMessage(msg);
              touched = true;
            }
          } else {
            const inner =
              node.querySelector &&
              (node.querySelector("yt-live-chat-text-message-renderer #message") ||
                node.querySelector("yt-live-chat-text-message-renderer .message"));
            if (inner) {
              this.transformMessage(inner);
              touched = true;
            }
          }
        });
      });
    });

    this.observer.observe(chatContainer, {
      childList: true,
      subtree: true,
    });

    // Process existing messages once on startup
    this.processMessages({ verbose: true });
    // Repeatedly rescan to catch rehydrated messages
    this.intervalId = setInterval(() => this.processMessages({ verbose: true }), 1000);
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

    this.startObserver();
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
      cleanupExtension();
    } else if (!wasYouTubePage && isNowYouTubePage) {
      setTimeout(() => {
        if (!isContentScriptInitialized) {
          initializeOverlay();
        }
      }, 1000); // Give YouTube time to load content
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
      setTimeout(() => {
        if (!isContentScriptInitialized) {
          initializeOverlay();
        }
      }, 2000);
      return;
    }

    isContentScriptInitialized = true;

    // Initialize emote replacer
    if (!emoteReplacer) {
      emoteReplacer = new BeeHappyEmoteReplacer();
      await emoteReplacer.init();
    }

    // Initialize overlay controls
    if (!overlayChat) {
      overlayChat = new window.BeeHappyControls();
    }
  } catch (error) {
    console.error("[ContentScript] Error during initialization:", error);
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
if (window.top !== window) {
  // We're in an iframe (in our case will be the youtube frame)- only initialize emote replacer
} else {
  // In main page: setup navigation monitoring and initialize if on YouTube

  // Setup navigation monitoring first
  setupNavigationMonitoring();

  if (isYouTubeWatchPage()) {
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

    // Also try after a delay for YouTube's dynamic loading
    setTimeout(() => {
      if (!isContentScriptInitialized) {
        initialize();
      }
    }, 3000);
  } else if (
    window.location.href.includes(window.BeeHappyConstants?.API_CONFIG?.PRODUCTION_URL || "") ||
    window.location.href.includes(window.BeeHappyConstants?.API_CONFIG?.DEVELOPMENT_URL || "")
  ) {
    // We are in the auth bridge page, only init the listener
    authMessageListener();
  }
}
