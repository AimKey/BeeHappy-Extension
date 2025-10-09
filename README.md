# BeeHappy Extension

BeeHappy is a small Chrome Manifest V3 extension that enhances YouTube Live Chat by
replacing custom emote tokens with images (or emoji), providing an emote picker UI,
and offering an optional floating overlay that displays recent chat messages with
BeeHappy emotes and light user styling.

---

## Features

- Replace tokens like `[bh:token]` in chat messages with configured images or emoji
- Emote picker UI to browse and insert BeeHappy emotes
- Draggable / resizable overlay panel that can show recent chat messages with emotes
- Background service worker that fetches emote lists (with fallback maps) and handles cross-frame messaging
- Persistent overlay position/size via `chrome.storage.local`

## Quick start — Load extension (unpacked)

1. Open Chrome and go to chrome://extensions/
2. Enable *Developer mode* (top-right)
3. Click *Load unpacked* and select this repository folder (the folder that contains `manifest.json`)
4. Open a YouTube live stream and verify BeeHappy logs in DevTools (look for console messages prefixed with "🐝")

## Files and responsibilities

- `manifest.json` — Chrome extension manifest (MV3)
- `background.js` — service worker / background script for API requests and cross-frame coordination
- `content-script.js` — injected into YouTube pages, wires overlay/picker into the page
- `overlay-chat.js` — overlay UI and chat-processing logic (draggable, resizable overlay)
- `overlay-chat.html` — overlay markup + styles that are injected into the page
- `emote-map.js` — central emote manager; exposes `window.BeeHappyEmotes`
- `emote-picker.js` — UI for browsing/selecting emotes
- `emote-utils.js` — helpers for token parsing and safe DOM replacements
- `popup.html` / `popup.js` — extension popup UI for quick controls
- `users-management.js` — lightweight user metadata handling
- `constants.js` — shared constants and configuration
- `assets/icons/` — extension icons and static assets

## Runtime globals & data shapes

- `window.BeeHappyEmotes` — primary API for emote data. Common methods:
  - `init()` — initialize and load cached/remote emotes
  - `refreshFromApi()` — fetch latest lists from the BeeHappy API
  - `getMap()` — returns a token -> fallbackText mapping
  - `getRegex()` — returns a compiled RegExp that matches emote tokens
  - `onUpdate(fn)` — subscribe to updates

- Emote list shape (example):

  {
    global: [ { token: "[bh:smile]", url: "https://.../smile.png" } ],
    streamer: [ ... ]
  }

## Development notes

- Emote replacement uses a single compiled RegExp for performance.
- DOM-safe replacements use TreeWalker / DocumentFragment to avoid breaking YouTube's live chat DOM.
- The overlay uses `MutationObserver` to watch the chat items instead of heavy polling.
- All API calls should be proxied through `background.js` to avoid CORS/CSP issues in content scripts.

## Debugging tips

- Look for console logs prefixed with "🐝" to follow extension flow.
- If overlay doesn't appear, ensure `window.BeeHappyEmotes.init()` completed successfully.
- For iframe chat scenarios, check both the main page and iframe DevTools for messages and `postMessage` traffic.
- If emotes don't load, verify the background script can reach the API (or fallback maps are present).

## Common tasks

- Rebuild / package: This repo doesn't include an automatic build step by default. If you add a bundler, update the `.gitignore` and manifest accordingly.
- Run local API: Background script supports local API fallback; check `constants.js` for configured endpoints.

## Contributing

1. Fork and create a feature branch
2. Add clear tests or a small smoke test when changing emote processing
3. Submit a pull request with a short description and screenshots (if UI changes)

## License

This repository does not include an explicit license file. If you want to apply a license
please add a `LICENSE` file (e.g., MIT) and update this section.

---

If you want, I can:
- Move inline styles from `overlay-chat.js` into `overlay-chat.html` CSS classes
- Add a small smoke test that constructs a fake chat node and asserts `processEmotes()` output
- Create a minimal `LICENSE` (MIT)

Tell me which of these you'd like next and I'll implement it.
