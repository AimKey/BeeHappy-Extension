// BeeHappy YouTube Chat Emote Replacer
class BeeHappyEmoteReplacer {
  constructor() {
    this.emoteMap = {
      ':poggers:': '🎮POGGERS🎮',
      ':kappa:': '⚡KAPPA⚡',
      ':lul:': '😂LUL😂',
      ':pepehands:': '😢PEPE😢',
      // Vietnamese test emotes
      'đi': '🎮TEST🎮',
      'của': '⚡EMOTE⚡'
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
        if (messages.length > 0) {
          console.log(`🐝 Found ${messages.length} messages using selector: ${selector}`);
          break;
        }
      }
      
      if (messages.length === 0) {
        console.log('🐝 No chat messages found with any selector');
        return;
      }
      
      let processedCount = 0;
      messages.forEach((msg, index) => {
        if (!msg.dataset.processed) {
          let text = msg.textContent;
          let hasChanges = false;
          
          console.log(`🐝 Processing message ${index}: "${text}"`);
          
          // Replace emote patterns
          for (const [pattern, replacement] of Object.entries(this.emoteMap)) {
            if (text.includes(pattern)) {
              text = text.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
              hasChanges = true;
              console.log(`🐝 Replaced "${pattern}" with "${replacement}"`);
            }
          }
          
          if (hasChanges) {
            msg.textContent = text;
            msg.style.color = '#ff6b35';
            msg.style.fontWeight = 'bold';
            msg.style.backgroundColor = 'rgba(255, 107, 53, 0.1)';
            processedCount++;
            console.log(`🐝 Applied styling to message: "${text}"`);
          }
          
          msg.dataset.processed = 'true';
        }
      });
      
      if (processedCount > 0) {
        console.log(`🐝 Successfully processed ${processedCount} messages with emotes`);
      }
      
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
      console.log('BeeHappy: Chat container not found, retrying...');
      setTimeout(() => this.startObserver(), 2000);
      return;
    }

    console.log('BeeHappy: Chat container found, starting observer');
    
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
    console.log('BeeHappy: Initializing emote replacer...');
    setTimeout(() => this.startObserver(), 3000);
  }
}

// Message handling for communication with popup and background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    switch (request.action) {
      case 'test':
        console.log('BeeHappy: Test message received:', request.message);
        sendResponse({ success: true, message: 'Content script is working!' });
        break;
        
      case 'insertEmote':
        // Future feature: Insert emote at cursor position
        console.log('BeeHappy: Insert emote request:', request.emoteName);
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
        console.log('🐝 Toggle overlay requested. overlayChat:', overlayChat);
        if (overlayChat) {
          console.log('🐝 Calling overlayChat.toggle()');
          overlayChat.toggle();
          sendResponse({ success: true, message: 'Overlay toggled' });
        } else {
          console.log('🐝 Overlay not initialized, attempting to initialize...');
          // Try to initialize if not already done
          if (window.location.href.includes('youtube.com/watch') || window.location.href.includes('youtube.com/live')) {
            try {
              overlayChat = new BeeHappyOverlayChat();
              console.log('🐝 Overlay initialized on demand');
              setTimeout(() => {
                overlayChat.toggle();
                sendResponse({ success: true, message: 'Overlay initialized and toggled' });
              }, 500);
            } catch (error) {
              console.error('🐝 Failed to initialize overlay on demand:', error);
              sendResponse({ success: false, error: 'Failed to initialize overlay: ' + error.message });
            }
          } else {
            sendResponse({ success: false, error: 'Overlay not initialized - not on YouTube page' });
          }
        }
        break;
        
      default:
        sendResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('BeeHappy: Error handling message:', error);
    sendResponse({ error: error.message });
  }
  
  return true; // Keep message channel open
});

// Initialize the BeeHappy overlay system
console.log('🐝 BeeHappy Extension Started!', window.location.href);
console.log('🐝 Document ready state:', document.readyState);

let overlayChat = null;

// Debug: Check if we're on the right page
if (window.location.href.includes('youtube.com/watch') || window.location.href.includes('youtube.com/live')) {
  console.log('🐝 On YouTube watch/live page - proceeding with overlay initialization');
  
  // Initialize overlay chat system
  const initializeOverlay = () => {
    if (!overlayChat) {
      try {
        console.log('🐝 Attempting to create BeeHappyOverlayChat...');
        overlayChat = new BeeHappyOverlayChat();
        console.log('🐝 Overlay chat system initialized successfully');
      } catch (error) {
        console.error('🐝 Failed to initialize overlay chat:', error);
        overlayChat = null;
      }
    } else {
      console.log('🐝 Overlay already initialized');
    }
  };
  
  // Start immediately and also when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('🐝 DOM loaded, initializing overlay...');
      setTimeout(initializeOverlay, 1000);
    });
  } else {
    setTimeout(initializeOverlay, 1000);
  }
  
  // Also try after a longer delay for YouTube's dynamic loading
  setTimeout(() => {
    console.log('🐝 Delayed overlay initialization attempt...');
    if (!overlayChat) {
      initializeOverlay();
    }
  }, 3000);
  
} else {
  console.log('🐝 Not on YouTube watch page, skipping initialization');
}
