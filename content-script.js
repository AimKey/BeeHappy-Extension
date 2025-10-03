// BeeHappy YouTube Chat Emote Replacer
class BeeHappyEmoteReplacer {
  constructor() {
    this.emoteMap = window.BeeHappyEmotes?.getMap() || {};
    this.observer = null;
    this.isProcessing = false;

    // Build a single regex matching any emote token
    const escapeToken = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = Object.keys(this.emoteMap).map(escapeToken);
    this.tokenRegex = parts.length ? new RegExp(parts.join('|'), 'g') : null;

    // Subscribe for future updates (e.g., API refresh)
    window.BeeHappyEmotes?.onUpdate((map, regex) => {
      this.emoteMap = map;
      this.tokenRegex = regex;
      // Re-scan messages on map update
      this.rescanExisting();
    });
  }

  replaceEmotes() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Try multiple selectors for YouTube chat messages
      const selectors = [
        'yt-live-chat-text-message-renderer #message',
        'yt-live-chat-text-message-renderer .message',
        'yt-live-chat-text-message-renderer span[id="message"]',
        '.yt-live-chat-text-message-renderer #message'
      ];
      
      let messages = [];
      for (const selector of selectors) {
        messages = document.querySelectorAll(selector);
        if (messages.length > 0) break;
      }
      
      if (messages.length === 0) return;
      
      // DOM-safe replace: transform text nodes into spans without touching structure
      messages.forEach((msg) => this.transformMessage(msg));
    } catch (error) {
      console.error('🐝 BeeHappy: Error processing emotes:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  transformMessage(msg) {
    // If we already added our spans here, skip until YouTube re-renders
    if (msg.querySelector('.bh-emote')) return;
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
      const original = textNode.nodeValue || '';
      if (!original) return;
      const frag = document.createDocumentFragment();
      let last = 0;
      this.tokenRegex.lastIndex = 0;
      let m;
      while ((m = this.tokenRegex.exec(original)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (start > last) frag.appendChild(document.createTextNode(original.slice(last, start)));
        const span = document.createElement('span');
        span.className = 'bh-emote';
        span.textContent = this.emoteMap[m[0]] || m[0];
        frag.appendChild(span);
        last = end;
      }
      if (last < original.length) frag.appendChild(document.createTextNode(original.slice(last)));
      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  rescanExisting() {
    try {
      const selectors = [
        'yt-live-chat-text-message-renderer #message',
        'yt-live-chat-text-message-renderer .message',
        'yt-live-chat-text-message-renderer span[id="message"]',
        '.yt-live-chat-text-message-renderer #message'
      ];
      let messages = [];
      for (const selector of selectors) {
        messages = document.querySelectorAll(selector);
        if (messages.length > 0) break;
      }
      if (!messages.length) return;
      messages.forEach((msg) => {
        // Only rescan messages that still contain tokens and no bh-emote yet
        if (msg.querySelector('.bh-emote')) return;
        const text = msg.textContent || '';
        this.tokenRegex && (this.tokenRegex.lastIndex = 0);
        if (this.tokenRegex && this.tokenRegex.test(text)) {
          this.transformMessage(msg);
        }
      });
    } catch (_) {}
  }

  startObserver() {
    const chatContainer = document.querySelector('yt-live-chat-renderer') || 
                         document.querySelector('#chatframe') ||
                         document.querySelector('#chat');
    
    if (!chatContainer) {
      setTimeout(() => this.startObserver(), 2000);
      return;
    }
    
    this.observer = new MutationObserver((mutations) => {
      let touched = false;
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER') {
            const msg = node.querySelector('#message') || node.querySelector('.message');
            if (msg) { this.transformMessage(msg); touched = true; }
          } else {
            const inner = node.querySelector && (node.querySelector('yt-live-chat-text-message-renderer #message') || node.querySelector('yt-live-chat-text-message-renderer .message'));
            if (inner) { this.transformMessage(inner); touched = true; }
          }
        });
      });
      // Periodically rescan existing messages that might have been re-hydrated
      if (touched) {
        setTimeout(() => this.rescanExisting(), 200);
      }
    });

    this.observer.observe(chatContainer, {
      childList: true,
      subtree: true
    });

    // Process existing and schedule rescans to catch rehydration
    this.replaceEmotes();
    setInterval(() => this.rescanExisting(), 2000);
  }

  init() {
    const start = async () => {
      await (window.BeeHappyEmotes?.init?.() || Promise.resolve());
      this.emoteMap = window.BeeHappyEmotes?.getMap() || this.emoteMap;
      this.tokenRegex = window.BeeHappyEmotes?.getRegex() || this.tokenRegex;
      this.startObserver();
      // Optionally kick an early refresh (non-blocking)
      window.BeeHappyEmotes?.refreshFromApi?.();
    };
    setTimeout(start, 1000);
  }
}

// Global overlay chat instance
let overlayChat = null;

// Message handling for communication with popup and background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Skip message handling in iframes
  if (window.top !== window) {
    sendResponse({ error: 'Not available in iframe' });
    return true;
  }

  try {
    switch (request.action) {
      case 'test':
        sendResponse({ success: true, message: 'Content script is working!' });
        break;
        
      case 'insertEmote':
        // Future feature: Insert emote at cursor position
        sendResponse({ success: true });
        break;
        
      case 'getStatus':
        sendResponse({ 
          success: true, 
          isActive: !!overlayChat,
          chatFound: !!document.querySelector('yt-live-chat-renderer')
        });
        break;
        
      case 'toggleOverlay':
        if (overlayChat) {
          overlayChat.toggle();
          sendResponse({ success: true, message: 'Overlay toggled' });
        } else {
          // Try to initialize if not already done
          if (window.location.href.includes('youtube.com/watch') || window.location.href.includes('youtube.com/live')) {
            try {
              overlayChat = new BeeHappyOverlayChat();
              setTimeout(() => {
                overlayChat.toggle();
                sendResponse({ success: true, message: 'Overlay initialized and toggled' });
              }, 500);
            } catch (error) {
              sendResponse({ success: false, error: 'Failed to initialize overlay: ' + error.message });
            }
          } else {
            sendResponse({ success: false, error: 'Not on YouTube page' });
          }
        }
        break;
        
      default:
        sendResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    sendResponse({ error: error.message });
  }
  
  return true; // Keep message channel open
});

// Initialize the BeeHappy system
if (window.top !== window) {
  // In iframe: only initialize emote replacer
  const replacer = new BeeHappyEmoteReplacer();
  replacer.init();
} else {
  // In main page: check if we should initialize overlay
  if (window.location.href.includes('youtube.com/watch') || window.location.href.includes('youtube.com/live')) {
    const initializeOverlay = () => {
      if (!overlayChat) {
        try {
          overlayChat = new BeeHappyOverlayChat();

          // Ask background to inject helper into all frames
          try {
            chrome.runtime.sendMessage({ action: 'inject_helper_all_frames' }, (resp) => {
              if (!resp?.success && resp?.error !== 'scripting.executeScript not available') {
                console.warn('🐝 inject_helper_all_frames failed:', resp?.error);
              }
            });
          } catch (e) {
            // Ignore errors - iframe helper is optional
          }
        } catch (error) {
          console.error('🐝 Failed to initialize overlay:', error);
          overlayChat = null;
        }
      }
    };
    
    // Try to initialize as soon as possible
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initializeOverlay, 1000);
      });
    } else {
      setTimeout(initializeOverlay, 1000);
    }
    
    // Also try after a delay for YouTube's dynamic loading
    setTimeout(() => {
      if (!overlayChat) initializeOverlay();
    }, 3000);
  }
}
