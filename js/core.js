/* =========================================================
   CORE — constants + config (Firebase) + state + helpers
          + parser + summary + history
   ========================================================= */
window.CLS = window.CLS || {};

/* ---------- Constants ---------- */
window.CLS.STORAGE = {
  SHOW_UNIT: 'showUnit',
  SHOW_ABBR: 'showAbbr',
  COPY_FORMAT: 'copyFormat',
  AUTO_SUMMARIZE: 'autoSummarize',
  THEME: 'theme'
};

window.CLS.HISTORY_KEY = 'cls_history_v1';
window.CLS.SEEDED_KEY = 'cls_seeded_v1';
window.CLS.DENSITY_KEY = 'cls_density';
window.CLS.THEME_MODE_KEY = 'cls_theme_mode';

window.CLS.SPECIAL_NAMES = [
  "Số lượng hồng cầu", "Huyết sắc tố", "Hematocrit",
  "Số lượng tiểu cầu", "Số lượng bạch cầu", "Tỷ lệ bạch cầu GR"
];

window.CLS.DEFAULT_ABBR_MAP = {
  "Số lượng hồng cầu": "HC",
  "Huyết sắc tố": "Hb",
  "Hematocrit": "HTC",
  "Số lượng tiểu cầu": "TC",
  "Số lượng bạch cầu": "BC",
  "Tỷ lệ bạch cầu GR": "N%"
};

window.CLS.FORMAT_LABELS = { comma: ',', semicolon: ';', newline: '↵' };

window.CLS.SEP_INNER = { T3: ': ', T4: ': ', TSH: ': ', Tg: ': ' };

window.CLS.RANGE_REGEX = /(\d+[.,]?\d*)\s*[-–]\s*(\d+[.,]?\d*)/;
window.CLS.LE_REGEX = /(<=|≤)\s*(\d+[.,]?\d*)/;
window.CLS.L_REGEX = /<\s*(\d+[.,]?\d*)/;
window.CLS.GE_REGEX = /(>=|≥)\s*(\d+[.,]?\d*)/;
window.CLS.G_REGEX = />\s*(\d+[.,]?\d*)/;

window.CLS.PANEL_LABELS = {
  HuyetHoc: 'Huyết học (CBC)',
  SinhHoa:  'Sinh hoá',
  DongMau:  'Đông máu',
  MienDich: 'Miễn dịch',
  NuocTieu: 'Nước tiểu',
  Khac:     'Khác'
};
window.CLS.PANEL_ORDER = ['HuyetHoc', 'SinhHoa', 'DongMau', 'MienDich', 'NuocTieu', 'Khac'];

/* ---------- Firebase config ---------- */
(function() {
  const firebaseConfig = {
    apiKey: "AIzaSyBO0lJNyz9N4sr5z_FZyQgX_tWXD0XH82g",
    authDomain: "tomtatcls.firebaseapp.com",
    databaseURL: "https://tomtatcls-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "tomtatcls",
    storageBucket: "tomtatcls.firebasestorage.app",
    messagingSenderId: "898386417757",
    appId: "1:898386417757:web:b1fa660ff3821abf4ad5b4"
  };

  try {
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();
    window.CLS.db = db;
    window.CLS.quickCopyRef = db.ref('quickCopyItems');
    window.CLS.abbrRef = db.ref('abbreviations');
    console.log('✅ [core] Firebase initialized');
  } catch (e) {
    console.error('❌ [core] Firebase init failed:', e);
    window.CLS.firebaseError = e;
  }

  window.CLS.logPageVisit = function() {
    if (!window.CLS.db) return;
    window.CLS.db.ref('page_visits/stats').update({
      total_views: firebase.database.ServerValue.increment(1)
    }).catch(() => {});
    window.CLS.db.ref('page_visits/logs').push({
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      localTime: new Date().toLocaleString('vi-VN'),
      userAgent: navigator.userAgent
    }).catch(() => {});
  };
})();

/* ---------- State + DOM refs ---------- */
(function() {
  const { STORAGE, DENSITY_KEY, THEME_MODE_KEY } = window.CLS;
  const $ = (s) => document.querySelector(s);

  // migrate 'theme' cũ → themeMode
  const oldTheme = localStorage.getItem(STORAGE.THEME);
  const savedThemeMode = localStorage.getItem(THEME_MODE_KEY);
  const initialThemeMode = savedThemeMode
    || (oldTheme === 'dark' || oldTheme === 'light' ? oldTheme : 'auto');

  window.CLS.state = {
    currentAbbrMap: {},
    firebaseAbbrList: [],
    showUnit: localStorage.getItem(STORAGE.SHOW_UNIT) === 'true',
    showAbbr: localStorage.getItem(STORAGE.SHOW_ABBR) !== 'false',
    copyFormat: localStorage.getItem(STORAGE.COPY_FORMAT) || 'comma',
    autoSummarizeEnabled: localStorage.getItem(STORAGE.AUTO_SUMMARIZE) !== 'false',
    currentRows: [],
    selectedIndices: [],
    customQuickItems: [],
    editingQuickId: null,
    contextMenuTargetId: null,
    isTableDirty: false,
    lastSummaryHtml: '',
    lastTableSignature: '',
    activeQuickTab: 'all',
    themeMode: initialThemeMode,
    density: localStorage.getItem(DENSITY_KEY) || 'comfortable',
    collapsedPanels: new Set(),
    pipWindow: null
  };

  window.CLS.el = {
	 appShell: $('.app-shell'),
    pipToggleBtn: $('#pipToggleBtn'),
    pipPlaceholder: $('#pipPlaceholder'),
    pipRestoreBtn: $('#pipRestoreBtn'),
	
    dataTextarea: $('#dataInput'),
    summarizeBtn: $('#summarizeBtn'),
    clearBtn: $('#clearBtn'),
    clearTextBtn: $('#clearTextBtn'),
    copySummaryBtn: $('#copySummaryBtn'),
    autoToggleBtn: $('#autoToggleBtn'),
    themeToggle: $('#themeToggle'),
    settingsBtn: $('#settingsBtn'),

    formatDropdownToggle: $('#formatDropdownToggle'),
    formatDropdownMenu: $('#formatDropdownMenu'),
    formatItems: document.querySelectorAll('#formatDropdownMenu .menu-item'),
    formatLabel: $('#formatLabel'),

    toggleUnitBtn: $('#toggleUnitBtn'),
    toggleAbbrBtn: $('#toggleAbbrBtn'),
    unitIcon: $('#unitIcon'),
    abbrIcon: $('#abbrIcon'),
    unitBtnText: $('#unitBtnText'),
    abbrBtnText: $('#abbrBtnText'),

    summaryText: $('#summaryText'),
    outputCard: $('#outputCard'),
    totalIndicatorsSpan: $('#totalIndicators'),
    abnormalIndicatorsSpan: $('#abnormalIndicators'),
    selectedCountBadge: $('#selectedCountBadge'),

    openDrawerBtn: $('#openDrawerBtn'),
    tableContainer: $('#tableContainer'),
    drawerBackdrop: $('#drawerBackdrop'),
    drawerClose: $('#drawerClose'),
    drawerApply: $('#drawerApply'),
    drawerCount: $('#drawerCount'),
    tableBody: $('#tableBody'),
    selectionToolbar: $('#selectionToolbar'),
    selectMainBtn: $('#selectMainBtn'),
    selectAbnormalBtn: $('#selectAbnormalBtn'),
    selectAllBtn: $('#selectAllBtn'),
    deselectAllBtn: $('#deselectAllBtn'),

    quickBody: $('#quickBody'),
    quickToggle: $('#quickCopyToggle'),
    quickCopyGrid: $('#quickCopyGrid'),
    quickTabs: $('#quickTabs'),
    quickSearch: $('#quickSearch'),
    btnAddQuickCopy: $('#btnAddQuickCopy'),

    itemModal: $('#itemModal'),
    modalTitle: $('#modalTitle'),
    modalCloseBtn: $('#modalCloseBtn'),
    catSelect: $('#modalCategorySelect'),
    catInput: $('#modalCategoryInput'),
    modalContent: $('#modalContent'),
    modalCancel: $('#modalCancel'),
    modalSave: $('#modalSave'),

    settingsModal: $('#settingsModal'),
    btnCloseSettings: $('#btnCloseSettings'),
    tabBtns: document.querySelectorAll('.modal-tabs .tab-btn'),
    tabContents: document.querySelectorAll('.modal-tabs ~ .tab-content, .modal-box > .tab-content'),
    abbrListContainer: $('#abbrListContainer'),
    abbrCountBadge: $('#abbrCountBadge'),
    abbrFormTitle: $('#abbrFormTitle'),
    newAbbrKey: $('#newAbbrKey'),
    newAbbrValue: $('#newAbbrValue'),
    editAbbrId: $('#editAbbrId'),
    btnAddAbbr: $('#btnAddAbbr'),
    btnCancelEditAbbr: $('#btnCancelEditAbbr'),
    btnResetAbbr: $('#btnResetAbbr'),

    contextMenu: $('#contextMenu'),
    menuEdit: $('#menuEdit'),
    menuDelete: $('#menuDelete'),

    scrollTopBtn: $('#scrollTopBtn'),
    appBar: $('#appBar')
	
  };
})();

/* ---------- Utils ---------- */
(function() {
  window.CLS.escapeHtml = function(str) {
    return str ? String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])) : '';
  };

  window.CLS.escapeAttr = function(str) {
    return str ? String(str).replace(/[&<>"']/g, m =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) : '';
  };

  window.CLS.parseNumber = function(str) {
    const m = str && String(str).replace(/,/g, '.').replace(/\s+/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  };

  window.CLS.debounce = function(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  window.CLS.classifyPanel = function(name) {
    if (!name) return 'Khac';
    const s = String(name).toLowerCase();

    if (s.includes('đông máu') || s.includes('prothrombin') || s.includes('fibrinogen') ||
        s.includes('d-dimer') || s.includes('d dimer') || s.includes('thrombin') ||
        /\b(pt|aptt|inr|tt)\b/.test(s)) return 'DongMau';

    if (s.includes('hồng cầu') || s.includes('huyết sắc tố') || s.includes('hematocrit') ||
        s.includes('hemoglobin') || s.includes('tiểu cầu') || s.includes('bạch cầu') ||
        s.includes('neutrophil') || s.includes('lympho') || s.includes('mono') ||
        s.includes('eosino') || s.includes('baso') || s.includes('tỷ lệ bạch cầu') ||
        /\b(mcv|mch|mchc|rdw|mpv|pdw|wbc|rbc|plt|hgb|hct|neut|lym)\b/.test(s)) return 'HuyetHoc';

    if (s.includes('hbsag') || s.includes('anti-hbs') || s.includes('anti-hcv') ||
        s.includes('anti-hiv') || s.includes('tsh') || s.includes('ft3') || s.includes('ft4') ||
        s.includes('crp') || s.includes('procalcitonin') || s.includes('ana') ||
        s.includes('kháng thể') || s.includes('miễn dịch') || s.includes('globulin')) return 'MienDich';

    if (s.includes('nước tiểu') || s.includes('niệu') || s.includes('urine')) return 'NuocTieu';

    return 'SinhHoa';
  };

  window.CLS.getActiveWin = function() {
    const w = window.CLS.state?.pipWindow;
    return (w && !w.closed) ? w : window;
  };

  window.CLS.getActiveDoc = function() {
    return window.CLS.getActiveWin().document;
  };

  window.CLS.showToast = function(msg, duration = 2200) {
    const doc = window.CLS.getActiveDoc();
    doc.querySelector('.toast-message')?.remove();
    const t = doc.createElement('div');
    t.className = 'toast-message';
    t.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
    doc.body.appendChild(t);
    setTimeout(() => {
      t.classList.add('fade-out');
      setTimeout(() => t.remove(), 350);
    }, duration);
  };

  window.CLS.copyToClipboard = function(text) {
    const win = window.CLS.getActiveWin();
    if (win.navigator.clipboard && win.isSecureContext !== false) {
      return win.navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  };

  function fallbackCopy(text) {
    const doc = window.CLS.getActiveDoc();
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.setAttribute('readonly', '');
    doc.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = doc.execCommand('copy'); } catch (e) {}
    ta.remove();
    if (!ok) console.warn('Clipboard copy failed');
  }
})();
/* ---------- Parser ---------- */
(function() {
  const { RANGE_REGEX, LE_REGEX, L_REGEX, GE_REGEX, G_REGEX } = window.CLS;

  const nameRegex = /^\([^)]+\)\s*(.*)/;
  const innerContentRegex = /\s*\(([^)]+)\)/g;
  const validKeepText = ['inr','bệnh/ chứng r','bệnh/chứng r','alt','ast'];
  const cleanNameCache = new Map();
  const CLEAN_CACHE_LIMIT = 500;

  window.CLS.cleanName = function(raw) {
    if (!raw) return '';
    if (cleanNameCache.has(raw)) return cleanNameCache.get(raw);
    let str = raw.trim().replace(/^["']|["']$/g, '');
    let m = str.match(nameRegex);
    let name = m ? m[1].trim() : str;
    name = name.replace(innerContentRegex, (match, inner) =>
      validKeepText.includes(inner.trim().toLowerCase()) ? match : ''
    );
    const result = name.trim();
    if (cleanNameCache.size >= CLEAN_CACHE_LIMIT) cleanNameCache.clear();
    cleanNameCache.set(raw, result);
    return result;
  };

  window.CLS.getStatus = function(valStr, rangeStr) {
    const val = window.CLS.parseNumber(valStr);
    if (isNaN(val) || !rangeStr) return 'unknown';
    let m;
    if ((m = rangeStr.match(RANGE_REGEX))) return (val < window.CLS.parseNumber(m[1]) || val > window.CLS.parseNumber(m[2])) ? 'abnormal' : 'normal';
    if ((m = rangeStr.match(LE_REGEX)))    return val <= window.CLS.parseNumber(m[2]) ? 'normal' : 'abnormal';
    if ((m = rangeStr.match(L_REGEX)))     return val <  window.CLS.parseNumber(m[1]) ? 'normal' : 'abnormal';
    if ((m = rangeStr.match(GE_REGEX)))    return val >= window.CLS.parseNumber(m[1]) ? 'normal' : 'abnormal';
    if ((m = rangeStr.match(G_REGEX)))     return val >  window.CLS.parseNumber(m[1]) ? 'normal' : 'abnormal';
    return 'unknown';
  };

  window.CLS.parseInputToRows = function(input) {
    const lines = input.split(/\r?\n/);
    const rows = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split('\t').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3 && /^\d+$/.test(cols[0])) {
        const refRange = cols[3] || '';
        rows.push({
          stt: cols[0],
          rawName: cols[1],
          cleanName: window.CLS.cleanName(cols[1]),
          value: cols[2],
          refRange,
          unit: cols[4] || '',
          _status: window.CLS.getStatus(cols[2], refRange)
        });
      }
    }
    return rows;
  };
})();

/* ---------- Summary ---------- */
(function() {
  window.CLS.computeSummary = function(rows) {
    const { state, SEP_INNER, escapeHtml, escapeAttr } = window.CLS;
    const htmlParts = [];
    const plainParts = [];
    for (const r of rows) {
      if (!r.value || r.value.trim().toLowerCase() === '- neg') continue;

      const isAbbr = state.showAbbr && state.currentAbbrMap[r.cleanName];
      const n = isAbbr ? state.currentAbbrMap[r.cleanName] : r.cleanName;
      const sep = SEP_INNER[n] || ' ';
      const u = (state.showUnit && r.unit) ? ' ' + r.unit : '';
      const ev = escapeHtml(r.value);
      const hv = r._status === 'abnormal' ? `<span class="abnormal-value">${ev}</span>` : ev;

      const nHtml = isAbbr
        ? `<span class="abbr-tip" title="${escapeAttr(r.cleanName)}">${escapeHtml(n)}</span>`
        : escapeHtml(n);

      htmlParts.push(`${nHtml}${sep}${hv}${escapeHtml(u)}`);
      plainParts.push(`${n}${sep}${r.value}${u}`);
    }
    const sepHtml  = state.copyFormat === 'newline' ? '<br>' : (state.copyFormat === 'semicolon' ? '; ' : ', ');
    const sepPlain = state.copyFormat === 'newline' ? '\n'  : (state.copyFormat === 'semicolon' ? '; ' : ', ');
    return { html: htmlParts.join(sepHtml), plain: plainParts.join(sepPlain) };
  };

  window.CLS.getSummaryPlainText = function() {
    const { state, computeSummary } = window.CLS;
    return computeSummary(state.currentRows.filter((_, i) => state.selectedIndices.includes(i))).plain;
  };
})();

/* ---------- History ---------- */
(function() {
  const { HISTORY_KEY } = window.CLS;

  window.CLS.pushHistory = function(rawInput, summaryText, rowCount) {
    if (!rawInput.trim() || !rowCount) return;
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch {}
    hist = hist.filter(h => h.raw !== rawInput);
    hist.unshift({ raw: rawInput, summary: summaryText, count: rowCount, ts: Date.now() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 15)));
  };
})();

console.log('✅ [core] ready');