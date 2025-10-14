// This function only provide the emote map and regex, it does not init anything.
(function () {
  // const STORAGE_KEY = window.BeeHappyConstants?.STORAGE_KEYS?.EMOTE_MAP || "bh_emote_map_v1";
  const API_URL = (typeof window.BeeHappyConstants?.getApiUrl === "function"
    ? window.BeeHappyConstants.getApiUrl(window.BeeHappyConstants?.API_CONFIG?.EMOTES_ENDPOINT)
    : "https://localhost:7256/api/emotes");

  const state = {
    map: null, // token → replacement text
    regex: null, // combined token regex
    globalList: [],
    streamerList: [],
    meta: {
      streamer: null,
    },
    listeners: [],
  };

  const slugify = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unsupported_emote_name";

  const toAbsoluteUrl = (base, value) => {
    if (!value) return "";
    try {
      return new URL(value, base).toString();
    } catch (_) {
      return String(value || "");
    }
  };

  function buildRegex(map) {
    const escapeToken = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = Object.keys(map || {}).map(escapeToken);
    return parts.length ? new RegExp(parts.join("|"), "g") : null;
  }

  const sendRuntimeMessage = (payload) =>
    new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });

  let _inFlight = false;
  // Fetch from BE
  // Update map and regex
  // Returns true if successful, false if failed
  async function refreshFromApi() {
    // Ask background to fetch (handles CORS/timeouts)
    try {
      _inFlight = true;
      const resp = await sendRuntimeMessage({ action: "fetch_emotes", url: API_URL });
      console.log("🐝[DEBUG][Emote map] Refresh / Getting all emotes from backend:", resp);

      const next = Object.create(null);
      const globalList = [];
      const streamerList = [];
      const usedTokens = new Set(); // Track used tokens to avoid duplicates

      // Helper function to generate unique token
      const generateUniqueToken = (baseName, origin = 'unknown') => {
        const baseSlug = slugify(baseName);
        let token = `[${baseSlug}]`;
        let counter = 1;

        // If token is already used, add numeric suffix
        while (usedTokens.has(token)) {
          counter++;
          token = `[${baseSlug}${counter}]`;
        }

        // Log when we had to resolve a duplicate
        if (counter > 1) {
          console.log(`🐝[Emote map] Resolved duplicate emote name "${baseName}" (${origin}) to token: ${token}`);
        }

        usedTokens.add(token);
        return token;
      };

      // Global emotes
      if (resp?.success && Array.isArray(resp.data)) {
        const globalBase = new URL(API_URL, location.origin);
        resp.data.forEach((item) => {
          if (!item || typeof item.name !== "string") return;
          const token = generateUniqueToken(item.name, 'global');
          const files = Array.isArray(item.files) ? item.files : [];
          const file = files.length ? files[files.length - 1] : null;
          const url = file?.url ? toAbsoluteUrl(globalBase, file.url) : "";
          const byUser = item.byUser || "unknown";
          const entry = { token, name: item.name, url, byUser, origin: "global" };
          globalList.push(entry);
          next[token] = item.name;
        });
      } else {
        console.warn("🐝[Emote map] Failed to load global emotes", resp);
        if (Array.isArray(state.globalList) && state.globalList.length) {
          globalList.push(...state.globalList);
          state.globalList.forEach((item) => {
            if (item && item.token && !next[item.token] && !usedTokens.has(item.token)) {
              next[item.token] = item.name;
              usedTokens.add(item.token);
            }
          });
        }
      }

      const currentStreamer = window.BeeHappyUsers?.getCurrentStreamer?.();
      // console.log("🐝[DEBUG][Emote map] Current streamer: ", currentStreamer);
      let streamerMeta = null;  // Start with null for proper fallback detection

      if (currentStreamer) {
        const streamerUrl = (typeof window.BeeHappyConstants?.getApiUrl === "function"
          ? window.BeeHappyConstants.getApiUrl(`/api/emotes/sets/user/${encodeURIComponent(currentStreamer)}`)
          : `${API_URL}/sets/user/${encodeURIComponent(currentStreamer)}`);
        const streamerResp = await sendRuntimeMessage({
          action: window.BeeHappyConstants?.MESSAGE_ACTIONS?.FETCH_STREAMER_EMOTE_SET || "fetch_streamer_emote_set",
          streamerName: currentStreamer,
          url: streamerUrl,
        });
        // console.log("🐝[DEBUG][Emote map] Emote set for streamer", currentStreamer, ":", streamerResp);

        // Setup streamer meta and emotes
        if (streamerResp?.success) {
          const rawStreamerData = streamerResp.data;
          streamerMeta = {
            name: currentStreamer,
            setId: rawStreamerData?.id || null,
            ownerId: rawStreamerData?.ownerId || null,
            raw: rawStreamerData || null,
            apiStatus: "fetched",
          };

          const emotesFromStreamer = streamerResp.data.emotes || [];

          // Streamer specific emotes
          console.log("🐝[Emote map] Emotes from streamer", currentStreamer, ":", emotesFromStreamer);
          if (Array.isArray(emotesFromStreamer) && emotesFromStreamer.length) {
            const streamerBase = new URL(streamerUrl, location.origin);
            emotesFromStreamer.forEach((item) => {
              if (!item || typeof item.name !== "string") return;
              const token = generateUniqueToken(item.name, 'streamer');
              const files = Array.isArray(item.files) ? item.files : [];
              const file = files.length ? files[files.length - 1] : null;
              const url = file?.url ? toAbsoluteUrl(streamerBase, file.url) : "";
              const byUser = item.byUser || "unknown";

              const entry = { token, name: item.name, url, byUser, origin: "streamer" };
              streamerList.push(entry);
              next[token] = item.name;
            });
          }
        } else if (streamerResp && !streamerResp.success) {
          streamerMeta = {
            name: currentStreamer,
            apiStatus: "fetched",
          };
          console.warn("🐝[Emote map] Streamer emote fetch failed", streamerResp.error, ", streamer meta: ", streamerMeta);
        }

        // Fallback to previous valid meta if API fails (now works because streamerMeta can be null)
        if (!streamerMeta && state.meta.streamer && state.meta.streamer.name === currentStreamer) {
          console.log("🐝[Emote map] Using fallback streamer meta for", currentStreamer);
          streamerMeta = { ...state.meta.streamer };
        }

        if (
          streamerList.length === 0 &&
          Array.isArray(state.streamerList) &&
          state.streamerList.length &&
          state.meta.streamer &&
          state.meta.streamer.name === currentStreamer
        ) {
          streamerList.push(...state.streamerList);
          // Add existing streamer tokens to the used tokens set
          state.streamerList.forEach((item) => {
            if (item && item.token && !next[item.token] && !usedTokens.has(item.token)) {
              next[item.token] = item.name;
              usedTokens.add(item.token);
            }
          });
        }
      } else {
        // No current streamer detected
        streamerMeta = {
          name: null,
          apiStatus: "not_requested",
        };
      }

      const hasEmotes = globalList.length > 0 || streamerList.length > 0;
      if (!hasEmotes && state.map && Object.keys(state.map).length) {
        console.warn("🐝[Emote map] Refresh returned no emotes, keeping previous state");
        _inFlight = false;
        return false;
      }

      // Update state
      state.map = next;
      state.regex = buildRegex(state.map);
      state.globalList = globalList;
      state.streamerList = streamerList;
      state.meta.streamer = streamerMeta;

      console.log("[Emote map] New state:", {
        mapSize: Object.keys(state.map).length,
        hasRegex: !!state.regex,
        globalCount: state.globalList.length,
        streamerCount: state.streamerList.length
      });
      // console.log("🐝[Emote map] State updated, about to notify listeners. Map size:", Object.keys(state.map).length, "Listeners:", state.listeners.length);

      // Notify all listeners about the update
      notifyListeners();

      _inFlight = false;
      return true;
    } catch (error) {
      _inFlight = false;
      console.error("[Emote map]: Refresh from API failed" + error);
      return false;
    }
  }

  // Helper function to notify all listeners
  function notifyListeners() {
    console.log("🐝[Emote map] (onupdate) Current listeners array:", state.listeners.map((fn, i) => `Listener ${i}: ${fn.name || 'anonymous'}`));

    if (state.listeners.length === 0) {
      console.warn("🐝[Emote map] No listeners registered! This might indicate a timing issue.");
      return;
    }

    state.listeners.forEach((fn, index) => {
      try {
        const payload = {
          global: state.globalList.slice(),
          streamer: state.streamerList.slice(),
          meta: {
            ...state.meta,
            streamer: state.meta.streamer ? { ...state.meta.streamer } : null,
          },
        };
        console.log(`🐝[Emote map] (onupdate) Calling listener ${index}:`, fn.name || 'anonymous');
        console.log(`🐝[Emote map] (onupdate) Listener ${index} payload:`, {
          mapSize: Object.keys(state.map).length,
          hasRegex: !!state.regex,
          globalCount: payload.global.length,
          streamerCount: payload.streamer.length
        });

        const result = fn(state.map, state.regex, payload);
        console.log(`🐝[Emote map] (onupdate) Listener ${index} completed successfully`);

        // If the function returns a promise, catch any async errors
        if (result && typeof result.catch === 'function') {
          result.catch(error => {
            console.error(`🐝[Emote map] (onupdate) Async error in listener ${index}:`, error);
          });
        }
      } catch (error) {
        console.error(`🐝[Emote map] (onupdate) Listener ${index} failed:`, error);
        console.error(`🐝[Emote map] (onupdate) Listener ${index} error stack:`, error.stack);
        console.error(`🐝[Emote map] (onupdate) Listener ${index} function:`, fn.toString().substring(0, 200) + '...');
      }
    });
  }

  window.BeeHappyEmotes = {
    init: async () => {
      let isStreamerFetched = state.meta.streamer && state.meta.streamer.apiStatus === "fetched";
      if (state.map && state.regex && isStreamerFetched) {
        // If already initialized, notify listeners with current data
        console.log("[Emote map][ContentScript][EmotePicker] Already initialized, notifying listeners");
        notifyListeners();
        return true;
      }
      console.log("[Emote map][ContentScript][EmotePicker] Initializing again for those who called ", state);
      const ok = await refreshFromApi();
      return ok && state.map && state.regex && isStreamerFetched;
    },

    getMap: () => state.map,
    getRegex: () => state.regex,
    getList: (scope = "global") => {
      if (scope === "streamer") return state.streamerList.slice();
      if (scope === "all") return state.globalList.concat(state.streamerList);
      return state.globalList.slice();
    },
    getGlobalList: () => state.globalList.slice(),
    getStreamerList: () => state.streamerList.slice(),
    getLists: () => ({
      global: state.globalList.slice(),
      streamer: state.streamerList.slice(),
    }),
    getStreamerMeta: () => state.meta.streamer,
    onUpdate: (fn) => {
      if (typeof fn === "function") {
        // Check if this function is already registered to prevent duplicates
        const alreadyExists = state.listeners.some(existingFn => existingFn === fn || existingFn.toString() === fn.toString());
        if (alreadyExists) {
          console.warn("🐝[Emote map] Listener already registered, skipping:", fn.name || 'anonymous');
          return;
        }

        console.log("🐝[Emote map] Registering new listener:", fn.name || 'anonymous', "Total listeners will be:", state.listeners.length + 1);
        state.listeners.push(fn);
        // If we already have data, immediately notify the new listener
        if (state.map && state.regex && (state.globalList.length > 0 || state.streamerList.length > 0)) {
          console.log("🐝[Emote map] Immediately notifying new listener with existing data");
          try {
            const payload = {
              global: state.globalList.slice(),
              streamer: state.streamerList.slice(),
              meta: {
                ...state.meta,
                streamer: state.meta.streamer ? { ...state.meta.streamer } : null,
              },
            };
            fn(state.map, state.regex, payload);
          } catch (error) {
            console.warn("🐝[Emote map] New listener failed:", error);
          }
        }
      } else {
        console.warn("🐝[Emote map] onUpdate called with non-function:", typeof fn);
      }
    },
    refreshFromApi,
  };

  // Initialize after DOM is ready
  function initializeEmoteMap() {
    console.log("[Emote map] DOM ready, emote map system available (but not fetching yet)");
    // The emote map is now available for use, but won't auto-fetch
    // Fetching will only happen when init() is explicitly called
  }

  // Wait for DOM to be ready before making BeeHappyEmotes available
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeEmoteMap);
  } else {
    // DOM already ready
    initializeEmoteMap();
  }
})();
