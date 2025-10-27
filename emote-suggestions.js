if (window.top !== window) {
  // Suggestion system only runs in the top window where we can reach the chat iframe
} else {
  class BeeHappyEmoteSuggestions {
    constructor() {
      this.chatDoc = null;
      this.chatInput = null;
      this.container = null;
      this.visible = false;
      this.currentEmotes = [];
      this.lastQuery = "";
      this.maxResults = 8;
      this.activeIndex = -1;
      this.isReady = false;
      this.pendingInit = false;
      this.hasRegisteredUpdateListener = false;
      this.bootstrapAttempts = 0;
      this.maxBootstrapAttempts = 20; // 20 attempts * 3s = 60 seconds
      this.bootstrapTimer = null;
      this.bootstrapRetryDelay = 3000;
      this.healthCheckTimer = null;
      this.healthCheckInterval = 2000;
      this.healthCheckMissThreshold = 3;
      this.healthCheckMissCount = 0;

      this.handleInputEvent = this.handleInputEvent.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleClickOutside = this.handleClickOutside.bind(this);
      this.handleBlur = this.handleBlur.bind(this);

      this.setupListeners();
      this.bootstrapIfReady();
    }

    setupListeners() {
      console.log("[EmoteSuggestions] Setting up listeners");
      document.addEventListener("BeeHappy:ExtensionReady", () => {
        console.log("[EmoteSuggestions] Received BeeHappy:ExtensionReady event");
        this.bootstrapIfReady();
      });

      // Keep emote catalogue in sync with central map updates
      this.registerUpdateListener();
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request?.action === "url_changed") {
          console.log("[EmoteSuggestions] url_changed received, resetting state");
          setTimeout(() => {
            this.resetState();
            this.bootstrapIfReady();
          }, 1500);
        }
        return false;
      });
    }

    scheduleBootstrapRetry(reason) {
      if (this.bootstrapAttempts >= this.maxBootstrapAttempts) {
        console.warn("[EmoteSuggestions] Bootstrap retry limit reached", { reason });
        this.pendingInit = false;
        return;
      }

      if (this.bootstrapTimer) {
        clearTimeout(this.bootstrapTimer);
      }

      console.log("[EmoteSuggestions] Scheduling bootstrap retry", {
        attempt: this.bootstrapAttempts,
        maxAttempts: this.maxBootstrapAttempts,
        reason,
      });

      this.bootstrapTimer = setTimeout(() => {
        this.pendingInit = false;
        this.bootstrapIfReady();
      }, this.bootstrapRetryDelay);
    }

    rescheduleBootstrap(reason) {
      this.pendingInit = false;
      this.scheduleBootstrapRetry(reason);
    }

    startHealthCheck() {
      this.stopHealthCheck();
      this.healthCheckMissCount = 0;
      this.healthCheckTimer = setInterval(() => {
        if (!this.chatInput || !this.chatDoc) {
          this.healthCheckMissCount += 1;
        } else {
          const inputConnected = this.chatInput.isConnected;
          const docMatch = this.chatInput.ownerDocument === this.chatDoc;
          const docReady = this.chatDoc.readyState !== "loading";

          if (!inputConnected || !docMatch || !docReady) {
            this.healthCheckMissCount += 1;
          } else {
            this.healthCheckMissCount = 0;
          }
        }

        if (this.healthCheckMissCount >= this.healthCheckMissThreshold) {
          console.warn("[EmoteSuggestions] Chat input no longer available, resetting", {
            missCount: this.healthCheckMissCount,
          });
          this.healthCheckMissCount = 0;
          this.resetState("chat-disconnected");
          this.scheduleBootstrapRetry("chat-disconnected");
        }
      }, this.healthCheckInterval);
    }

    stopHealthCheck() {
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      }
      this.healthCheckMissCount = 0;
    }

    async bootstrapIfReady() {
      if (this.isReady || this.pendingInit) {
        console.log("[EmoteSuggestions] bootstrapIfReady skipped", { isReady: this.isReady, pendingInit: this.pendingInit });
        return;
      }

      if (this.bootstrapAttempts >= this.maxBootstrapAttempts) {
        console.warn("[EmoteSuggestions] Max bootstrap attempts reached");
        return;
      }

      this.pendingInit = true;
      this.bootstrapAttempts += 1;

      if (!window.BeeHappyEmotes || typeof window.BeeHappyEmotes.init !== "function") {
        console.log("[EmoteSuggestions] BeeHappyEmotes not ready yet");
        this.rescheduleBootstrap("emote-map-not-ready");
        return;
      }

      try {
        console.log("[EmoteSuggestions] Calling BeeHappyEmotes.init()");
        const emotesReady = await window.BeeHappyEmotes.init();
        if (!emotesReady) {
          console.warn("[EmoteSuggestions] BeeHappyEmotes.init returned false");
          this.rescheduleBootstrap("emote-map-init-false");
          return;
        }
        this.updateCatalogueFromLists(window.BeeHappyEmotes.getLists?.() || {});

        const chatDoc = await this.getChatDoc();
        if (!chatDoc) {
          console.warn("[EmoteSuggestions] Chat document unavailable during bootstrap");
          this.rescheduleBootstrap("chat-doc-missing");
          return;
        }

        const chatInput = this.findChatInput(chatDoc);
        if (!chatInput) {
          console.warn("[EmoteSuggestions] Chat input not found during bootstrap");
          this.rescheduleBootstrap("chat-input-missing");
          return;
        }

        this.chatDoc = chatDoc;
        this.chatInput = chatInput;
        this.ensureContainer();
        this.registerUpdateListener();

        this.chatInput.addEventListener("input", this.handleInputEvent);
        this.chatInput.addEventListener("keydown", this.handleKeydown);
        this.chatInput.addEventListener("blur", this.handleBlur);
        chatDoc.addEventListener("click", this.handleClickOutside);

        this.isReady = true;
        this.startHealthCheck();
        console.log("[EmoteSuggestions] Ready", {
          emoteCount: this.currentEmotes.length,
          inputSelector: this.chatInput?.id || this.chatInput?.className,
        });
        if (this.bootstrapTimer) {
          clearTimeout(this.bootstrapTimer);
          this.bootstrapTimer = null;
        }
        this.bootstrapAttempts = 0;
      } catch (error) {
        console.error("[EmoteSuggestions] Bootstrap failed", error);
        this.rescheduleBootstrap("bootstrap-error");
      } finally {
        this.pendingInit = false;
      }
    }

    resetState(reason = "unknown") {
      console.log("[EmoteSuggestions] resetState invoked", {
        reason,
        wasReady: this.isReady,
        pendingInit: this.pendingInit,
      });

      this.stopHealthCheck();

      if (this.chatInput) {
        this.chatInput.removeEventListener("input", this.handleInputEvent);
        this.chatInput.removeEventListener("keydown", this.handleKeydown);
        this.chatInput.removeEventListener("blur", this.handleBlur);
      }

      if (this.chatDoc) {
        this.chatDoc.removeEventListener("click", this.handleClickOutside);
      }

      this.hideSuggestions();

      if (this.container) {
        this.container.style.display = "none";
        this.container.innerHTML = "";
        if (this.container.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
      }

      this.container = null;
      this.chatDoc = null;
      this.chatInput = null;
      this.isReady = false;
      this.pendingInit = false;
      this.visible = false;
      this.activeIndex = -1;
      this.lastQuery = "";
      this.bootstrapAttempts = 0;

      if (this.bootstrapTimer) {
        clearTimeout(this.bootstrapTimer);
        this.bootstrapTimer = null;
      }
    }

    handleBlur() {
      this.hideSuggestions();
    }

    registerUpdateListener() {
      if (this.hasRegisteredUpdateListener) {
        return;
      }

      if (window.BeeHappyEmotes?.onUpdate) {
        window.BeeHappyEmotes.onUpdate((map, regex, lists = {}) => {
          this.updateCatalogueFromLists(lists);
          if (this.visible && this.chatInput) {
            this.handleInputEvent();
          }
        });
        this.hasRegisteredUpdateListener = true;
      }
    }

    async getChatDoc(maxRetries = 10, retryDelay = 500) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const doc = this.getChatDocSingle();
        if (doc) {
          return doc;
        }
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
      return null;
    }

    getChatDocSingle() {
      const selectors = [
        "#chatframe",
        "iframe#chatframe",
        'iframe[src*="live_chat"]',
        'iframe[src*="chat"]'
      ];

      let chatFrame = null;
      for (const selector of selectors) {
        chatFrame = document.querySelector(selector);
        if (chatFrame) break;
      }

      if (!chatFrame) {
        console.log("[EmoteSuggestions] chatFrame not found yet");
      }

      if (chatFrame) {
        try {
          const chatDoc = chatFrame.contentDocument || chatFrame.contentWindow?.document;
          if (chatDoc && chatDoc.readyState !== "loading") {
            return chatDoc;
          }
        } catch (_) {
          return null;
        }
      }

      return null;
    }

    findChatInput(chatDoc) {
      const selectors = [
        "#input.yt-live-chat-text-input-field-renderer",
        "#input #contenteditable-root",
        "#contenteditable-root",
      ];

      for (const selector of selectors) {
        const node = chatDoc.querySelector(selector);
        if (node) {
          console.log("[EmoteSuggestions] Found chat input with selector", selector);
          return node;
        }
      }
      console.warn("[EmoteSuggestions] Chat input selectors exhausted without match");
      return null;
    }

    ensureContainer() {
      if (this.container) return;
      const doc = this.chatDoc || document;
      const host = doc.createElement("div");
      host.id = "bh-emote-suggestion-panel";
      host.style.position = "absolute";
      host.style.zIndex = "99999";
      host.style.minWidth = "200px";
      host.style.maxWidth = "280px";
      host.style.background = "rgba(18, 18, 18, 0.95)";
      host.style.border = "1px solid rgba(124, 58, 237, 0.5)";
      host.style.borderRadius = "8px";
      host.style.boxShadow = "0 6px 24px rgba(0,0,0,0.35)";
      host.style.padding = "6px 0";
      host.style.display = "none";
      host.style.backdropFilter = "blur(6px)";
      host.style.color = "#f8f7ff";
      host.style.fontSize = "14px";
      host.style.lineHeight = "1.3";

      doc.body.appendChild(host);
      this.container = host;
      console.log("[EmoteSuggestions] Suggestion container created");
    }

    updateCatalogueFromLists(lists) {
      const globalList = Array.isArray(lists.global) ? lists.global : [];
      const streamerList = Array.isArray(lists.streamer) ? lists.streamer : [];
      const combined = [...globalList, ...streamerList];

      this.currentEmotes = combined.map((item) => ({
        token: item?.token || item?.name || "",
        label: item?.name || item?.token || "",
        url: item?.url || "",
        scope: item?.type || "global",
        byUser: item?.byUser || "",
      })).filter((entry) => entry.token);
      console.log("[EmoteSuggestions] Catalogue updated", {
        total: this.currentEmotes.length,
        global: globalList.length,
        streamer: streamerList.length,
      });
    }

    handleInputEvent() {
      if (!this.chatInput) return;
      const text = this.chatInput.textContent || "";
      const caretWord = this.extractCurrentWord(text);
      console.log("[EmoteSuggestions] Input event", { text, caretWord });

      if (!caretWord || caretWord.length < 2) {
        this.hideSuggestions();
        return;
      }

      if (caretWord === this.lastQuery) {
        return;
      }

      this.lastQuery = caretWord;
      const suggestions = this.lookupSuggestions(caretWord);
      console.log("[EmoteSuggestions] Suggestions lookup", {
        query: caretWord,
        count: suggestions.length,
      });
      if (!suggestions.length) {
        this.hideSuggestions();
        return;
      }

      this.renderSuggestions(suggestions);
      this.positionPanel();
    }

    handleKeydown(event) {
      if (!this.visible) return;
      const key = event.key;
      console.log("[EmoteSuggestions] Keydown", key);

      if (key === "ArrowDown" || key === "ArrowUp") {
        event.preventDefault();
        const delta = key === "ArrowDown" ? 1 : -1;
        this.moveActive(delta);
      } else if (key === "Enter" || key === "Tab") {
        if (this.activeIndex >= 0) {
          event.preventDefault();
          const item = this.container?.querySelectorAll(".bh-suggestion-item")[this.activeIndex];
          item?.click();
        }
      } else if (key === "Escape") {
        this.hideSuggestions();
      }
    }

    handleClickOutside(event) {
      if (!this.visible) return;
      if (!this.container) return;

      const target = event.target;
      if (this.container.contains(target) || target === this.chatInput) {
        return;
      }

      this.hideSuggestions();
    }

    extractCurrentWord(text) {
      if (!text) return "";
      const trimmed = text.replace(/\u00A0/g, " ");
      const match = trimmed.match(/([\w:\[\]\-]+)$/i);
      if (!match) return "";
      return match[1];
    }

    lookupSuggestions(partial) {
      const lowered = partial.toLowerCase();
      const normalizedQuery = this.normalizeForMatch(lowered);
      const matches = this.currentEmotes.filter((entry) => {
        const tokenLower = entry.token.toLowerCase();
        const labelLower = entry.label.toLowerCase();

        if (tokenLower.startsWith(lowered) || labelLower.startsWith(lowered)) {
          return true;
        }

        if (normalizedQuery) {
          const normalizedToken = this.normalizeForMatch(tokenLower);
          const normalizedLabel = this.normalizeForMatch(labelLower);
          if (
            (normalizedToken && normalizedToken.startsWith(normalizedQuery)) ||
            (normalizedLabel && normalizedLabel.startsWith(normalizedQuery))
          ) {
            return true;
          }
        }

        return false;
      });
      return matches.slice(0, this.maxResults);
    }

    normalizeForMatch(value) {
      if (!value) return "";
      try {
        return value
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/gi, "")
          .toLowerCase();
      } catch (_) {
        return value.toLowerCase();
      }
    }

    renderSuggestions(items) {
      if (!this.container) return;
      this.container.innerHTML = "";

      console.log("[EmoteSuggestions] Rendering suggestions", items.length);
      items.forEach((item, index) => {
        const row = this.chatDoc.createElement("div");
        row.className = "bh-suggestion-item";
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.padding = "6px 12px";
        row.style.cursor = "pointer";
        row.style.transition = "background 120ms ease";

        row.addEventListener("mouseenter", () => {
          this.setActiveIndex(index);
        });

        row.addEventListener("mouseleave", () => {
          this.clearActiveIndex();
        });

        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          this.setActiveIndex(index);
        });

        row.addEventListener("click", () => {
          this.applySuggestion(item);
        });

        if (item.url) {
          const img = this.chatDoc.createElement("img");
          img.src = item.url;
          img.alt = item.token;
          img.style.width = "32px";
          img.style.height = "32px";
          img.style.objectFit = "contain";
          img.style.borderRadius = "6px";
          row.appendChild(img);
        }

        const textWrap = this.chatDoc.createElement("div");
        textWrap.style.display = "flex";
        textWrap.style.flexDirection = "column";
        textWrap.style.fontSize = "13px";
        textWrap.style.lineHeight = "1.25";

        const labelEl = this.chatDoc.createElement("span");
        labelEl.textContent = item.label || item.token;
        labelEl.style.fontWeight = "600";
        textWrap.appendChild(labelEl);

        const tokenEl = this.chatDoc.createElement("span");
        tokenEl.textContent = item.token;
        tokenEl.style.color = "#c7b8ff";
        tokenEl.style.fontSize = "12px";
        textWrap.appendChild(tokenEl);

        row.appendChild(textWrap);
        this.container.appendChild(row);
      });

      this.container.style.display = "block";
      this.visible = true;
      this.activeIndex = items.length ? 0 : -1;
      this.highlightActive();
    }

    positionPanel() {
      if (!this.container || !this.chatInput) return;
      const rect = this.chatInput.getBoundingClientRect();
      const view = this.chatDoc?.defaultView;
      const scrollX = view ? view.scrollX : 0;
      const scrollY = view ? view.scrollY : 0;
      const panelRect = this.container.getBoundingClientRect();
      const panelHeight = panelRect.height || this.container.offsetHeight || 0;

      const preferredTop = rect.top + scrollY - panelHeight - 6;
      const fallbackTop = rect.bottom + scrollY + 6;

      this.container.style.left = `${rect.left + scrollX}px`;
      this.container.style.top = `${preferredTop >= 0 ? preferredTop : fallbackTop}px`;
      console.log("[EmoteSuggestions] Panel positioned", {
        left: this.container.style.left,
        top: this.container.style.top,
        preferredTop,
        fallbackTop,
      });
    }

    moveActive(delta) {
      if (!this.container) return;
      const items = this.container.querySelectorAll(".bh-suggestion-item");
      if (!items.length) return;

      this.activeIndex = (this.activeIndex + delta + items.length) % items.length;
      this.highlightActive();
    }

    setActiveIndex(index) {
      this.activeIndex = index;
      this.highlightActive();
    }

    highlightActive() {
      if (!this.container) return;
      const items = this.container.querySelectorAll(".bh-suggestion-item");
      items.forEach((item, idx) => {
        if (idx === this.activeIndex) {
          item.style.background = "rgba(124, 58, 237, 0.3)";
        } else {
          item.style.background = "transparent";
        }
      });
    }

    clearActiveIndex() {
      this.activeIndex = -1;
      this.highlightActive();
    }

    async applySuggestion(emote) {
      if (!this.chatInput) return;
      const rawText = this.chatInput.textContent || "";
      // Make sure to clear the previous word being typed
      const currentWord = this.extractCurrentWord(rawText);
      const base = currentWord ? rawText.slice(0, rawText.length - currentWord.length) : rawText;
      const nextValue = `${base}${emote.token} `;

      this.chatInput.textContent = nextValue;
      this.placeCaretAtEnd(this.chatInput);

      console.log("[EmoteSuggestions] Applying suggestion", emote.token);

      this.chatInput.dispatchEvent(new InputEvent("input", { bubbles: true }));
      // insertEmote(emote.token);
      this.hideSuggestions();
    }

    placeCaretAtEnd(el) {
      el.focus();
      const selection = this.chatDoc.getSelection?.() || window.getSelection();
      if (!selection) return;
      selection.removeAllRanges();
      const range = this.chatDoc.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.addRange(range);
    }

    hideSuggestions() {
      if (!this.container || !this.visible) return;
      this.container.style.display = "none";
      this.container.innerHTML = "";
      this.visible = false;
      this.activeIndex = -1;
      this.lastQuery = "";
    }
  }

  if (!window.BeeHappySuggestionManager) {
    window.BeeHappySuggestionManager = new BeeHappyEmoteSuggestions();
  }
}
