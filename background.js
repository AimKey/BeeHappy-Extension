// BeeHappy Background Service Worker
class BeeHappyBackground {
  constructor() {
    this.emoteCache = {};
    this.userToken = null;
    this.apiBaseUrl = 'https://your-api.com/api'; // Replace with actual API URL
    this.init();
  }

  init() {
    console.log('BeeHappy Background: Service worker started');
    
    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Load stored auth token
    this.loadStoredAuth();
  }

  async loadStoredAuth() {
    try {
      const result = await chrome.storage.local.get(['bh_token', 'bh_user']);
      this.userToken = result.bh_token;
      if (this.userToken) {
        console.log('BeeHappy Background: Auth token loaded');
        await this.fetchUserEmotes();
      }
    } catch (error) {
      console.error('BeeHappy Background: Error loading auth:', error);
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'getEmotes':
          sendResponse({ emotes: this.emoteCache });
          break;
          
        case 'getEmoteUrl':
          const url = this.getEmoteUrl(request.emoteName);
          sendResponse({ url });
          break;
          
        case 'refreshEmotes':
          await this.fetchUserEmotes();
          sendResponse({ success: true, emotes: this.emoteCache });
          break;
          
        case 'login':
          const loginResult = await this.login(request.credentials);
          sendResponse(loginResult);
          break;
          
        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      console.error('BeeHappy Background: Error handling message:', error);
      sendResponse({ error: error.message });
    }
  }

  async fetchUserEmotes(userId = null) {
    if (!this.userToken) {
      console.log('BeeHappy Background: No auth token, using default emotes');
      this.setDefaultEmotes();
      return;
    }

    try {
      const url = userId ? 
        `${this.apiBaseUrl}/emotes/user/${userId}` : 
        `${this.apiBaseUrl}/emotes/my`;
        
      const response = await fetch(url, {
        headers: { 
          'Authorization': `Bearer ${this.userToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const emotes = await response.json();
        this.emoteCache = this.processEmoteData(emotes);
        console.log('BeeHappy Background: Emotes fetched successfully');
      } else {
        console.error('BeeHappy Background: API error:', response.status);
        this.setDefaultEmotes();
      }
    } catch (error) {
      console.error('BeeHappy Background: Failed to fetch emotes:', error);
      this.setDefaultEmotes();
    }
  }

  setDefaultEmotes() {
    // Fallback emotes when API is unavailable
    this.emoteCache = {
      ':poggers:': { url: null, text: '🎮POGGERS🎮' },
      ':kappa:': { url: null, text: '⚡KAPPA⚡' },
      ':lul:': { url: null, text: '😂LUL😂' },
      ':pepehands:': { url: null, text: '😢PEPE😢' }
    };
  }

  processEmoteData(apiEmotes) {
    const processed = {};
    if (Array.isArray(apiEmotes)) {
      apiEmotes.forEach(emote => {
        processed[`:${emote.name}:`] = {
          url: emote.url,
          text: emote.name,
          id: emote.id
        };
      });
    }
    return processed;
  }

  getEmoteUrl(emoteName) {
    const emote = this.emoteCache[emoteName];
    return emote?.url || null;
  }

  getEmoteText(emoteName) {
    const emote = this.emoteCache[emoteName];
    return emote?.text || emoteName;
  }

  async login(credentials) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });

      if (response.ok) {
        const data = await response.json();
        this.userToken = data.token;
        
        // Store auth data
        await chrome.storage.local.set({
          'bh_token': this.userToken,
          'bh_user': data.user
        });

        // Fetch user emotes
        await this.fetchUserEmotes();
        
        return { success: true, user: data.user };
      } else {
        return { success: false, error: 'Login failed' };
      }
    } catch (error) {
      console.error('BeeHappy Background: Login error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Initialize background service
const beeHappyBackground = new BeeHappyBackground();
