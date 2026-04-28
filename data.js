/* ═══════════════════════════════════════════════════════════════
   data.js — Cornerstone Council · Unified Data Store
   
   EVERYTHING is stored in one place and synced through GitHub:
     · Portal users, accounts, profiles, avatars
     · All deals, lead spend, incentives
     · CRM members (full hierarchy)
     · CRM agencies (names, colors, founding dates)
     · CRM agency counter
   
   GitHub repo → data/portal_data.json is the single database.
   localStorage is just the offline cache — always written from
   and always written back to GitHub on every save.
═══════════════════════════════════════════════════════════════ */
const Store = (() => {

  // ── LOCAL STORAGE KEYS ────────────────────────────────────────
  // Portal data
  const UK  = 'cc_users';
  const DK  = 'cc_deals';
  const SK  = 'cc_spend';
  const IK  = 'cc_inc';
  // CRM data (same keys the recruit.html uses — so they stay in sync on same browser)
  const CRM_MK  = 'cc_crm_v13';   // members array
  const CRM_AK  = 'cc_ag_v8';     // agencies object
  const CRM_CK  = 'cc_ctr_v1';    // agency counter integer

  const MAX_UNDO = 80;

  // ── DEFAULT PORTAL ACCOUNTS ───────────────────────────────────
  const DEF_USERS = [
    {
      id: 'u_jc', username: 'JC', pwd: 'Josh09212002',
      role: 'admin', agentId: 'joshua-001', agentName: 'Joshua Cribb',
      agencyId: 'cornerstone', commission: '', active: true,
      createdAt: '2024-01-01', joinDate: '2024-01-01',
      bio: '', links: {}, avatar: '', joinDate: '2024-01-01', badges: [], wornBadgeId: null
    },
    {
      id: 'u_ty', username: 'TyreseDuke90', pwd: '2026',
      role: 'admin', agentId: 'tyrese-001', agentName: 'Tyrese Williams',
      agencyId: 'cornerstone', commission: '', active: true,
      createdAt: '2024-01-01', joinDate: '2024-01-01',
      bio: '', links: {}, avatar: '', badges: [], wornBadgeId: null
    },
    {
      id: 'u_own', username: 'teamcornerstone', pwd: 'Manager26',
      role: 'owner', agentId: null, agentName: 'Team Cornerstone',
      agencyId: null, commission: '', active: true,
      createdAt: '2024-01-01', joinDate: '2024-01-01',
      bio: '', links: {}, avatar: '', badges: [], wornBadgeId: null
    },
  ];

  // ── DEFAULT CRM AGENCIES (used if CRM has never been set up) ──
  const DEF_AGENCIES = {
    cornerstone: { name: 'Cornerstone Council', signs: ['tiger','horse','dog'], col: '#c9a84c', bc2: 'bg', trineId: 't3', foundingDob: '' },
    radiant:     { name: 'Radiant Financial',   signs: ['dragon','rat','monkey'], col: '#b39ddb', bc2: 'bp', trineId: 't1', foundingDob: '' },
    trine2:      { name: 'Agency Three',         signs: ['ox','snake','rooster'], col: '#80cbc4', bc2: 'bb', trineId: 't2', foundingDob: '' },
    trine4:      { name: 'Agency Four',           signs: ['cat','goat','pig'],    col: '#81c784', bc2: 'bv', trineId: 't4', foundingDob: '' },
  };

  // ── STATE ──────────────────────────────────────────────────────
  let state = {
    // Portal
    users:          [],
    deals:          [],
    spend:          [],
    incentives:     [],
    monthlyReports: [],
    // CRM
    crmMembers:  [],
    crmAgencies: {},
    crmCounter:  5,
    // Undo / redo (in-memory only — not persisted)
    undoStack:   [],
    redoStack:   [],
  };

  // ── LOAD FROM LOCALSTORAGE ────────────────────────────────────
  function loadLocal() {
    // Portal users
    try { state.users = JSON.parse(localStorage.getItem(UK)) || []; } catch(e) { state.users = []; }
    if (!state.users.length) {
      state.users = JSON.parse(JSON.stringify(DEF_USERS));
      _savePortalLocal();
    }
    // Always ensure default accounts exist (protect against wipes)
    DEF_USERS.forEach(du => {
      if (!state.users.find(u => u.id === du.id)) state.users.push({ ...du });
    });
    // Migrate any missing fields on existing users
    state.users.forEach(u => {
      if (u.bio      === undefined) u.bio = '';
      if (u.links    === undefined) u.links = {};
      if (u.avatar   === undefined) u.avatar = '';
      if (u.joinDate === undefined) u.joinDate = '';
      if (u.commission === undefined) u.commission = '';
      if (u.badges   === undefined) u.badges = [];
      if (u.wornBadgeId === undefined) u.wornBadgeId = null;
      // Hard-remove the old "founders" test account
      if (u.id === 'u_elite' || u.username === 'founders') u.active = false;
    });

    // Portal data
    try { state.deals  = JSON.parse(localStorage.getItem(DK)) || []; } catch(e) { state.deals = []; }
    try { state.spend  = JSON.parse(localStorage.getItem(SK)) || []; } catch(e) { state.spend = []; }
    try { state.incentives = JSON.parse(localStorage.getItem(IK)) || []; } catch(e) { state.incentives = []; }
    try { state.monthlyReports = JSON.parse(localStorage.getItem('cc_mrpts')) || []; } catch(e) { state.monthlyReports = []; }

    // CRM data (read from the same keys recruit.html writes to)
    try { state.crmMembers  = JSON.parse(localStorage.getItem(CRM_MK)) || []; } catch(e) { state.crmMembers = []; }
    try { state.crmAgencies = JSON.parse(localStorage.getItem(CRM_AK)) || {}; } catch(e) { state.crmAgencies = {}; }
    try { state.crmCounter  = parseInt(localStorage.getItem(CRM_CK)) || 5; } catch(e) { state.crmCounter = 5; }

    // If no CRM agencies exist yet, seed defaults
    if (!Object.keys(state.crmAgencies).length) {
      state.crmAgencies = JSON.parse(JSON.stringify(DEF_AGENCIES));
    }

    // Normalize: rabbit → cat (legacy correction)
    state.crmMembers.forEach(m => {
      if (m.zodiac === 'rabbit') m.zodiac = 'cat';
    });
  }

  // ── SAVE TO LOCALSTORAGE ──────────────────────────────────────
  function _savePortalLocal() {
    try { localStorage.setItem(UK, JSON.stringify(state.users)); }       catch(e) {}
    try { localStorage.setItem(DK, JSON.stringify(state.deals)); }       catch(e) {}
    try { localStorage.setItem(SK, JSON.stringify(state.spend)); }       catch(e) {}
    try { localStorage.setItem(IK, JSON.stringify(state.incentives)); }  catch(e) {}
    try { localStorage.setItem('cc_mrpts', JSON.stringify(state.monthlyReports)); } catch(e) {}
  }

  function _saveCRMLocal() {
    try { localStorage.setItem(CRM_MK, JSON.stringify(state.crmMembers)); }  catch(e) {}
    try { localStorage.setItem(CRM_AK, JSON.stringify(state.crmAgencies)); } catch(e) {}
    try { localStorage.setItem(CRM_CK, String(state.crmCounter)); }          catch(e) {}
  }

  function saveLocal() {
    _savePortalLocal();
    _saveCRMLocal();
  }

  // ── BUILD FULL DATABASE PAYLOAD ───────────────────────────────
  // This is everything. The complete database written to GitHub.
  function _buildPayload() {
    return {
      version: '4.1',
      lastUpdated: new Date().toISOString(),
      users:          state.users,
      deals:          state.deals,
      spend:          state.spend,
      incentives:     state.incentives,
      monthlyReports: state.monthlyReports,
      crmMembers:     state.crmMembers,
      crmAgencies:    state.crmAgencies,
      crmCounter:     state.crmCounter,
    };
  }

  // ── SYNC FROM FIREBASE → LOCAL ────────────────────────────────
  // Called on login. Pulls full database from Firestore and writes
  // everything into localStorage so both tools stay in sync.
  async function syncFromGH() {
    // On very first run, init creates the Firestore document if it doesn't exist
    const payload = _buildPayload();
    const remote = await GH.init(payload);
    if (!remote) return false;

    if (remote.users?.length)          state.users          = remote.users;
    if (remote.deals?.length)          state.deals          = remote.deals;
    if (remote.spend?.length)          state.spend          = remote.spend;
    if (remote.incentives?.length)     state.incentives     = remote.incentives;
    if (remote.monthlyReports?.length) state.monthlyReports = remote.monthlyReports;
    if (remote.crmMembers?.length)     state.crmMembers     = remote.crmMembers;
    if (remote.crmAgencies && Object.keys(remote.crmAgencies).length) {
      state.crmAgencies = remote.crmAgencies;
    }
    if (remote.crmCounter !== undefined) state.crmCounter = remote.crmCounter;

    DEF_USERS.forEach(du => {
      if (!state.users.find(u => u.id === du.id)) state.users.push({ ...du });
    });
    state.crmMembers.forEach(m => {
      if (m.zodiac === 'rabbit') m.zodiac = 'cat';
    });
    state.users.forEach(u => {
      if (u.badges      === undefined) u.badges      = [];
      if (u.wornBadgeId === undefined) u.wornBadgeId = null;
    });

    saveLocal();
    return true;
  }

  // ── PUSH LOCAL → GITHUB ───────────────────────────────────────
  async function pushToGH() {
    return GH.push(_buildPayload());
  }

  // ── SAVE ALL (local + github) ─────────────────────────────────
  // Call this after every mutation.
  async function saveAll() {
    pushUndo();
    saveLocal();
    await pushToGH();
  }

  // ── CRM SAVE ─────────────────────────────────────────────────
  // Called when CRM data changes (hierarchy edits, agency renames, etc.)
  // Writes CRM to localStorage (so recruit.html can read it) AND
  // pushes the full database to GitHub.
  async function saveCRM() {
    _saveCRMLocal();
    await pushToGH();
  }

  // ── UNDO / REDO ───────────────────────────────────────────────
  function _snap() {
    return {
      users:          JSON.parse(JSON.stringify(state.users)),
      deals:          JSON.parse(JSON.stringify(state.deals)),
      spend:          JSON.parse(JSON.stringify(state.spend)),
      incentives:     JSON.parse(JSON.stringify(state.incentives)),
      monthlyReports: JSON.parse(JSON.stringify(state.monthlyReports)),
      crmMembers:     JSON.parse(JSON.stringify(state.crmMembers)),
      crmAgencies:    JSON.parse(JSON.stringify(state.crmAgencies)),
      crmCounter:     state.crmCounter,
    };
  }

  function pushUndo() {
    state.undoStack.push(_snap());
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    state.redoStack = [];
    updateUndoBtns();
  }

  function _restoreSnap(s) {
    state.users          = s.users;
    state.deals          = s.deals;
    state.spend          = s.spend;
    state.incentives     = s.incentives;
    state.monthlyReports = s.monthlyReports || [];
    state.crmMembers     = s.crmMembers;
    state.crmAgencies    = s.crmAgencies;
    state.crmCounter     = s.crmCounter;
  }

  async function undo() {
    if (!state.undoStack.length) return false;
    state.redoStack.push(_snap());
    _restoreSnap(state.undoStack.pop());
    saveLocal();
    await pushToGH();
    updateUndoBtns();
    return true;
  }

  async function redo() {
    if (!state.redoStack.length) return false;
    state.undoStack.push(_snap());
    _restoreSnap(state.redoStack.pop());
    saveLocal();
    await pushToGH();
    updateUndoBtns();
    return true;
  }

  function updateUndoBtns() {
    const u = document.getElementById('undo-btn');
    const r = document.getElementById('redo-btn');
    if (u) u.disabled = !state.undoStack.length;
    if (r) r.disabled = !state.redoStack.length;
  }

  // ── HELPERS ───────────────────────────────────────────────────
  function uid() {
    return 'x' + Date.now() + Math.random().toString(36).slice(2, 7);
  }

  function getAgentUsers() {
    return state.users.filter(u => u.active !== false && u.agentId);
  }

  function getMember(id) {
    return state.crmMembers.find(m => m.id === id);
  }

  function getDownlineIds(memberId) {
    const direct = state.crmMembers.filter(m => m.uplineId === memberId).map(m => m.id);
    let all = [...direct];
    direct.forEach(id => { all = [...all, ...getDownlineIds(id)]; });
    return all;
  }

  function isManager(agentId) {
    if (!agentId) return false;
    return getDownlineIds(agentId).some(id =>
      state.users.find(u => u.agentId === id && u.active !== false)
    );
  }

  function totalAP(arr) { return arr.reduce((s, d) => s + (d.ap || 0), 0); }
  function totalMP(arr) { return arr.reduce((s, d) => s + (d.mp || 0), 0); }

  function agN(aid) {
    if (!aid) return 'Cornerstone';
    return state.crmAgencies[aid]?.name || (aid.charAt(0).toUpperCase() + aid.slice(1));
  }

  function getMondayOf(ds) {
    const d = new Date(ds + 'T12:00:00');
    const dy = d.getDay();
    d.setDate(d.getDate() - (dy === 0 ? 6 : dy - 1));
    return d.toISOString().split('T')[0];
  }

  function filterByTF(arr, tf, df, cs, ce) {
    if (tf === 'alltime') return arr;
    const now = new Date();
    let s, e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    switch(tf) {
      case 'today':  s = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
      case 'week': {
        const dw = now.getDay();
        s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dw === 0 ? 6 : dw - 1));
        break;
      }
      case 'month':  s = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'ytd':    s = new Date(now.getFullYear(), 0, 1); break;
      case 'q1':     s = new Date(now.getFullYear(), 0, 1);  e = new Date(now.getFullYear(), 2,  31, 23, 59, 59); break;
      case 'q2':     s = new Date(now.getFullYear(), 3, 1);  e = new Date(now.getFullYear(), 5,  30, 23, 59, 59); break;
      case 'q3':     s = new Date(now.getFullYear(), 6, 1);  e = new Date(now.getFullYear(), 8,  30, 23, 59, 59); break;
      case 'q4':     s = new Date(now.getFullYear(), 9, 1);  e = new Date(now.getFullYear(), 11, 31, 23, 59, 59); break;
      case 'custom':
        if (!cs || !ce) return arr;
        s = new Date(cs + 'T00:00:00');
        e = new Date(ce + 'T23:59:59');
        break;
      default:       s = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return arr.filter(item => {
      const d = new Date((item[df] || item.date) + 'T12:00:00');
      return d >= s && d <= e;
    });
  }

  function buildLB(tf, cs, ce) {
    const filt = filterByTF(state.deals, tf, 'date', cs, ce);
    return getAgentUsers().map(u => {
      const myD = filt.filter(d => d.agentId === u.agentId);
      const m = getMember(u.agentId);
      return {
        userId:   u.id,
        agentId:  u.agentId,
        name:     u.agentName,
        agencyId: m?.agency || u.agencyId,
        ap:       totalAP(myD),
        mp:       totalMP(myD),
        count:    myD.length
      };
    }).sort((a, b) => b.ap - a.ap);
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  return {
    // State accessors (read-only references — mutate through state directly via module)
    get users()          { return state.users; },
    get deals()          { return state.deals; },
    get spend()          { return state.spend; },
    get incentives()     { return state.incentives; },
    get monthlyReports() { return state.monthlyReports; },
    get crmMembers()     { return state.crmMembers; },
    get crmAgencies()    { return state.crmAgencies; },
    get crmCounter()     { return state.crmCounter; },
    set crmCounter(v)    { state.crmCounter = v; },

    // Storage
    loadLocal,
    saveLocal,
    saveAll,       // portal data → localStorage + GitHub
    saveCRM,       // CRM data   → localStorage + GitHub
    syncFromGH,    // GitHub     → localStorage (everything)
    pushToGH,      // localStorage → GitHub (everything)
    DEF_USERS,

    // Undo / Redo
    undo, redo, pushUndo, updateUndoBtns,

    // Helpers
    uid,
    getAgentUsers,
    getMember,
    getDownlineIds,
    isManager,
    totalAP,
    totalMP,
    agN,
    getMondayOf,
    filterByTF,
    buildLB,
  };
})();
