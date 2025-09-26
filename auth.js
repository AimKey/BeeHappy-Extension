class BeeHappyAuth {
  constructor() {
    this.token = null;
    this.user = null;
  }

  async login(credentials) {
    try {
      const response = await fetch('https://your-api.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      
      const data = await response.json();
      this.token = data.token;
      this.user = data.user;
      
      // Store in extension storage
      chrome.storage.local.set({
        'bh_token': this.token,
        'bh_user': this.user
      });
      
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  async loadStoredAuth() {
    const result = await chrome.storage.local.get(['bh_token', 'bh_user']);
    this.token = result.bh_token;
    this.user = result.bh_user;
    return !!this.token;
  }
}