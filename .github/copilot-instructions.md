# BeeHappy YouTube Extension - AI Coding Guide

## Architecture Overview

This is a Chrome Manifest V3 extension that replaces emote tokens in YouTube live chat with custom replacements. The system uses a modular architecture with clear separation between content injection, API communication, and UI components.

### Core Components Flow

1. **Content Script Pipeline**: `emote-map.js` → `emote-picker-config.js` → `overlay-chat.js` → `content-script.js`
2. **Background Service**: `background.js` handles API requests and cross-frame communication
3. **UI Components**: `popup.html/js` for extension popup, overlay system for chat integration

## Critical Patterns

### Emote System Architecture
- **`emote-map.js`**: Central state manager with storage + API sync. Exposes `window.BeeHappyEmotes` global
- **Token matching**: Uses single compiled regex (`buildRegex()`) for performance in chat streams
- **DOM safety**: Uses `createTreeWalker()` + `createDocumentFragment()` to avoid breaking YouTube's DOM

```javascript
// Pattern: Safe DOM text replacement without structure damage
const walker = document.createTreeWalker(msg, NodeFilter.SHOW_TEXT, null);
// Always check for existing `.bh-emote` spans to avoid double-processing
if (msg.querySelector('.bh-emote')) return;
```

### YouTube Integration Challenges
- **Multiple selectors**: YouTube changes chat selectors; use fallback arrays:
  ```javascript
  const selectors = [
    'yt-live-chat-text-message-renderer #message',
    'yt-live-chat-text-message-renderer .message',
    // ... fallbacks
  ];
  ```
- **Frame communication**: Chat often in iframe, uses `postMessage` bridge pattern
- **Observer patterns**: Use `MutationObserver` for dynamic content, not intervals

### Chrome Extension Patterns
- **Service Worker**: All API calls routed through `background.js` due to CORS/CSP
- **Message passing**: `chrome.runtime.onMessage` for content↔background communication
- **Storage**: `chrome.storage.local` for persistence, with fallbacks for offline mode
- **Injection**: Use `chrome.scripting.executeScript` for dynamic script loading

### API Integration
- **Dual environment**: Production (`beehappy-gfghhffadqbra6g8.eastasia-01.azurewebsites.net`) + localhost fallback
- **Error handling**: Always provide fallback to `DEFAULT_MAP` when API fails
- **Timeout pattern**: 5-second abort controller for all fetch requests

## Development Workflows

### Extension Loading
```powershell
# Load unpacked extension in Chrome Developer Mode
# Navigate to chrome://extensions/, enable Developer Mode, click "Load unpacked"
```

### Testing Content Scripts
- Use DevTools on YouTube live chat pages
- Check Console for `🐝 BeeHappy:` prefixed logs  
- Test emote replacement in live chat or use popup's "Test Extension" button

### Debugging Cross-Frame Issues
- Open DevTools on both main YouTube page AND chat iframe
- Monitor `postMessage` communication in Console
- Check `window.BeeHappyEmotes` availability in each frame

## File Modification Guidelines

### Adding New Emote Sources
1. Modify `emote-map.js` → `fetchFromAPI()` function
2. Update `DEFAULT_MAP` for offline fallbacks
3. Ensure new tokens follow `[bh:name]` pattern for regex safety

### UI Changes
- **Popup**: Modify `popup.html` + `popup.js` (self-contained)
- **Overlay**: Edit `overlay-chat.html` embedded styles + `overlay-chat.js`
- **Global styles**: `styles.css` affects both popup and content scripts

### Content Script Changes
- **Processing logic**: `content-script.js` → `transformMessage()`
- **Chat detection**: Update selectors in both `content-script.js` and `overlay-chat.js`
- **Performance**: Always test with high-volume chat streams

## Common Integration Points

- **Global state**: `window.BeeHappyEmotes` object manages emote map + regex
- **Configuration**: `window.BeeHappyEmotePickerConfig` for API URLs + Chrome APIs
- **Event system**: Custom events (`beehappy-config-ready`) for initialization sequencing
- **Storage keys**: `bh_emote_map_v1` + `bh_emote_map_v1:list` for persistence

## Testing Notes

- Test on actual YouTube live streams for real DOM patterns
- Verify emote replacement survives YouTube's dynamic DOM updates
- Check both embedded chat and popout chat windows
- Test offline functionality with network disabled
