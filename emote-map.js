// Centralized BeeHappy emote map with storage + API refresh hooks
(function () {
  // const STORAGE_KEY = window.BeeHappyConstants?.STORAGE_KEYS?.EMOTE_MAP || "bh_emote_map_v1";
  const API_URL =
    window.BeeHappyConstants?.getApiUrl(window.BeeHappyConstants?.API_CONFIG?.EMOTES_ENDPOINT) ||
    "https://localhost:7256/api/emotes";

  const state = {
    map: null, // token → replacement text
    regex: null, // combined token regex
    list: [], // [{ token, name, url }]
    listeners: [],
  };

  function buildRegex(map) {
    const escapeToken = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = Object.keys(map || {}).map(escapeToken);
    return parts.length ? new RegExp(parts.join("|"), "g") : null;
  }

  async function ensureInitialized() {
    if (state.map) {
      console.log("[Emote map]: Initialized state: ", state);
      return true;
    } else {
      console.log("[Emote map]: Initialized state: ", state);
      return false;
    }
  }

  let _inFlight = false;
  async function refreshFromApi() {
    // Ask background to fetch (handles CORS/timeouts)
    try {
      if (_inFlight) {
        console.log("🐝[DEBUG] refresh skipped (in flight)");
        return false;
      }

      _inFlight = true;
      // TODO: Handle get user emotes, current streamer emotes  + global emotes
      const resp = await chrome.runtime.sendMessage({ action: "fetch_emotes", url: API_URL });
      console.log("🐝[DEBUG][Emote map] Refresh / Getting all emotes from backend:", resp);
      if (!resp || !resp.success || !Array.isArray(resp.data)) return false;
      // Normalize into token map and a list suitable for the picker
      const base = new URL(API_URL, location.origin);
      const toAbs = (u) => {
        try {
          return new URL(u, base).toString();
        } catch (_) {
          return String(u || "");
        }
      };

      // Convert the name (including vietnamese) into suitable string for the emote picker
      const slugify = (s) =>
        (s || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || "unsupported emote name";

      const next = { ...state.map };
      const list = [];
      resp.data.forEach((item) => {
        if (!item || typeof item.name !== "string") return;
        const slug = slugify(item.name);
        // const token = `[bh:${slug}]`;
        const token = `${slug}`;
        const file = Array.isArray(item.files) && item.files.length ? item.files[item.files.length - 1] : null;
        // const file = Array.isArray(item.files) && item.files.length ? item.files[0] : null;
        const url = file?.url ? toAbs(file.url) : "";
        const byUser = item.byUser ? item.byUser : "unknown";
        list.push({ token, name: item.name, url, byUser });
        // TODO: Handle duplicate emote name ?
        if (!next[token]) next[token] = item.name; // textual fallback replacement
      });

      // Update state, notify listeners
      state.map = next;
      state.regex = buildRegex(state.map);
      state.list = list;
      // await saveToStorage(state.map, state.list);
      state.listeners.forEach((fn) => {
        try {
          fn(state.map, state.regex, state.list);
        } catch (_) {}
      });
      _inFlight = false;
      return true;
    } catch (error) {
      _inFlight = false;
      console.error("[Emote map]: Refresh from API failed" + error);
      return false;
    }
  }

  window.BeeHappyEmotes = {
    init: async () => {
      await ensureInitialized();
    },
    getMap: () => state.map,
    getRegex: () => state.regex,
    getList: () => state.list,
    onUpdate: (fn) => {
      if (typeof fn === "function") state.listeners.push(fn);
    },
    refreshFromApi,
  };
})();
