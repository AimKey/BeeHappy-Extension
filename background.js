// BeeHappy Background Service Worker

// Background worker constants (service worker doesn't have access to content script globals)
const BG_CONSTANTS = {
  LOG_PREFIX: "🐝 BeeHappy:",
  TIMEOUT_MS: 5000,
  MESSAGE_ACTIONS: {
    FETCH_EMOTES: "fetch_emotes",
    INJECT_HELPER: "inject_helper_all_frames",
  },
};

// Handle API requests from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === BG_CONSTANTS.MESSAGE_ACTIONS.FETCH_EMOTES) {
    console.log("Fetching from this link: ", request.url);
    fetchEmotes(request.url)
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

  // Inject the emote picker script into all frames of the active tab (including the iframe of youtube chat)
  if (request.action === BG_CONSTANTS.MESSAGE_ACTIONS.INJECT_HELPER) {
    // chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    //   if (tabs[0]) {
    //     chrome.scripting
    //       .executeScript({
    //         target: { tabId: tabs[0].id, allFrames: true },
    //         files: ["emote-picker.js"],
    //       })
    //       .then(() => {
    //         sendResponse({ success: true });
    //       })
    //       .catch((error) => {
    //         console.error("🐝 Script Injection Error:", error);
    //         sendResponse({
    //           success: false,
    //           error: error.message || "Failed to inject script",
    //         });
    //       });
    //   }
    // });
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
        // FIXME: Change back the api route to prod later
        // const API_BASE_URL = "https://beehappy-gfghhffadqbra6g8.eastasia-01.azurewebsites.net";
        const API_BASE_URL = "https://localhost:7256";

        return fetch(`${API_BASE_URL}/api/users/me`, {
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
        console.error("🐝 Get user info failed:", error);
        sendResponse({
          success: false,
          error: error.name === "AbortError" ? "Request timeout" : error.message,
        });
      });

    return true; // Keep message channel open for async response
  }
});

// Fetch emotes from BeeHappy API with proper headers and error handling
async function fetchEmotes(url) {
  try {
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

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("Invalid content type: Expected JSON");
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Invalid response format: Expected array");
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("API request timed out");
    }
    throw error;
  }
}

// Listen for installation/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install" || details.reason === "update") {
    // Clear any old data and set up initial state
    chrome.storage.local.clear();
    console.log("🐝 Extension installed/updated");
  }
});
