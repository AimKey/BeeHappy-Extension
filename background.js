// BeeHappy Background Service Worker

// Handle API requests from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetch_emotes') {
        fetchEmotes(request.url)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => {
                console.error('🐝 API Error:', error);
                sendResponse({ 
                    success: false, 
                    error: error.message || 'Failed to fetch emotes'
                });
            });
        return true; // Keep the message channel open for async response
    }

    if (request.action === 'inject_helper_all_frames') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id, allFrames: true },
                    files: ['emote-picker.js']
                }).then(() => {
                    sendResponse({ success: true });
                }).catch((error) => {
                    console.error('🐝 Script Injection Error:', error);
                    sendResponse({ 
                        success: false, 
                        error: error.message || 'Failed to inject script'
                    });
                });
            }
        });
        return true;
    }
});

// Fetch emotes from BeeHappy API with proper headers and error handling
async function fetchEmotes(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Origin': 'https://www.youtube.com'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Invalid content type: Expected JSON');
        }

        const data = await response.json();
        
        if (!Array.isArray(data)) {
            throw new Error('Invalid response format: Expected array');
        }

        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('API request timed out');
        }
        throw error;
    }
}

// Listen for installation/update
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        // Clear any old data and set up initial state
        chrome.storage.local.clear();
        console.log('🐝 Extension installed/updated');
    }
});
