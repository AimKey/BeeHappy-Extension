// BeeHappy Popup Interface
class BeeHappyPopup {
  constructor() {
    this.emotes = {};
    this.isConnected = false;
    this.init();
  }

  init() {
    console.log('BeeHappy Popup: Initializing...');
    
    // Set up event listeners
    document.getElementById('test-button').addEventListener('click', () => this.testExtension());
    document.getElementById('refresh-button').addEventListener('click', () => this.refreshEmotes());
    document.getElementById('toggle-overlay').addEventListener('click', () => this.toggleOverlay());
    document.getElementById('search-input').addEventListener('input', (e) => this.filterEmotes(e.target.value));
    
    // Load initial data
    this.checkConnection();
    this.loadEmotes();
  }

  async checkConnection() {
    const statusElement = document.getElementById('status');
    
    try {
      // Check if we can communicate with background script
      const response = await this.sendMessage({ action: 'getEmotes' });
      
      if (response && !response.error) {
        this.isConnected = true;
        statusElement.textContent = 'Extension Active ✓';
        statusElement.className = 'status connected';
      } else {
        throw new Error('No response from background');
      }
    } catch (error) {
      console.error('BeeHappy Popup: Connection check failed:', error);
      this.isConnected = false;
      statusElement.textContent = 'Extension Error ✗';
      statusElement.className = 'status disconnected';
    }
  }

  async loadEmotes() {
    try {
      const response = await this.sendMessage({ action: 'getEmotes' });
      
      if (response && response.emotes) {
        this.emotes = response.emotes;
        this.renderEmoteGrid();
      } else {
        console.log('BeeHappy Popup: No emotes received, using defaults');
        this.setDefaultEmotes();
        this.renderEmoteGrid();
      }
    } catch (error) {
      console.error('BeeHappy Popup: Failed to load emotes:', error);
      this.setDefaultEmotes();
      this.renderEmoteGrid();
    }
  }

  setDefaultEmotes() {
    this.emotes = {
      ':poggers:': { text: '🎮POGGERS🎮', url: null },
      ':kappa:': { text: '⚡KAPPA⚡', url: null },
      ':lul:': { text: '😂LUL😂', url: null },
      ':pepehands:': { text: '😢PEPE😢', url: null }
    };
  }

  renderEmoteGrid(filter = '') {
    const grid = document.getElementById('emote-grid');
    grid.innerHTML = '';
    
    const filteredEmotes = Object.entries(this.emotes).filter(([name, emote]) => 
      name.toLowerCase().includes(filter.toLowerCase()) ||
      emote.text.toLowerCase().includes(filter.toLowerCase())
    );

    if (filteredEmotes.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #666; padding: 20px;">No emotes found</div>';
      return;
    }

    filteredEmotes.forEach(([name, emote]) => {
      const emoteItem = document.createElement('div');
      emoteItem.className = 'emote-item';
      emoteItem.title = `Click to copy: ${name}`;
      
      if (emote.url) {
        // If we have an image URL, show the image
        emoteItem.innerHTML = `<img src="${emote.url}" alt="${name}" style="width: 24px; height: 24px;"><br><small>${name}</small>`;
      } else {
        // Otherwise show the text representation
        emoteItem.innerHTML = `<div style="font-size: 16px;">${emote.text}</div><small>${name}</small>`;
      }
      
      emoteItem.addEventListener('click', () => this.copyEmoteCode(name));
      grid.appendChild(emoteItem);
    });
  }

  filterEmotes(searchTerm) {
    this.renderEmoteGrid(searchTerm);
  }

  async copyEmoteCode(emoteName) {
    try {
      // Copy to clipboard
      await navigator.clipboard.writeText(emoteName);
      
      // Show feedback
      const statusElement = document.getElementById('status');
      const originalText = statusElement.textContent;
      const originalClass = statusElement.className;
      
      statusElement.textContent = `Copied: ${emoteName}`;
      statusElement.className = 'status connected';
      
      setTimeout(() => {
        statusElement.textContent = originalText;
        statusElement.className = originalClass;
      }, 1500);
      
    } catch (error) {
      console.error('BeeHappy Popup: Failed to copy:', error);
    }
  }

  async testExtension() {
    const button = document.getElementById('test-button');
    const originalText = button.textContent;
    
    try {
      button.textContent = 'Testing...';
      button.disabled = true;
      
      // Check if we're on a YouTube page
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      
      if (!currentTab.url.includes('youtube.com')) {
        alert('Please navigate to a YouTube page first!');
        return;
      }
      
      // Send test message to content script
      const response = await chrome.tabs.sendMessage(currentTab.id, {
        action: 'test',
        message: 'BeeHappy extension is working!'
      });
      
      if (response && response.success) {
        button.textContent = 'Test Successful ✓';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      } else {
        throw new Error('No response from content script');
      }
      
    } catch (error) {
      console.error('BeeHappy Popup: Test failed:', error);
      button.textContent = 'Test Failed ✗';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    } finally {
      button.disabled = false;
    }
  }

  async refreshEmotes() {
    const button = document.getElementById('refresh-button');
    const originalText = button.textContent;
    
    try {
      button.textContent = 'Refreshing...';
      button.disabled = true;
      
      const response = await this.sendMessage({ action: 'refreshEmotes' });
      
      if (response && response.success) {
        this.emotes = response.emotes;
        this.renderEmoteGrid();
        button.textContent = 'Refreshed ✓';
      } else {
        throw new Error('Failed to refresh emotes');
      }
      
    } catch (error) {
      console.error('BeeHappy Popup: Refresh failed:', error);
      button.textContent = 'Refresh Failed ✗';
    } finally {
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 1500);
    }
  }

  async toggleOverlay() {
    const button = document.getElementById('toggle-overlay');
    const originalText = button.textContent;
    
    try {
      button.textContent = 'Toggling...';
      button.disabled = true;
      
      // Check if we're on a YouTube page
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      
      // Send toggle message to content script
      const response = await chrome.tabs.sendMessage(currentTab.id, {
        action: 'toggleOverlay'
      });
      
      if (response && response.success) {
        button.textContent = 'Overlay Toggled ✓';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      } else {
        throw new Error('Failed to toggle overlay');
      }
      
    } catch (error) {
      console.error('BeeHappy Popup: Toggle overlay failed:', error);
      button.textContent = 'Toggle Failed ✗';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    } finally {
      button.disabled = false;
    }
  }

  sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new BeeHappyPopup();
});
