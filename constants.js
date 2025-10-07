// BeeHappy Extension Constants
(() => {
  "use strict";

  // API Configuration
  const API_CONFIG = {
    PRODUCTION_URL: "https://beehappy-gfghhffadqbra6g8.eastasia-01.azurewebsites.net",
    DEVELOPMENT_URL: "https://localhost:7256",
    EMOTES_ENDPOINT: "/api/emotes",
    TIMEOUT_MS: 5000,
  };

  // Storage Keys
  const STORAGE_KEYS = {
    EMOTE_MAP: "bh_emote_map_v1",
    EMOTE_LIST: "bh_emote_map_v1:list",
    USER_TOKEN: "bh_token",
    USER_DATA: "bh_user",
  };

  // UI Configuration
  const UI_CONFIG = {
    OVERLAY_Z_INDEX: 10000,
    POPUP_WIDTH: 300,
    POPUP_MIN_HEIGHT: 400,
    EMOTE_CLASS: "bh-emote",
    OVERLAY_CLASS: "beehappy-overlay",
  };

  // YouTube Selectors (fallback array for changing DOM)
  const YOUTUBE_SELECTORS = {
    CHAT_MESSAGES: [
      "yt-live-chat-text-message-renderer #message",
      "yt-live-chat-text-message-renderer .message",
      'yt-live-chat-text-message-renderer span[id="message"]',
      ".yt-live-chat-text-message-renderer #message",
    ],
    CHAT_CONTAINER: ["yt-live-chat-renderer", "#chat-container", ".yt-live-chat-renderer"],
  };

  // Event Names
  const EVENTS = {
    CONFIG_READY: "beehappy-config-ready",
    EMOTES_UPDATED: "beehappy-emotes-updated",
    OVERLAY_TOGGLE: "beehappy-overlay-toggle",
  };

  // Logging Configuration
  const LOG_CONFIG = {
    PREFIX: "🐝 BeeHappy:",
    ENABLE_DEBUG: true,
  };

  // Retries config
  const RETRIES_CONFIG = {
    MAX_RETRIES: 5,
    RETRY_DELAY_MS: 1000,
  };

  // Chrome Extension Message Actions
  const MESSAGE_ACTIONS = {
    FETCH_EMOTES: "fetch_emotes",
    INJECT_HELPER: "inject_helper_all_frames",
    GET_EMOTES: "getEmotes",
    REFRESH_EMOTES: "refreshEmotes",
    FETCH_STREAMER_EMOTE_SET: "fetch_streamer_emote_set",
  };

  // Expose constants globally
  window.BeeHappyConstants = {
    API_CONFIG,
    STORAGE_KEYS,
    UI_CONFIG,
    YOUTUBE_SELECTORS,
    EVENTS,
    LOG_CONFIG,
    MESSAGE_ACTIONS,
  };

  // Utility functions
  window.BeeHappyConstants.getApiUrl = (endpoint = "") => {
    // NOTE: TURN THIS VARIABLE OFF TO USE THE OFFICIAL URL
    const isDev = true;
    const baseUrl = isDev ? API_CONFIG.DEVELOPMENT_URL : API_CONFIG.PRODUCTION_URL;
    return baseUrl + endpoint;
  };

  window.BeeHappyConstants.log = (message, ...args) => {
    if (LOG_CONFIG.ENABLE_DEBUG) {
      console.log(LOG_CONFIG.PREFIX, message, ...args);
    }
  };

  window.BeeHappyConstants.error = (message, ...args) => {
    console.error(LOG_CONFIG.PREFIX, message, ...args);
  };

  // Dispatch ready event
  document.dispatchEvent(new CustomEvent(EVENTS.CONFIG_READY));
  console.log(LOG_CONFIG.PREFIX, "Constants loaded");
})();
