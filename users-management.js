// BeeHappy Users Management
// Provides a lightweight cache keyed by username with helpers to fetch and update users.

(() => {
  const MAX_CACHE_SIZE = 100;
  const TIMEOUT_MS = (window.BeeHappyConstants?.API_CONFIG?.TIMEOUT_MS || 1000) >>> 0;

  const resolveUserEndpoint = (username) => {
    const encoded = encodeURIComponent(username);
    if (typeof window.BeeHappyConstants?.getApiUrl === "function") {
      return window.BeeHappyConstants.getApiUrl(`/api/users/name/${encoded}`);
    }

    const fallbackBase = window.BeeHappyConstants?.API_CONFIG?.PRODUCTION_URL || "https://localhost:7256";
    return `${fallbackBase.replace(/\/$/, "")}/api/users/name/${encoded}`;
  };

  const userCache = new Map();
  const inFlightLookups = new Map();

  const normalise = (username) => {
    if (!username) return "";
    return String(username).trim().toLowerCase();
  };

  const cacheUser = (username, user) => {
    const key = normalise(username || user?.Username || user?.username);
    if (!key) return;

    if (userCache.has(key)) {
      userCache.delete(key); // Refresh order for recency
    }

    userCache.set(key, user);

    while (userCache.size > MAX_CACHE_SIZE) {
      const oldestKey = userCache.keys().next().value;
      userCache.delete(oldestKey);
    }
  };

  const getToken = async () => {
    try {
      const result = await chrome.storage?.local?.get?.(["token"]);
      return result?.token || null;
    } catch (error) {
      console.warn("🐝[Users] Unable to read auth token:", error);
      return null;
    }
  };

  const fetchUserFromApi = async (username) => {
    const endpoint = resolveUserEndpoint(username);
    if (!endpoint) {
      throw new Error("User lookup endpoint unavailable");
    }

    const token = await getToken();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("User lookup timed out"));
      }, TIMEOUT_MS || 5000);

      chrome.runtime.sendMessage(
        {
          action: "fetch_user_by_name",
          url: endpoint,
          token,
        },
        (response) => {
          clearTimeout(timeoutId);

          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (response?.success) {
            resolve(response.user);
          } else {
            // reject(new Error(response?.error || "User lookup failed"));
            console.log("🐝[Users] User lookup failed:", response?.error || "Unknown error");
          }
        }
      );
    });
  };

  const fetchUserByName = async (username) => {
    const normalised = normalise(username);
    if (!normalised) {
      throw new Error("Username is required");
    }

    if (userCache.has(normalised)) {
      return userCache.get(normalised);
    }

    if (inFlightLookups.has(normalised)) {
      return inFlightLookups.get(normalised);
    }

    const lookupPromise = fetchUserFromApi(username)
      .then((user) => {
        cacheUser(normalised, user);
        return user;
      })
      .finally(() => {
        inFlightLookups.delete(normalised);
      });

    inFlightLookups.set(normalised, lookupPromise);
    return lookupPromise;
  };

  const updateUserList = async (username) => {
    const normalised = normalise(username);
    if (!normalised) {
      console.warn("🐝[Users] updateUserList called without a valid username");
      return null;
    }

    if (userCache.has(normalised)) {
      return userCache.get(normalised);
    }

    try {
      const user = await fetchUserByName(username);
      cacheUser(normalised, user);
      return user;
    } catch (error) {
      // console.error("🐝[Users] Failed to update user list:", error);
      // throw error;
    }
  };

  const getUser = async (username) => {
    const normalised = normalise(username);
    if (!normalised) {
      throw new Error("🐝[Users] Username is required");
    }

    // First check cache
    if (userCache.has(normalised)) {
      console.log(`🐝[Users] Cache hit for user: ${normalised}`);
      return userCache.get(normalised);
    }

    // Not in cache, fetch from API
    console.log(`🐝[Users] Cache miss for user: ${normalised}, fetching from API`);

    try {
      const user = await fetchUserByName(username);
      return user;
    } catch (error) {
      // console.error(`🐝[Users] Failed to fetch user ${normalised}:`, error);
      throw error;
    }
  };

  // Function to query for the current streamer name
  const STREAMER_NAME_SELECTORS = [
    "#channel-name .yt-simple-endpoint.yt-formatted-string",
    "#channel-name yt-formatted-string",
    "ytd-channel-name yt-formatted-string",
    "yt-live-chat-header-renderer #title",
    "yt-live-chat-fixed-panel-renderer #title",
  ];

  const extractStreamerName = (root) => {
    if (!root) return null;
    for (const selector of STREAMER_NAME_SELECTORS) {
      const candidate = root.querySelector(selector);
      const text = candidate?.textContent?.trim();
      if (text) {
        return text;
      }
    }
    return null;
  };

  const getCurrentStreamer = () => {
    const localName = extractStreamerName(document);
    if (localName) {
      return localName;
    }

    if (window.top && window.top !== window) {
      try {
        return extractStreamerName(window.top.document) || null;
      } catch (error) {
        console.warn("🐝[Users] Unable to read streamer name from top window:", error);
      }
    }

    return null;
  };

  const BeeHappyUsers = {
    get cacheSize() {
      return userCache.size;
    },
    get cache() {
      return new Map(userCache);
    },
    getAllUsers() {
      return Array.from(userCache.values());
    },
    getCachedUser(username) {
      return userCache.get(normalise(username)) || null;
    },
    getUser,
    fetchUserByName,
    updateUserList,
    getCurrentStreamer,
    clearCache() {
      userCache.clear();
    },
    removeUser(username) {
      userCache.delete(normalise(username));
    },
  };

  window.BeeHappyUsers = BeeHappyUsers;
})();
