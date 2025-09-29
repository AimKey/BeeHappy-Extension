// BeeHappy Emote Picker Configuration
(() => {
    // Initialize config immediately - Chrome APIs should be available in extension context
    try {
        window.BeeHappyEmotePickerConfig = {
            chrome: chrome,
            runtime: chrome.runtime,
            initialized: true,
            apiUrl: 'https://beehappy-gfghhffadqbra6g8.eastasia-01.azurewebsites.net/Emote'
        };

        // Notify that config is ready
        document.dispatchEvent(new CustomEvent('beehappy-config-ready'));
        console.log('🐝 Config initialized');
    } catch (error) {
        console.warn('🐝 Chrome APIs not available, using fallback config');
        // Fallback config for cases where Chrome APIs aren't available
        window.BeeHappyEmotePickerConfig = {
            chrome: null,
            runtime: null,
            initialized: true,
            apiUrl: 'https://beehappy-gfghhffadqbra6g8.eastasia-01.azurewebsites.net/Emote'
        };
        document.dispatchEvent(new CustomEvent('beehappy-config-ready'));
    }
})();
