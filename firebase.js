/* ═══════════════════════════════════════════════════════════════
   firebase.js — Cornerstone Council · Firestore Database
   
   Replaces github.js entirely. Every save from every device
   goes directly to Firestore in real time. No token needed
   on agent devices. Every deal, every account, everything.
═══════════════════════════════════════════════════════════════ */

// Firebase config
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDFTIlaaxKQAv5EBTlLBHNJ4vOQLXVkxF8",
  authDomain: "cornerstonearchive.firebaseapp.com",
  projectId: "cornerstonearchive",
  storageBucket: "cornerstonearchive.firebasestorage.app",
  messagingSenderId: "822571240663",
  appId: "1:822571240663:web:eb10a28bcc35208013f492",
  measurementId: "G-9QZM70EKZX"
};

// Firestore REST API base — no SDK needed, pure fetch calls
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

const DB = (() => {

  // ── STATUS UI ─────────────────────────────────────────────────
  function _setStatus(ok) {
    const dot = document.getElementById('gh-dot');
    const txt = document.getElementById('gh-status-txt');
    if (!dot || !txt) return;
    if (ok === true)  { dot.className = 'gh-dot on';  txt.textContent = 'Firebase connected ✓'; }
    if (ok === false) { dot.className = 'gh-dot err'; txt.textContent = 'Firebase error — check console'; }
    if (ok === null)  { dot.className = 'gh-dot on';  txt.textContent = 'Firebase — Firestore'; }
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

  // ── FIRESTORE VALUE ENCODING ──────────────────────────────────
  // Firestore REST API requires values wrapped in type objects
  function _encode(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') return { doubleValue: val };
    if (typeof val === 'string') return { stringValue: val };
    if (Array.isArray(val)) return { arrayValue: { values: val.map(_encode) } };
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

  // ── FIRESTORE REST CALLS ──────────────────────────────────────
  async function _getDoc(collection, docId) {
    try {
      const r = await fetch(`${FS_BASE}/${collection}/${docId}`);
      if (!r.ok) return null;
      const j = await r.json();
      return _decodeDoc(j);
    } catch(e) { console.warn('[DB] getDoc error:', e); return null; }
  }

  async function _setDoc(collection, docId, data) {
    try {
      const fields = {};
      Object.entries(data).forEach(([k, v]) => { fields[k] = _encode(v); });
      const r = await fetch(
        `${FS_BASE}/${collection}/${docId}?currentDocument.exists=false`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) }
      );
      // If doc already exists, use PATCH instead
      if (r.status === 409 || !r.ok) {
        return await _updateDoc(collection, docId, data);
      }
      return r.ok;
    } catch(e) { console.warn('[DB] setDoc error:', e); return false; }
  }

  async function _updateDoc(collection, docId, data) {
    try {
      const fields = {};
      Object.entries(data).forEach(([k, v]) => { fields[k] = _encode(v); });
      const r = await fetch(
        `${FS_BASE}/${collection}/${docId}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) }
      );
      return r.ok;
    } catch(e) { console.warn('[DB] updateDoc error:', e); return false; }
  }

  // ── MAIN DOCUMENT: portal_data ────────────────────────────────
  // Everything lives in one Firestore document: portal/data
  // This mirrors exactly what was in portal_data.json on GitHub
  const COLLECTION = 'portal';
  const DOC_ID = 'data';

  async function pull() {
    try {
      const data = await _getDoc(COLLECTION, DOC_ID);
      _setStatus(data ? true : null);
      return data;
    } catch(e) {
      _setStatus(false);
      return null;
    }
  }

  async function push(data) {
    _showSync('↑ Saving...');
    try {
      const payload = {
        version: '5.0',
        lastUpdated: new Date().toISOString(),
        ...data
      };
      const ok = await _updateDoc(COLLECTION, DOC_ID, payload);
      if (!ok) {
        // Doc might not exist yet — try creating it
        await _setDoc(COLLECTION, DOC_ID, payload);
      }
      _hideSync();
      _setStatus(true);
      return true;
    } catch(e) {
      console.warn('[DB] push error:', e);
      _hideSync();
      _setStatus(false);
      return false;
    }
  }

  // ── INIT — create the document if it doesn't exist yet ────────
  async function init(initialData) {
    const existing = await _getDoc(COLLECTION, DOC_ID);
    if (!existing) {
      // First time ever — create the document
      await _setDoc(COLLECTION, DOC_ID, {
        version: '5.0',
        lastUpdated: new Date().toISOString(),
        ...initialData
      });
    }
    return existing || initialData;
  }

  function updateStatus(ok) { _setStatus(ok); }
  function isConfigured() { return true; } // Firebase is always configured via the hardcoded config
  function getCfg() { return FIREBASE_CONFIG; }
  // Legacy compatibility shims (these were on the GH object)
  function load() { return FIREBASE_CONFIG; }
  function save() {} // no-op — config is hardcoded

  return {
    pull, push, init,
    updateStatus, isConfigured, getCfg, load, save
  };
})();

// Expose as GH for backward compatibility with data.js and app.js
// so no other file needs to change
const GH = DB;
