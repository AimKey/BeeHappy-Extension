// BeeHappy YouTube Chat Emote Replacer
class BeeHappyEmoteReplacer {
  constructor() {
    this.emoteMap = {
      '[bh:poggers]': '🎮POGGERS🎮',
      '[bh:kappa]': '⚡KAPPA⚡',
      '[bh:lul]': '😂LUL😂',
      '[bh:pepe]': '😢PEPE😢',
      // Vietnamese test emotes
      '[bh:quay_đều]': '🎮QUAY ĐỀU🎮',
      '[bh:độ_mixi]': '⚡ĐỘ MIXI⚡'
    };
    this.observer = null;
    this.isProcessing = false;
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
      
      // REPLACE EMOTES FUNCTIONS
      let processedCount = 0;
      messages.forEach((msg, index) => {
        if (!msg.dataset.processed) {
          let text = msg.textContent;
          let hasChanges = false;
          
          // Replace emote patterns
          for (const [pattern, replacement] of Object.entries(this.emoteMap)) {
            if (text.includes(pattern)) {
              text = text.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
              hasChanges = true;
            }
          }
          
          if (hasChanges) {
            msg.textContent = text;
            // msg.style.color = '#ff6b35';
            // msg.style.fontWeight = 'bold';
            // msg.style.backgroundColor = 'rgba(255, 107, 53, 0.1)';
            processedCount++;
          }
          
          msg.dataset.processed = 'true';
        }
      });
    } catch (error) {
      console.error('🐝 BeeHappy: Error processing emotes:', error);
    } finally {
      this.isProcessing = false;
    }
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
      let hasNewMessages = false;
      
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && 
              (node.tagName === 'YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER' || 
               node.querySelector && node.querySelector('yt-live-chat-text-message-renderer'))) {
            hasNewMessages = true;
          }
        });
      });
      
      if (hasNewMessages) {
        this.replaceEmotes();
      }
    });

    this.observer.observe(chatContainer, {
      childList: true,
      subtree: true
    });

    // Process existing messages
    this.replaceEmotes();
  }

  init() {
    setTimeout(() => this.startObserver(), 3000);
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
