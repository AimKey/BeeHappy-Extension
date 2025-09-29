class BeeHappyEmotePicker {
    constructor() {
        this.currentTab = 'youtube';
        this.emotes = {
            youtube: [],
            beehappy: []
        };
        this.searchTerm = '';
        this.maxRetries = 10; // Maximum number of retries for initialization
        this.retryCount = 0;
        this.initialized = false;
        
        // Common emoji list for YouTube tab
        this.youtubeEmojis = [
            '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌',
            '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐',
            '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
            '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵',
            '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐',
            '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵'
        ];

        // Start initialization
        this.init();
    }

    async init() {
        try {
            // Initialize config if not available
            if (!window.BeeHappyEmotePickerConfig?.initialized) {
                console.log('🐝 Initializing config...');
                window.BeeHappyEmotePickerConfig = {
                    chrome: typeof chrome !== 'undefined' ? chrome : null,
                    runtime: typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime : null,
                    initialized: true,
                    apiUrl: 'https://beehappy-gfghhffadqbra6g8.eastasia-01.azurewebsites.net/Emote'
                };
            }

            // Get elements
            this.picker = document.getElementById('emotePicker');
            this.searchInput = document.getElementById('emoteSearchInput');
            this.emoteGrid = document.getElementById('emoteGrid');
            this.tabs = document.querySelectorAll('.picker-tab');

            // Wait for elements to be ready
            if (!this.picker || !this.searchInput || !this.emoteGrid || !this.tabs.length) {
                if (this.retryCount >= this.maxRetries) {
                    console.warn('🐝 Element initialization timeout, will retry later');
                    // Don't throw error, just return and let it retry when overlay is ready
                    return;
                }
                console.log('🐝 Waiting for elements...', {
                    picker: !!this.picker,
                    searchInput: !!this.searchInput,
                    emoteGrid: !!this.emoteGrid,
                    tabs: this.tabs.length
                });
                this.retryCount++;
                setTimeout(() => this.init(), 100); // Slightly longer delay
                return;
            }

            // Initialize once everything is ready
            if (!this.initialized) {
                this.initialized = true;
                this.config = window.BeeHappyEmotePickerConfig;
                console.log('🐝 Emote picker initialized');
                console.log('🐝 Picker element:', this.picker);
                console.log('🐝 Search input:', this.searchInput);
                console.log('🐝 Emote grid:', this.emoteGrid);
                console.log('🐝 Tabs:', this.tabs);
                
                // Set up the picker
                await this.setupPicker();
            }
        } catch (error) {
            console.error('🐝 Initialization error:', error);
            // Still try to set up with default emotes if possible
            if (!this.initialized && this.picker) {
                this.initialized = true;
                await this.setupPicker();
            }
        }
    }

    async setupPicker() {
        // Ensure picker starts hidden
        this.picker.classList.remove('visible');
        
        // Add ARIA attributes for accessibility
        this.tabs.forEach((tab, index) => {
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
            tab.setAttribute('id', `emote-tab-${tab.dataset.tab}`);
        });

        this.setupEventListeners();
        await this.loadEmotes();
        this.renderEmotes();
    }

    setupEventListeners() {
        // Search input handler
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => {
                this.searchTerm = this.searchInput.value.toLowerCase();
                this.renderEmotes();
            });
        }

        // Tab switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs
                this.tabs.forEach(t => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                // Add active class to clicked tab
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                
                this.currentTab = tab.dataset.tab;
                this.renderEmotes();
                
                // Update tabpanel
                const emoteGrid = document.getElementById('emoteGrid');
                if (emoteGrid) {
                    emoteGrid.setAttribute('aria-labelledby', `${tab.dataset.tab}-tab`);
                }
            });
        });

        // Close picker on escape key - DISABLED per user request
        // document.addEventListener('keydown', (e) => {
        //     if (e.key === 'Escape' && this.picker && this.picker.classList.contains('visible')) {
        //         this.hidePicker();
        //     }
        // });
    }

    // Event handler attachment removed - now handled directly in HTML

    async loadEmotes() {
        try {
            // Load YouTube emojis first (these are local so they'll always work)
            this.emotes.youtube = this.youtubeEmojis.map(emoji => ({
                id: emoji,
                name: emoji,
                type: 'youtube'
            }));

            // Then try to load BeeHappy emotes through background script
            if (this.config?.runtime && typeof this.config.runtime.sendMessage === 'function') {
                try {
                    const response = await this.config.runtime.sendMessage({ 
                        action: 'fetch_emotes',
                        url: this.config.apiUrl
                    });
                    
                    if (response?.success && Array.isArray(response.data)) {
                        this.emotes.beehappy = response.data.map(emote => ({
                            id: emote.id || '',
                            name: emote.name || `[bh:${emote.id || 'unknown'}]`,
                            url: emote.url || '',
                            type: 'beehappy'
                        }));
                    } else {
                        throw new Error('Invalid response from API');
                    }
                } catch (error) {
                    console.warn('🐝 Failed to fetch BeeHappy emotes via runtime:', error);
                    throw error;
                }
            } else {
                throw new Error('Runtime not available');
            }
        } catch (error) {
            console.warn('🐝 Error loading BeeHappy emotes:', error);
            console.info('🐝 Using default emotes as fallback');
            
            // Set some default emotes if API fails
            this.emotes.beehappy = [
                { id: 'poggers', name: '[bh:poggers]', type: 'beehappy' },
                { id: 'kappa', name: '[bh:kappa]', type: 'beehappy' },
                { id: 'lul', name: '[bh:lul]', type: 'beehappy' },
                { id: 'pepe', name: '[bh:pepe]', type: 'beehappy' },
                { id: 'test', name: '[bh:test]', type: 'beehappy' },
                { id: 'emote', name: '[bh:emote]', type: 'beehappy' }
            ];
        }
    }

    renderEmotes() {
        if (!this.emoteGrid) return;

        const emotes = this.emotes[this.currentTab];
        const filteredEmotes = this.searchTerm
            ? emotes.filter(emote => 
                emote.name.toLowerCase().includes(this.searchTerm) ||
                (emote.id && emote.id.toLowerCase().includes(this.searchTerm)))
            : emotes;

        // Create elements safely using document fragment
        const fragment = document.createDocumentFragment();

        filteredEmotes.forEach(emote => {
            const emoteElement = document.createElement('div');
            emoteElement.className = 'emote-item';
            emoteElement.setAttribute('title', emote.name);
            emoteElement.setAttribute('role', 'button');
            emoteElement.setAttribute('aria-label', `Select emote ${emote.name}`);

            if (emote.type === 'youtube') {
                const textNode = document.createTextNode(emote.name);
                emoteElement.appendChild(textNode);
            } else {
                // For BeeHappy emotes, create an image if URL exists, otherwise use text
                if (emote.url) {
                    const img = document.createElement('img');
                    img.setAttribute('src', emote.url);
                    img.setAttribute('alt', emote.name);
                    img.setAttribute('loading', 'lazy');
                    emoteElement.appendChild(img);
                } else {
                    const textNode = document.createTextNode(emote.name);
                    emoteElement.appendChild(textNode);
                }
            }

            emoteElement.addEventListener('click', () => this.selectEmote(emote));
            fragment.appendChild(emoteElement);
        });

        // Clear and update grid safely
        while (this.emoteGrid.firstChild) {
            this.emoteGrid.removeChild(this.emoteGrid.firstChild);
        }
        this.emoteGrid.appendChild(fragment);
    }

    async selectEmote(emote) {
        if (!this.picker) return;

        const textToCopy = emote?.name || '';
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(textToCopy);
                console.log('🐝 Copied emote to clipboard:', textToCopy);
            } else {
                // Fallback for environments without async clipboard API
                const ta = document.createElement('textarea');
                ta.value = textToCopy;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                try { document.execCommand('copy'); } catch (_) {}
                ta.remove();
                console.log('🐝 Copied emote to clipboard (fallback):', textToCopy);
            }
        } catch (err) {
            console.error('🐝 Failed to copy emote to clipboard:', err);
        } finally {
            // Hide picker after selection
            this.hidePicker();
        }
    }

    togglePicker() {
        console.log('🐝 togglePicker() called from:', new Error().stack);
        if (!this.picker) {
            console.error('🐝 Picker element not found');
            return;
        }
        
        const isVisible = this.picker.classList.contains('visible');
        console.log('🐝 Picker currently visible:', isVisible);
        if (isVisible) {
            console.log('🐝 Calling hidePicker() from togglePicker');
            this.hidePicker();
        } else {
            console.log('🐝 Calling showPicker() from togglePicker');
            this.showPicker();
        }
    }

    showPicker() {
        console.log('🐝 Show picker called');
        if (!this.picker) {
            console.error('🐝 Picker element not found in showPicker');
            return;
        }
        
        // Simply add the visible class
        this.picker.classList.add('visible');
        console.log('🐝 Picker classes after show:', this.picker.className);
        
        // Ensure picker stays within viewport
        this.adjustPickerPosition();
        
        const emoteBtn = document.getElementById('emoteBtn');
        if (emoteBtn) {
            emoteBtn.classList.add('active');
            console.log('🐝 Emote button set to active');
        }
        
        // Focus the search input when picker opens
        if (this.searchInput) {
            setTimeout(() => this.searchInput.focus(), 100);
        }
    }

    adjustPickerPosition() {
        if (!this.picker) return;
        
        const rect = this.picker.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // If picker goes above viewport, position it below the button instead
        if (rect.top < 0) {
            this.picker.style.bottom = 'auto';
            this.picker.style.top = '100%';
            this.picker.style.marginTop = '8px';
            this.picker.style.marginBottom = '0';
            this.picker.style.borderRadius = '0 0 12px 12px';
        } else {
            // Reset to default position (above button)
            this.picker.style.bottom = '100%';
            this.picker.style.top = 'auto';
            this.picker.style.marginTop = '0';
            this.picker.style.marginBottom = '8px';
            this.picker.style.borderRadius = '12px';
        }
        
        // If picker goes off the right edge, adjust right position
        if (rect.right > viewportWidth) {
            this.picker.style.right = '0';
            this.picker.style.left = 'auto';
        }
    }

    hidePicker() {
        console.log('🐝 hidePicker() called from:', new Error().stack);
        if (!this.picker) return;
        
        // Simply remove the visible class
        this.picker.classList.remove('visible');
        console.log('🐝 Picker hidden, classes:', this.picker.className);
        
        const emoteBtn = document.getElementById('emoteBtn');
        if (emoteBtn) {
            emoteBtn.classList.remove('active');
        }
        
        // Clear search when hiding
        if (this.searchInput) {
            this.searchInput.value = '';
            this.searchTerm = '';
        }
    }

    // Test method to verify toggle works
    testToggle() {
        console.log('🐝 Testing toggle function...');
        console.log('🐝 Picker element:', this.picker);
        console.log('🐝 Picker display style:', this.picker ? this.picker.style.display : 'N/A');
        console.log('🐝 Picker classes:', this.picker ? this.picker.className : 'N/A');
        this.togglePicker();
    }

    // Method to manually trigger initialization when overlay is ready
    retryInit() {
        console.log('🐝 Manually retrying initialization...');
        this.retryCount = 0; // Reset retry count
        this.init();
    }

    // Cleanup method removed - no longer needed with HTML onclick
}

// Initialize when the document is ready
let emotePickerInstance = null;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!emotePickerInstance) {
            emotePickerInstance = new BeeHappyEmotePicker();
            // Expose for testing
            window.beeHappyEmotePicker = emotePickerInstance;
        }
    });
} else {
    if (!emotePickerInstance) {
        emotePickerInstance = new BeeHappyEmotePicker();
        // Expose for testing
        window.beeHappyEmotePicker = emotePickerInstance;
    }
}
