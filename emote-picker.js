class BeeHappyEmotePicker {
    constructor() {
        this.currentTab = 'youtube';
        this.emotes = {
            youtube: [],
            beehappy: []
        };
        this.searchTerm = '';
        this.maxRetries = 30; // Maximum number of retries for initialization
        this.retryCount = 0;
        this.initialized = false;
        this.beeHappyRefreshedOnce = false;

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
                    apiUrl: 'https://beehappy-gfghhffadqbra6g8.eastasia-01.azurewebsites.net/api/emotes'
                };
            }

            // Get elements
            this.picker = document.getElementById('emotePicker');
            this.searchInput = document.getElementById('emoteSearchInput');
            // Two dedicated grids (one per tab)
            this.emoteGridYoutube = document.getElementById('emoteGridYoutube');
            this.emoteGridBeeHappy = document.getElementById('emoteGridBeeHappy');
            this.tabs = document.querySelectorAll('.picker-tab');

            // Wait for elements to be ready
            if (!this.picker || !this.searchInput || !this.emoteGridYoutube || !this.emoteGridBeeHappy || !this.tabs.length) {
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
                setTimeout(() => this.init(), 1000); // Slightly longer delay
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
            // Retry until the max retries is reached
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`🐝 Retrying initialization (${this.retryCount}/${this.maxRetries})...`);
                setTimeout(() => this.init(), 500);
            } else {
                // Still try to set up with default emotes if possible
                if (!this.initialized && this.picker) {
                    this.initialized = true;
                    await this.setupPicker();
                }
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
            // Keep original IDs from HTML (youtube-tab / beehappy-tab)
        });

        this.setupEventListeners();
        // Ensure centralized emote map is ready and subscribe to updates
        try { await window.BeeHappyEmotes?.init?.(); } catch (_) { }
        // Subscribe so the picker updates whenever the backend fetch completes
        window.BeeHappyEmotes?.onUpdate?.((map, regex, list) => {
            console.log('🐝 [Picker] onUpdate received list:', Array.isArray(list) ? list : []);
            // If the list is empty don't update
            if (!Array.isArray(list) || list.length === 0) {
                console.warn('🐝 [Picker] onUpdate received empty list, skipping update');
                return;
            }

            if (Array.isArray(list)) {
                this.updateBeeHappyFromList(list);
                // Pre-populate BeeHappy grid once data arrives
                this.renderInto('beehappy');
                if (this.currentTab === 'beehappy') this.renderEmotes();
            }
        });

        await this.loadEmotes();
        // Preload both grids so switching tabs is instant
        this.renderInto('youtube');
        this.renderInto('beehappy');
        // Ensure initial tab visibility and content
        const yt = this.emoteGridYoutube;
        const bh = this.emoteGridBeeHappy;
        if (yt && bh) {
            yt.classList.remove('hidden');
            bh.classList.add('hidden');
        }
        this.currentTab = 'youtube';
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

                // Update tabpanel
                const yt = this.emoteGridYoutube;
                const bh = this.emoteGridBeeHappy;
                if (yt && bh) {
                    if (this.currentTab === 'youtube') {
                        yt.classList.remove('hidden');
                        bh.classList.add('hidden');
                        yt.setAttribute('aria-labelledby', 'youtube-tab');
                    } else {
                        bh.classList.remove('hidden');
                        yt.classList.add('hidden');
                        bh.setAttribute('aria-labelledby', 'beehappy-tab');
                    }
                }

                // No auto-fetch on switch; grids are preloaded
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

            // Then load BeeHappy emotes from centralized list
            const list = window.BeeHappyEmotes?.getList?.() || [];
            console.log('🐝 [Picker] initial BeeHappy list:', list);
            this.updateBeeHappyFromList(list);

            if (!list.length && !this.beeHappyRefreshedOnce) {
                this.beeHappyRefreshedOnce = true;
                try { await window.BeeHappyEmotes?.refreshFromApi?.(); } catch (_) { }
                console.log('🐝 [Picker] refreshFromApi triggered');
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

    renderInto(tab) {
        const prev = this.currentTab;
        this.currentTab = tab;
        this.renderEmotes();
        this.currentTab = prev;
    }

    updateBeeHappyFromList(list) {
        if (!Array.isArray(list)) return;
        console.log('🐝 [Picker] mapping list to emotes:', list);
        this.emotes.beehappy = list.map(item => ({
            id: item.token,
            name: item.token, // use token as the value we copy
            url: item.url || '',
            type: 'beehappy',
            label: item.name || item.token
        }));
    }

    // ensureBeeHappyList removed – grids are preloaded and updated via onUpdate

    renderEmotes() {
        const grid = this.currentTab === 'youtube' ? this.emoteGridYoutube : this.emoteGridBeeHappy;
        if (!grid) {
            console.warn('🐝 [Picker] renderEmotes: emoteGrid not ready');
            return;
        }

        const emotes = this.emotes[this.currentTab] || [];
        console.log('🐝 [Picker] renderEmotes tab=', this.currentTab, 'count=', emotes.length);
        const filteredEmotes = this.searchTerm
            ? emotes.filter(emote =>
                emote.name.toLowerCase().includes(this.searchTerm) ||
                (emote.id && emote.id.toLowerCase().includes(this.searchTerm)))
            : emotes;

        console.log('🐝 [Picker] renderEmotes filtered count=', filteredEmotes.length);

        // Create elements using the same ownerDocument as the target grid
        const fragment = (grid?.ownerDocument || document).createDocumentFragment();

        emotes.forEach(emote => {
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
                    img.setAttribute('width', '32');
                    img.setAttribute('height', '32');
                    img.style.maxWidth = '32px';
                    img.style.maxHeight = '32px';
                    img.style.display = 'block';
                    emoteElement.appendChild(img);
                }
                // Always show a small label under image or text
                const label = document.createElement('div');
                label.style.fontSize = '10px';
                label.style.marginTop = '4px';
                label.style.opacity = '0.8';
                label.textContent = emote.label || emote.name;
                // emoteElement.appendChild(label);
            }

            emoteElement.addEventListener('click', () => this.selectEmote(emote));
            fragment.appendChild(emoteElement);
        });

        // Clear and update grid safely
        while (grid.firstChild) {
            grid.removeChild(grid.firstChild);
        }
        grid.appendChild(fragment);
        console.log('🐝 [Picker] renderEmotes appended nodes, grid children=', grid.childElementCount);
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
                try { document.execCommand('copy'); } catch (_) { }
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
