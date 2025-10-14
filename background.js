// BeeHappy Background Service Worker

// Background worker constants (service worker doesn't have access to content script globals)
const BG_CONSTANTS = {
  LOG_PREFIX: "🐝 BeeHappy:",
  TIMEOUT_MS: 10000, // 10 seconds
  MESSAGE_ACTIONS: {
    FETCH_EMOTES: "fetch_emotes",
    INJECT_HELPER: "inject_helper_all_frames",
    FETCH_USER_BY_NAME: "fetch_user_by_name",
    FETCH_STREAMER_EMOTE_SET: "fetch_streamer_emote_set",
  },
};

const API_DEFAULTS = {
  PRODUCTION_URL: "https://beehappy-gfghhffadqbra6g8.eastasia-01.azurewebsites.net",
  DEVELOPMENT_URL: "https://localhost:7256",
  EMOTES_ENDPOINT: "/api/emotes",
  USE_DEV: false,
};

// Resolve the API host (no trailing endpoint). Use this to build specific endpoints.
const resolveApiHost = () => {
  const base = API_DEFAULTS.USE_DEV ? API_DEFAULTS.DEVELOPMENT_URL : API_DEFAULTS.PRODUCTION_URL;
  return base.replace(/\/$/, "");
};

const resolveApiUrl = (endpoint = "") => {
  const host = resolveApiHost();
  console.log("🐝 BeeHappy: Resolved API URL:", host + endpoint);
  if (!endpoint) return host;
  // Ensure endpoint begins with '/'
  return host + (endpoint.startsWith("/") ? endpoint : `/${endpoint}`);
};

// Handle API requests from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === BG_CONSTANTS.MESSAGE_ACTIONS.FETCH_EMOTES) {
    // Log by action name only (do not include URL)
    fetchEmotes(request.url, request.action)
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => {
        console.error(BG_CONSTANTS.LOG_PREFIX, "API Error:", error);
        sendResponse({
          success: false,
          error: error.message || "Failed to fetch emotes",
        });
      });
    return true; // Keep the message channel open for async response
  }

  // FIXME: Remove this shit
  if (request.action === BG_CONSTANTS.MESSAGE_ACTIONS.INJECT_HELPER) {
    return true;
  }

  if (request.action === BG_CONSTANTS.MESSAGE_ACTIONS.FETCH_USER_BY_NAME) {
    const { url, token } = request;
    if (!url) {
      sendResponse({ success: false, error: "Missing user lookup URL" });
      return false;
    }

    // Pass the action name for logging (no URLs)
    fetchUserByName(url, token, request.action)
      .then((user) => sendResponse({ success: true, user }))
      .catch((error) => {
        // console.error("🐝 BeeHappy: User lookup failed", error);
        sendResponse({ success: false, error: error.message || "User lookup failed" });
      });
    return true;
  }

  if (request.action === "getUserInfo") {
    chrome.storage.local
      .get(["token"])
      .then((result) => {
        const token = result.token;

        if (!token) {
          sendResponse({ success: false, error: "No auth token found, please login first" });
          return;
        }
        console.log("🐝 Get user info with token:", token);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        // Build user info URL using the API host helper
        const userInfoUrl = resolveApiUrl("/api/users/me");

        return fetch(userInfoUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        })
          .then((response) => {
            console.log("🐝 Get user info response", response.body);
            clearTimeout(timeoutId);

            if (!response.ok) {
              return response.json().then((data) => {
                throw new Error(`API Error: ${response.status}, data: ${JSON.stringify(data)}`);
              });
            }

            return response.json();
          })
          .then((userInfo) => {
            sendResponse({ success: true, user: userInfo });
          });
      })
      .catch((error) => {
        // console.error("🐝 Get user info failed:", error);
        sendResponse({
          success: false,
          error: error.name === "AbortError" ? "Request timeout" : error.message,
        });
      });

    return true; // Keep message channel open for async response
  }

  if (request.action === BG_CONSTANTS.MESSAGE_ACTIONS.FETCH_STREAMER_EMOTE_SET) {
    const { streamerName, url } = request;
    console.log("🐝[background.js] Received request to fetch emote set for streamer:", streamerName);
    if (!streamerName) {
      sendResponse({ success: false, error: "Missing streamer name" });
      return false;
    }

    console.log("🐝[background.js] Fetching emote set for streamer:", streamerName);
    // Build streamer set URL using API host helper
    const fetchURL = url || resolveApiUrl(`api/emotes/sets/user/${encodeURIComponent(streamerName)}`);

    fetchEmotes(fetchURL)
      .then((data) => {
        console.log("🐝[background.js] Fetched streamer emote set:", data);
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        console.error(BG_CONSTANTS.LOG_PREFIX, "API Error:", error);
        sendResponse({
          success: false,
          error: error.message || "Failed to fetch streamer emote set",
        });
      });
    return true; // Keep the message channel open for async response
  }
});

// Fetch emotes from BeeHappy API with proper headers and error handling
async function fetchEmotes(url, actionName = "fetch_emotes") {
  try {
    const startedAt = Date.now();
    console.log(BG_CONSTANTS.LOG_PREFIX, "Action start:", actionName, new Date(startedAt).toISOString());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BG_CONSTANTS.TIMEOUT_MS);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Origin: "https://www.youtube.com",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const duration = Date.now() - startedAt;
    console.log(BG_CONSTANTS.LOG_PREFIX, `Action complete: ${actionName} status=${response.status} duration=${duration}ms`);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("API request timed out");
    }
    throw error;
  }
}

async function fetchUserByName(url, token, actionName = "fetch_user_by_name") {
  const startedAt = Date.now();
  console.log(BG_CONSTANTS.LOG_PREFIX, "Action start:", actionName, new Date(startedAt).toISOString());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BG_CONSTANTS.TIMEOUT_MS);

  try {
    const headers = { Accept: "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const duration = Date.now() - startedAt;
    console.log(BG_CONSTANTS.LOG_PREFIX, `Action complete: ${actionName} status=${response.status} duration=${duration}ms`);

    if (!response.ok) {
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch (_) { }
      throw new Error(
        `User request failed: ${response.status} ${response.statusText}${bodyText ? ` | ${bodyText}` : ""}`
      );
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startedAt;
    console.error(BG_CONSTANTS.LOG_PREFIX, `Action error: ${actionName} duration=${duration}ms`, error);
    if (error.name === "AbortError") {
      throw new Error("User request timed out");
    }
    throw error;
  }
}

// Detect URL changes via webNavigation API and fire it so that the content script can init
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  const tabId = details.tabId;
  const currentUrl = details.url;

  // Wait a bit — let YouTube's SPA finish loading new content
  setTimeout(() => {
    chrome.tabs.sendMessage(tabId, { action: "url_changed", currentUrl }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[BeeHappy] No content script found:", chrome.runtime.lastError.message);
      } else {
        console.log("[BeeHappy] Response from content script:", response);
      }
    });
  }, 3000); // 1.5s delay is safe for YouTube transitions
});


// Listen for installation/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install" || details.reason === "update") {
    // Clear any old data and set up initial state
    chrome.storage.local.clear();
    console.log("🐝 Extension installed/updated");
  }
});
