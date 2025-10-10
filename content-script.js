// BeeHappy YouTube Chat Emote Replacer
class BeeHappyEmoteReplacer {
  constructor() {
    this.emoteMap = window.BeeHappyEmotes?.getMap() || {};
    this.observer = null;
    this.isProcessing = false;
    this.listenerRegistered = false; // Add this flag

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
  }

  handleEmoteUpdate(map, regex, lists) {
    // Move listener logic to named method for better debugging
    console.log("[ContentScript] (onupdate) New state:", {
      mapSize: Object.keys(map).length,
      hasRegex: !!regex,
      globalCount: (lists.global || []).length,
      streamerCount: (lists.streamer || []).length
    });
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
        console.log("[ContentScript] (onupdate) No lists provided, rebuilding image map from API");
        this.updateEmoteImageMap();
      }

      // Re-scan messages on map update to apply new emotes
      this.processMessages({ verbose: true });

      console.log("[ContentScript] (onupdate) Successfully processed emote update");
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

    if (this.isProcessing) return;
    this.isProcessing = true;

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
        messages = document.querySelectorAll(selector);
        if (messages.length > 0) break;
      }

      if (messages.length === 0) return;

      if (verbose) {
        console.log("[ContentScript] Processing emotes in", messages.length, "messages");
        console.log("[ContentScript] Current emote map size:", Object.keys(this.emoteMap).length);
        console.log("[ContentScript] Current emote image map size:", Object.keys(this.emoteImageMap).length);
        console.log("[ContentScript] Current token regex:", this.tokenRegex);
      }

      // DOM-safe replace: transform text nodes into spans without touching structure
      messages.forEach((msg) => this.transformMessage(msg));
    } catch (error) {
      console.error("🐝 BeeHappy: Error processing emotes:", error);
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

    const walker = document.createTreeWalker(msg, NodeFilter.SHOW_TEXT, null);
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
      const frag = document.createDocumentFragment();
      let last = 0;
      this.tokenRegex.lastIndex = 0;
      let m;
      while ((m = this.tokenRegex.exec(original)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (start > last) frag.appendChild(document.createTextNode(original.slice(last, start)));

        const token = m[0];
        const url = this.emoteImageMap[token] || "";

        if (url && url !== "") {
          // Create image element like overlay chat does
          const img = document.createElement("img");
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
          const span = document.createElement("span");
          span.className = window.BeeHappyConstants?.UI_CONFIG?.EMOTE_CLASS || "bh-emote";
          span.textContent = this.emoteMap[token] || token;
          frag.appendChild(span);
        }
        last = end;
      }
      if (last < original.length) frag.appendChild(document.createTextNode(original.slice(last)));
      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  startObserver() {
    const chatContainer =
      document.querySelector("yt-live-chat-renderer") ||
      document.querySelector("#chatframe") ||
      document.querySelector("#chat");

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
    setInterval(() => this.processMessages(), 1000);
  }

  async init() {
    console.log("[ContentScript] Starting emote replacer initialization...");

    // Wait for emote map to be ready (this should already be done by parent, but double-check)
    await (window.BeeHappyEmotes?.init?.() || Promise.resolve());

    // Get current state
    this.emoteMap = window.BeeHappyEmotes?.getMap() || this.emoteMap;
    this.tokenRegex = window.BeeHappyEmotes?.getRegex() || this.tokenRegex;

    // Update image map after initialization
    this.updateEmoteImageMap();

    console.log("[ContentScript] Starting chat observer...");
    this.startObserver();

    console.log("[ContentScript] Emote replacer initialization complete");
  }
}

// Global overlay chat instance
let overlayChat = null;
// Global replacer instance - prevent multiple initializations
let emoteReplacer = null;
let isContentScriptInitialized = false;

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
          console.log("[ContentScript] Toggling existing overlay chat");
          await overlayChat.toggle();
          sendResponse({ success: true, message: "Overlay toggled" });
        } else {
          // Try to initialize if not already done
          if (window.location.href.includes("youtube.com/watch") || window.location.href.includes("youtube.com/live")) {
            try {
              console.log("[ContentScript] Initializing new overlay chat instance");
              overlayChat = new BeeHappyControls();
            } catch (error) {
              console.error("[ContentScript] Failed to initialize overlay chat:", error);
              sendResponse({ success: false, error: "Failed to initialize overlay: " + error.message });
            }
          } else {
            console.warn("[ContentScript] Not on YouTube page");
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
  console.log("🐝 Setting up auth message listener...");
  window.addEventListener("message", async (event) => {
    console.log("🐝 Auth message event:", event);
    // Only accept messages from BeeHappy's configured API origins (prod or dev)
    try {
      const prodBase = window.BeeHappyConstants?.API_CONFIG?.PRODUCTION_URL || "";
      const devBase = window.BeeHappyConstants?.API_CONFIG?.DEVELOPMENT_URL || "";
      const allowed = [prodBase, devBase].filter(Boolean);
      const ok = allowed.some((base) => event.origin && event.origin.includes(base));
      if (!ok) {
        console.warn("🐝 Ignoring message from unknown origin:", event.origin);
        return;
      }
    } catch (e) {
      console.warn("🐝 Origin check failed", e);
      return;
    }

    console.log("🐝 Received auth message:", event.data);
    if (event.data?.type === "BEEHAPPY_TOKEN") {
      // Get token from the storage and compare if it is the same
      const stored = await chrome.storage.local.get(["token"]);
      const token = event.data.token;
      if (stored.token === token) {
        console.log("[BeeHappy] Token already stored, ignoring.");
        return;
      }
      if (token) {
        await chrome.storage.local.set({ token });
        console.log("[BeeHappy] ✅ Token stored:", token);
      }
    }
  });
}

// Initialize the BeeHappy system
if (window.top !== window) {
  // We're in an iframe (in our case will be the youtube frame)- only initialize emote replacer
  console.log("[ContentScript] In iframe: only initializing emote replacer");

  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!emoteReplacer) {
        emoteReplacer = new BeeHappyEmoteReplacer();
        emoteReplacer.init();
      }
    });
  } else {
    if (!emoteReplacer) {
      emoteReplacer = new BeeHappyEmoteReplacer();
      emoteReplacer.init();
    }
  }
} else {
  // In main page: check if we should initialize overlay
  if (window.location.href.includes("youtube.com/watch") || window.location.href.includes("youtube.com/live")) {

    const initializeOverlay = async () => {
      // Prevent duplicate initialization
      if (isContentScriptInitialized) {
        console.log("[ContentScript] Already initialized, skipping");
        return;
      }

      try {
        // Wait for emote map to be ready first
        console.log("[ContentScript] Waiting for emote map to be ready...");
        var result = await window.BeeHappyEmotes?.init?.();

        // Verify map and regex are available
        // const map = window.BeeHappyEmotes?.getMap();
        // const regex = window.BeeHappyEmotes?.getRegex();
        // const streamer = window.BeeHappyEmotes?.getStreamerMeta();
        // const isStreamerFetched = streamer && streamer.apiStatus === "fetch_success";
        // console.log("[ContentScript] Emote map state:", {
        //   mapSize: map ? Object.keys(map).length : 0,
        //   hasRegex: !!regex,
        //   isStreamerFetched,
        //   streamerApiStatus: streamer?.apiStatus,
        // });

        if (!result) {
          console.warn("[ContentScript] Emote map or regex not ready, or streamer not fetched, retrying...");
          // Reset and allow retry
          setTimeout(() => {
            isContentScriptInitialized = false;
            initializeOverlay();
          }, 2000);
          return;
        }

        // console.log("[ContentScript] Emote map ready with", Object.keys(map).length, "emotes");

        // Initialize emote replacer only once
        // if (!emoteReplacer) {
        //   emoteReplacer = new BeeHappyEmoteReplacer();
        //   await emoteReplacer.init();
        //   console.log("[ContentScript] Emote replacer initialized");
        // }

        // Initialize overlay only once
        if (!overlayChat) {
          overlayChat = new BeeHappyControls();
          console.log("[ContentScript] Overlay chat initialized in main page");
        }

        isContentScriptInitialized = true;
      } catch (error) {
        console.error("[ContentScript] Failed to initialize:", error);
        // Reset state on failure to allow retry
        isContentScriptInitialized = false;
        emoteReplacer = null;
        overlayChat = null;
      }
    };
    // Wait for DOM to be ready before initializing
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        initializeOverlay();
      });
    } else {
      // DOM already ready
      initializeOverlay();
    }
    // Also try after a delay for YouTube's dynamic loading
    setTimeout(() => {
      if (!isContentScriptInitialized) initializeOverlay();
    }, 3000);
  } else if (
    window.location.href.includes(window.BeeHappyConstants?.API_CONFIG?.PRODUCTION_URL || "") ||
    window.location.href.includes(window.BeeHappyConstants?.API_CONFIG?.DEVELOPMENT_URL || "")
  ) {
    // We are in the auth bridge page, only init the listener
    authMessageListener();
  }
}
