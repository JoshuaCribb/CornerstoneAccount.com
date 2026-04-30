/* ═══════════════════════════════════════════════════════════════
   firebase.js — Cornerstone Council · Firestore Database
   Real-time background polling — refreshes all connected devices
   when any change is detected, no page reload needed.
═══════════════════════════════════════════════════════════════ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDFTIlaaxKQAv5EBTlLBHNJ4vOQLXVkxF8",
  authDomain: "cornerstonearchive.firebaseapp.com",
  projectId: "cornerstonearchive",
  storageBucket: "cornerstonearchive.firebasestorage.app",
  messagingSenderId: "822571240663",
  appId: "1:822571240663:web:eb10a28bcc35208013f492",
  measurementId: "G-9QZM70EKZX"
};

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

const DB = (() => {

  // ── STATUS UI ─────────────────────────────────────────────────
  function _setStatus(ok) {
    const dot = document.getElementById('gh-dot');
    const txt = document.getElementById('gh-status-txt');
    if (!dot || !txt) return;
    if (ok === true)  { dot.className = 'gh-dot on';  txt.textContent = 'Firebase connected ✓'; }
    if (ok === false) { dot.className = 'gh-dot err'; txt.textContent = 'Firebase error — check console'; }
    if (ok === null)  { dot.className = 'gh-dot on';  txt.textContent = 'Firebase — live sync active'; }
  }

  function _showSync(msg) {
    const el = document.getElementById('sync-ind');
    if (!el) return;
    el.textContent = msg || '↑ Saving...';
    el.classList.add('show');
  }
  function _hideSync() {
    const el = document.getElementById('sync-ind');
    if (el) setTimeout(() => el.classList.remove('show'), 1500);
  }

  // ── ENCODING ──────────────────────────────────────────────────
  function _encode(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number')  return { doubleValue: val };
    if (typeof val === 'string')  return { stringValue: val };
    if (Array.isArray(val))       return { arrayValue: { values: val.map(_encode) } };
    if (typeof val === 'object') {
      const fields = {};
      Object.entries(val).forEach(([k, v]) => { fields[k] = _encode(v); });
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  function _decode(val) {
    if (!val) return null;
    if ('nullValue'    in val) return null;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return Number(val.integerValue);
    if ('doubleValue'  in val) return Number(val.doubleValue);
    if ('stringValue'  in val) return val.stringValue;
    if ('arrayValue'   in val) return (val.arrayValue.values || []).map(_decode);
    if ('mapValue'     in val) {
      const out = {};
      Object.entries(val.mapValue.fields || {}).forEach(([k, v]) => { out[k] = _decode(v); });
      return out;
    }
    return null;
  }

  function _decodeDoc(doc) {
    if (!doc || !doc.fields) return null;
    const out = {};
    Object.entries(doc.fields).forEach(([k, v]) => { out[k] = _decode(v); });
    return out;
  }

  // ── REST CALLS ────────────────────────────────────────────────
  const COLLECTION = 'portal';
  const DOC_ID     = 'data';
  const DOC_URL    = `${FS_BASE}/${COLLECTION}/${DOC_ID}`;

  async function _getDoc() {
    try {
      const r = await fetch(DOC_URL);
      if (!r.ok) {
        const errText = await r.text().catch(()=>'');
        console.error('[Firebase] GET failed:', r.status, r.statusText, errText.slice(0,300));
        return null;
      }
      return _decodeDoc(await r.json());
    } catch(e) { console.error('[Firebase] GET error:', e); return null; }
  }

  async function _updateDoc(data) {
    try {
      const fields = {};
      Object.entries(data).forEach(([k, v]) => { fields[k] = _encode(v); });
      const body = JSON.stringify({ fields });
      const r = await fetch(DOC_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body
      });
      if (!r.ok) {
        const errText = await r.text().catch(()=>'');
        console.error('[Firebase] PATCH failed:', r.status, r.statusText, errText.slice(0,300));
      }
      return r.ok;
    } catch(e) { console.error('[Firebase] PATCH error:', e); return false; }
  }

  async function _createDoc(data) {
    try {
      const fields = {};
      Object.entries(data).forEach(([k, v]) => { fields[k] = _encode(v); });
      const r = await fetch(
        `${FS_BASE}/${COLLECTION}/${DOC_ID}?currentDocument.exists=false`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) }
      );
      if (r.status === 409 || !r.ok) return await _updateDoc(data);
      return r.ok;
    } catch(e) { console.error('[Firebase] POST error:', e); return false; }
  }

  // ── PULL ──────────────────────────────────────────────────────
  async function pull() {
    try {
      const data = await _getDoc();
      _setStatus(data ? true : null);
      return data;
    } catch(e) { _setStatus(false); return null; }
  }

  // ── PUSH ──────────────────────────────────────────────────────
  async function push(data) {
    _showSync('↑ Saving...');
    try {
      const payload = { version: '5.1', lastUpdated: new Date().toISOString(), ...data };
      const ok = await _updateDoc(payload) || await _createDoc(payload);
      _hideSync();
      _setStatus(ok ? true : false);
      // After a successful push, update the last-known timestamp
      // so the live listener doesn't trigger a redundant refresh
      if (ok) _lastKnownTimestamp = payload.lastUpdated;
      return ok;
    } catch(e) { _hideSync(); _setStatus(false); return false; }
  }

  // ── INIT ──────────────────────────────────────────────────────
  async function init(initialData) {
    const existing = await _getDoc();
    if (!existing) {
      await _createDoc({
        version: '5.1',
        lastUpdated: new Date().toISOString(),
        ...initialData
      });
    }
    return existing || initialData;
  }

  // ── LIVE BACKGROUND POLLING ───────────────────────────────────
  // Checks Firestore every 12 seconds. If lastUpdated has changed
  // AND the change was made by a different device (not us), it
  // pulls the new data and refreshes the current view silently.
  let _pollTimer       = null;
  let _lastKnownTimestamp = null;
  let _polling         = false;
  const POLL_INTERVAL  = 12000; // 12 seconds

  function startLiveSync() {
    if (_polling) return;
    _polling = true;
    _pollTimer = setInterval(_checkForUpdates, POLL_INTERVAL);
    console.log('[Firebase] Live sync started — checking every', POLL_INTERVAL/1000, 'seconds');
  }

  function stopLiveSync() {
    _polling = false;
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  async function _checkForUpdates() {
    // Don't poll if page is hidden (tab in background) — saves battery/quota
    if (document.hidden) return;

    try {
      // Lightweight check — fetch just the document and compare lastUpdated
      const remote = await _getDoc();
      if (!remote) return;

      const remoteTS = remote.lastUpdated;

      // First poll — just record timestamp, no refresh
      if (_lastKnownTimestamp === null) {
        _lastKnownTimestamp = remoteTS;
        return;
      }

      // If timestamp hasn't changed — nothing new
      if (remoteTS === _lastKnownTimestamp) return;

      // Something changed on another device — update everything
      _lastKnownTimestamp = remoteTS;

      // Apply remote data to Store
      if (typeof Store !== 'undefined') {
        if (remote.users?.length)          Store.users.splice(0, Infinity, ...remote.users);
        if (remote.deals?.length)          Store.deals.splice(0, Infinity, ...remote.deals);
        if (remote.spend?.length)          Store.spend.splice(0, Infinity, ...remote.spend);
        if (remote.incentives?.length)     Store.incentives.splice(0, Infinity, ...remote.incentives);
        if (remote.recruitPosts?.length)   Store.recruitPosts.splice(0, Infinity, ...remote.recruitPosts);
        if (remote.personalGoals?.length)  Store.personalGoals.splice(0, Infinity, ...remote.personalGoals);
        if (remote.monthlyReports?.length) Store.monthlyReports.splice(0, Infinity, ...remote.monthlyReports);
        if (remote.crmMembers?.length)     Store.crmMembers.splice(0, Infinity, ...remote.crmMembers);
        Store.saveLocal();
      }

      // Silently refresh the current view
      if (typeof refresh === 'function') refresh();

      // Show a subtle indicator
      _flashLiveDot();

    } catch(e) {
      // Silent fail — polling is best-effort
    }
  }

  function _flashLiveDot() {
    const ind = document.getElementById('sync-ind');
    if (!ind) return;
    ind.textContent = '⟳ Live update';
    ind.classList.add('show');
    setTimeout(() => ind.classList.remove('show'), 2000);
  }

  // ── COMPAT SHIMS ──────────────────────────────────────────────
  function updateStatus(ok) { _setStatus(ok); }
  function isConfigured()   { return true; }
  function getCfg()         { return FIREBASE_CONFIG; }
  function load()           { return FIREBASE_CONFIG; }
  function save()           {}

  return {
    pull, push, init,
    startLiveSync, stopLiveSync,
    updateStatus, isConfigured, getCfg, load, save
  };
})();

const GH = DB;
