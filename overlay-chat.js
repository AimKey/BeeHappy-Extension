// BeeHappy Overlay Chat System
let chatRootElement = null;
class BeeHappyOverlayChat {
    constructor() {
        this.overlay = null;
        this.chatContainer = null;
        this.isMinimized = false;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.messageCount = 0;
        this.maxMessages = 50; // Limit messages to prevent memory issues

        // Emote mapping
        this.emoteMap = {
            ':poggers:': '🎮',
            ':kappa:': '⚡',
            ':lul:': '😂',
            ':pepehands:': '😢',
            ':pog:': '🔥',
            ':omegalul:': '🤣',
            ':sadge:': '😭',
            ':monkas:': '😰',
            // Vietnamese test emotes
            'đi': '🎮',
            'của': '⚡',
            'và': '🔥',
            'với': '😊'
        };

        this.init();
    }

    async init() {
        console.log('🐝 Initializing BeeHappy Overlay Chat...');
        await this.createOverlay();
        this.setupEventListeners();
        this.startChatMonitoring();
    }

    async createOverlay() {
        try {
            // Fetch the overlay HTML
            const response = await fetch(chrome.runtime.getURL('overlay-chat.html'));
            const html = await response.text();

            // Create a temporary container to parse HTML
            const tempDiv = chatRootElement.createElement('div');
            tempDiv.innerHTML = html;

            // Extract the overlay element
            this.overlay = tempDiv.querySelector('.beehappy-overlay');

            if (!this.overlay) {
                console.error('🐝 Failed to create overlay from HTML');
                return;
            }

            // Inject into page
            chatRootElement.body.appendChild(this.overlay);
            this.chatContainer = this.overlay.querySelector('#chatContainer');

            console.log('🐝 Overlay created successfully');

            // Load saved position
            this.loadPosition();

        } catch (error) {
            console.error('🐝 Error creating overlay:', error);
        }
    }

    setupEventListeners() {
        if (!this.overlay) return;

        const header = this.overlay.querySelector('#overlayHeader');
        const minimizeBtn = this.overlay.querySelector('#minimizeBtn');
        const closeBtn = this.overlay.querySelector('#closeBtn');

        // Dragging functionality
        header.addEventListener('mousedown', (e) => this.startDrag(e));
        chatRootElement.addEventListener('mousemove', (e) => this.drag(e));
        chatRootElement.addEventListener('mouseup', () => this.stopDrag());

        // Control buttons
        minimizeBtn.addEventListener('click', () => this.toggleMinimize());
        closeBtn.addEventListener('click', () => this.closeOverlay());

        // Prevent text selection while dragging
        header.addEventListener('selectstart', (e) => e.preventDefault());
    }

    startDrag(e) {
        this.isDragging = true;
        const rect = this.overlay.getBoundingClientRect();
        this.dragOffset.x = e.clientX - rect.left;
        this.dragOffset.y = e.clientY - rect.top;
        this.overlay.style.cursor = 'grabbing';
    }

    drag(e) {
        if (!this.isDragging) return;

        const x = e.clientX - this.dragOffset.x;
        const y = e.clientY - this.dragOffset.y;

        // Keep overlay within viewport
        const maxX = window.innerWidth - this.overlay.offsetWidth;
        const maxY = window.innerHeight - this.overlay.offsetHeight;

        const clampedX = Math.max(0, Math.min(x, maxX));
        const clampedY = Math.max(0, Math.min(y, maxY));

        this.overlay.style.left = clampedX + 'px';
        this.overlay.style.top = clampedY + 'px';
        this.overlay.style.right = 'auto';
    }

    stopDrag() {
        if (this.isDragging) {
            this.isDragging = false;
            this.overlay.style.cursor = 'default';
            this.savePosition();
        }
    }

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        this.overlay.classList.toggle('overlay-minimized', this.isMinimized);

        const minimizeBtn = this.overlay.querySelector('#minimizeBtn');
        minimizeBtn.textContent = this.isMinimized ? '+' : '−';
        minimizeBtn.title = this.isMinimized ? 'Restore' : 'Minimize';
    }

    closeOverlay() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
            console.log('🐝 Overlay closed');
        }
    }

    savePosition() {
        if (!this.overlay) return;

        const rect = this.overlay.getBoundingClientRect();
        const position = {
            left: rect.left,
            top: rect.top
        };

        chrome.storage.local.set({ 'bh_overlay_position': position });
    }

    async loadPosition() {
        try {
            const result = await chrome.storage.local.get(['bh_overlay_position']);
            if (result.bh_overlay_position) {
                const pos = result.bh_overlay_position;
                this.overlay.style.left = pos.left + 'px';
                this.overlay.style.top = pos.top + 'px';
                this.overlay.style.right = 'auto';
            }
        } catch (error) {
            console.log('🐝 No saved position found, using default');
        }
    }

    startChatMonitoring() {
        console.log('🐝 Starting YouTube chat monitoring...');

        // Monitor for new chat messages
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 &&
                        node.tagName === 'YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER') {
                        this.processChatMessage(node);
                    }
                });
            });
        });

        // Find chat container and start observing
        const findChatContainer = () => {
            // const chatContainer = document.querySelector('yt-live-chat-renderer #items') ||
            //                     document.querySelector('#chat-messages') ||
            //                     document.querySelector('yt-live-chat-item-list-renderer');
            // console.log('=== Searching in normal DOM ===')
            // console.log('🐝 Chat container:', chatContainer);

            // let chatContainer = "Debugging other selectors"
            // Get the iframe
            const chatFrame = document.querySelector('#chatframe');
            console.log("[BeeHappy] Chat iframe:", chatFrame);

            // Get the iframe's document
            const chatDoc = chatFrame?.contentDocument || chatFrame?.contentWindow?.document;
            chatRootElement = chatDoc
            // Now you can query inside the chat iframe
            // const chatItems = chatDoc?.querySelector('#items');
            // console.log("[BeeHappy] Chat items div:", chatItems);

            const chatContainer = chatRootElement.querySelector('yt-live-chat-renderer #items') ||
                document.querySelector('#chat-messages') ||
                document.querySelector('yt-live-chat-item-list-renderer');

            if (chatFrame && chatContainer && chatRootElement) {
                console.log('[BeeHappy] ChatFrame found: ', chatFrame);
                console.log('[BeeHappy] Chat container: ', chatContainer);
                observer.observe(chatContainer, {
                    childList: true,
                    subtree: true
                });
                console.log('🐝 Chat monitoring started successfully');
                this.updateStatus('Monitoring YouTube chat');

                // Process existing messages
                this.processExistingMessages();
            } else {
                console.log('[BeeHappy] Chat container not found, retrying...');
                setTimeout(findChatContainer, 2000);
            }
        };

        findChatContainer();
    }

    processExistingMessages() {
        const existingMessages = chatRootElement.querySelectorAll('yt-live-chat-text-message-renderer');
        console.log(`🐝 Processing ${existingMessages.length} existing messages`);

        // Process last 10 messages to avoid spam
        const recentMessages = Array.from(existingMessages).slice(-10);
        recentMessages.forEach(msg => this.processChatMessage(msg));
    }

    processChatMessage(messageElement) {
        try {
            // Extract message data
            const authorElement = messageElement.querySelector('#author-name');
            const messageContentElement = messageElement.querySelector('#message');

            if (!authorElement || !messageContentElement) return;

            const author = authorElement.textContent.trim();
            const originalText = messageContentElement.textContent.trim();

            // Process emotes
            const processedText = this.processEmotes(originalText);

            // Only add to overlay if it contains emotes or is interesting
            if (processedText !== originalText || this.shouldShowMessage(originalText)) {
                this.addMessageToOverlay(author, processedText, originalText);
            }
            console.log(`🐝 Processed message from ${author}: ${originalText}`);

        } catch (error) {
            console.error('🐝 Error processing chat message:', error);
        }
    }

    shouldShowMessage(text) {
        // Show messages that contain emote patterns or Vietnamese test words
        const patterns = Object.keys(this.emoteMap);
        return patterns.some(pattern => text.includes(pattern));
    }

    processEmotes(text) {
        let processedText = text;

        // Replace emote patterns with styled spans
        for (const [pattern, emoji] of Object.entries(this.emoteMap)) {
            const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            processedText = processedText.replace(regex,
                `<span class="emote" title="${pattern}">${emoji}</span>`
            );
        }

        return processedText;
    }

    addMessageToOverlay(author, processedText, originalText) {
        if (!this.chatContainer) return;

        // Remove "no messages" placeholder
        const noMessages = this.chatContainer.querySelector('.no-messages');
        if (noMessages) {
            noMessages.remove();
        }

        // Create message element
        const messageDiv = chatRootElement.createElement('div');
        messageDiv.className = 'chat-message';
        messageDiv.innerHTML = `
            <div class="message-author">${this.escapeHtml(author)}</div>
            <div class="message-content">${processedText}</div>
        `;

        // Add to chat container
        this.chatContainer.appendChild(messageDiv);
        this.messageCount++;

        // Limit messages to prevent memory issues
        if (this.messageCount > this.maxMessages) {
            const firstMessage = this.chatContainer.querySelector('.chat-message');
            if (firstMessage) {
                firstMessage.remove();
                this.messageCount--;
            }
        }

        // Auto-scroll to bottom
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;

        console.log(`🐝 Added message from ${author}: ${originalText}`);
    }

    escapeHtml(text) {
        const div = chatRootElement.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateStatus(message) {
        const statusText = this.overlay?.querySelector('#statusText');
        if (statusText) {
            statusText.textContent = message;
        }
    }

    // Public methods for external control
    show() {
        if (this.overlay) {
            this.overlay.style.display = 'flex';
        }
    }

    hide() {
        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
    }

    toggle() {
        if (this.overlay) {
            const isVisible = this.overlay.style.display !== 'none';
            this.overlay.style.display = isVisible ? 'none' : 'flex';
        }
    }
}

// Export for use in content script
window.BeeHappyOverlayChat = BeeHappyOverlayChat;
