// Centralized BeeHappy emote map with storage + API refresh hooks
(function(){
  const DEFAULT_MAP = {
    '[bh:poggers]': '🎮POGGERS🎮',
    '[bh:kappa]': '⚡KAPPA⚡',
    '[bh:lul]': '😂LUL😂',
    '[bh:pepe]': '😢PEPE😢',
    // Vietnamese examples
    '[bh:quay_đều]': '🎮QUAY ĐỀU🎮',
    '[bh:độ_mixi]': '⚡ĐỘ MIXI⚡',
    '[bh:test]': '🎮',
    '[bh:emote]': '⚡',
    '[bh:fire]': '🔥',
    '[bh:smile]': '😊'
  };

  const STORAGE_KEY = 'bh_emote_map_v1';
  const API_URL = 'https://beehappy-gfghhffadqbra6g8.eastasia-01.azurewebsites.net/api/emotes'; // Production
  // const API_URL = 'https://localhost:7256/api/emotes'; // Development


  const state = {
    map: null,   // token → replacement text
    regex: null, // combined token regex
    list: [],    // [{ token, name, url }]
    listeners: []
  };

  function buildRegex(map){
    const escapeToken = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = Object.keys(map || {}).map(escapeToken);
    return parts.length ? new RegExp(parts.join('|'), 'g') : null;
  }

  async function loadFromStorage(){
    try{
      const data = await chrome.storage.local.get([STORAGE_KEY, STORAGE_KEY+':list']);
      const map = data && data[STORAGE_KEY] && typeof data[STORAGE_KEY] === 'object' ? data[STORAGE_KEY] : null;
      const list = Array.isArray(data?.[STORAGE_KEY+':list']) ? data[STORAGE_KEY+':list'] : [];
      if (map) return { map, list };
    }catch(_){ /* ignore */ }
    return null;
  }

  async function saveToStorage(map, list){
    const payload = { [STORAGE_KEY]: map };
    if (Array.isArray(list)) payload[STORAGE_KEY+':list'] = list;
    try{ await chrome.storage.local.set(payload); }catch(_){ /* ignore */ }
  }

  async function ensureInitialized(){
    if (state.map) return;
    const stored = await loadFromStorage();
    state.map = stored?.map || DEFAULT_MAP;
    state.regex = buildRegex(state.map);
    state.list = stored?.list || [];
    if (!stored) saveToStorage(state.map, state.list);
  }

  let _inFlight = false;
  async function refreshFromApi(){
    // Ask background to fetch (handles CORS/timeouts)
    try{
      if (_inFlight) { console.log('🐝[DEBUG] refresh skipped (in flight)'); return false; }
      _inFlight = true;
      const resp = await chrome.runtime.sendMessage({ action: 'fetch_emotes', url: API_URL });
      console.log('🐝[DEBUG] Refresh / Getting all emotes from backend:', resp);
      if (!resp || !resp.success || !Array.isArray(resp.data)) return false;
      // Normalize into token map and a list suitable for the picker
      const base = new URL(API_URL, location.origin);
      const toAbs = (u) => { try { return new URL(u, base).toString(); } catch(_) { return String(u || ''); } };
      const slugify = (s) => (s || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'emote';

      const next = { ...state.map };
      const list = [];
      resp.data.forEach(item => {
        if (!item || typeof item.name !== 'string') return;
        const slug = slugify(item.name);
        const token = `[bh:${slug}]`;
        const file = Array.isArray(item.files) && item.files.length ? item.files[0] : null;
        const url = file?.url ? toAbs(file.url) : '';
        list.push({ token, name: item.name, url });
        if (!next[token]) next[token] = item.name; // textual fallback replacement
      });

      state.map = next;
      state.regex = buildRegex(state.map);
      state.list = list;
      await saveToStorage(state.map, state.list);
      state.listeners.forEach(fn => { try{ fn(state.map, state.regex, state.list); }catch(_){ } });
      return true;
    }catch(_){ return false; }
    finally { _inFlight = false; }
  }

  window.BeeHappyEmotes = {
    init: async () => { await ensureInitialized(); },
    getMap: () => state.map || DEFAULT_MAP,
    getRegex: () => state.regex || buildRegex(DEFAULT_MAP),
    getList: () => state.list || [],
    onUpdate: (fn) => { if (typeof fn === 'function') state.listeners.push(fn); },
    refreshFromApi
  };
})();


