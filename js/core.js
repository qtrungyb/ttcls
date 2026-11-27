/* =========================================================
   CORE — constants + config (Firebase) + state + helpers
          + parser + summary + history
   ========================================================= */
window.CLS = window.CLS || {};

/* ---------- Constants ---------- */
window.CLS.STORAGE = {
  AUTO_SCAN: 'autoScanHIS',
  SHOW_UNIT: 'showUnit',
  SHOW_ABBR: 'showAbbr',
  COMPACT_URINE: 'compactUrine',
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
	autoScanEnabled: localStorage.getItem(STORAGE.AUTO_SCAN) === 'true',
    lastAutoScannedText: '',
    autoScanTimer: null,
    currentAbbrMap: {},
    firebaseAbbrList: [],
    showUnit: localStorage.getItem(STORAGE.SHOW_UNIT) === 'true',
    showAbbr: localStorage.getItem(STORAGE.SHOW_ABBR) !== 'false',
	compactUrine: localStorage.getItem(STORAGE.COMPACT_URINE) !== 'false',
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
	autoScanToggleBtn: $('#autoScanToggleBtn'),
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
	toggleUrineBtn: $('#toggleUrineBtn'),
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
        s.includes('máu lắng') || s.includes('tốc độ lắng') ||
        s.includes('neutrophil') || s.includes('lympho') || s.includes('mono') ||
        s.includes('eosino') || s.includes('baso') || s.includes('tỷ lệ bạch cầu') ||
        /\b(mcv|mch|mchc|rdw|mpv|pdw|wbc|rbc|plt|hgb|hct|neut|lym|vss|esr)\b/.test(s)) return 'HuyetHoc';

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
    const doc = win.document;

    // Khi tự động quét lúc đang bấm bên tab HIS, cửa sổ PiP không focus -> copy qua Extension
    if (!doc.hasFocus() && window.CLS.copyViaExtension) {
      window.CLS.copyViaExtension(text);
      return Promise.resolve();
    }

    if (win.navigator.clipboard && win.isSecureContext !== false) {
      return win.navigator.clipboard.writeText(text).catch(() => {
        if (!fallbackCopy(text) && window.CLS.copyViaExtension) {
          window.CLS.copyViaExtension(text);
        }
      });
    }
    if (!fallbackCopy(text) && window.CLS.copyViaExtension) {
      window.CLS.copyViaExtension(text);
    }
    return Promise.resolve();
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
  const getShared = () => window.CLSShared;

  window.CLS.cleanName = function(raw) {
    const S = getShared();
    if (S?.cleanName) return S.cleanName(raw);
    return String(raw || '').trim().replace(/^\([^)]+\)\s*/, '').trim();
  };

  window.CLS.getStatus = function(valStr, rangeStr) {
    const S = getShared();
    if (S?.getStatus) return S.getStatus(valStr, rangeStr);
    const val = window.CLS.parseNumber(valStr);
    if (isNaN(val) || !rangeStr) return 'unknown';
    let m;
    if ((m = rangeStr.match(RANGE_REGEX))) return (val < window.CLS.parseNumber(m[1]) || val > window.CLS.parseNumber(m[2])) ? 'abnormal' : 'normal';
    if ((m = rangeStr.match(LE_REGEX)))    return val <= window.CLS.parseNumber(m[2]) ? 'normal' : 'abnormal';
    if ((m = rangeStr.match(L_REGEX)))     return val <  window.CLS.parseNumber(m[1]) ? 'normal' : 'abnormal';
    if ((m = rangeStr.match(GE_REGEX)))    return val >= window.CLS.parseNumber(m[2]) ? 'normal' : 'abnormal';
    if ((m = rangeStr.match(G_REGEX)))     return val >  window.CLS.parseNumber(m[1]) ? 'normal' : 'abnormal';
    return 'unknown';
  };

  window.CLS.parseInputToRows = function(input) {
    const S = getShared();
    if (S?.parseInputToRows) return S.parseInputToRows(input);

    const lines = String(input || '').split(/\r?\n/);
    const rows = [];
    let autoStt = 1;
    const HEADER_RE = /^(stt|tt|#|chỉ số|tên xét nghiệm|tên xn|thông số|kết quả|tham chiếu|đơn vị)$/i;
    const QUAL_RE = /^(?:[+-]+|âm(?:\s*tính)?|dương(?:\s*tính)?|neg(?:ative)?|pos(?:itive)?|norm(?:al)?|bình\s*thường|bt|vết|trace|không|có)\b/i;

    for (const line of lines) {
      if (!line.trim()) continue;
      const cells = line.includes('\t')
        ? line.split('\t').map((c) => c.trim())
        : (/\s{2,}/.test(line) ? line.trim().split(/\s{2,}/).map((c) => c.trim()) : []);
      while (cells.length && !cells[0]) cells.shift();
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (cells.length < 2) continue;

      let stt = '';
      let rest = cells;
      if (/^\d+[.)]?$/.test(cells[0])) {
        stt = cells[0].replace(/[.)]$/, '');
        rest = cells.slice(1);
      } else {
        const okName = /[a-zA-ZÀ-ỹ]/.test(cells[0]) && !HEADER_RE.test(cells[0]);
        const okVal = /\d/.test(cells[1]) || QUAL_RE.test(cells[1]) || cells[2] === 'CĐHA' || cells[2] === 'TDCN';
        if (!okName || !okVal) continue;
      }

      while (rest.length && !rest[0]) rest.shift();
      const name = rest[0] || '';
      let vIdx = 1;
      while (vIdx < rest.length && !rest[vIdx]) vIdx++;
      const value = rest[vIdx] || '';
      const refRange = rest[vIdx + 1] || '';
      const unit = rest[vIdx + 2] || '';
      if (!name || !value || HEADER_RE.test(name)) continue;

      if (!/^\d+$/.test(stt)) stt = String(autoStt);
      autoStt++;
      rows.push({
        stt,
        cleanName: window.CLS.cleanName(name),
        value,
        refRange,
        unit,
        _status: window.CLS.getStatus(value, refRange)
      });
    }
    return rows;
  };
})();

/* ---------- Summary ---------- */
(function() {
  window.CLS.computeSummary = function(rows, opts = {}) {
    const { state, escapeHtml, escapeAttr, SEP_INNER } = window.CLS;
    const S = window.CLSShared;
    const settings = {
      showUnit: state.showUnit,
      showAbbr: state.showAbbr,
      compactUrine: state.compactUrine,
      copyFormat: state.copyFormat
    };

    if (S?.formatRows) {
      if (opts.allowCompactUrine !== false && state.compactUrine && S.getShortServiceLabel('', rows) === 'TPTNT') {
        const abnUrine = rows.filter((r) => !S.isNormalUrineRow(r));
        if (!abnUrine.length) return { html: 'Bình thường', plain: 'Bình thường' };
        return S.formatRows(abnUrine, settings, state.currentAbbrMap);
      }
      return S.formatRows(rows, settings, state.currentAbbrMap);
    }

    // Dự phòng nếu shared_cls.js chưa tải được
    const htmlParts = [];
    const plainParts = [];
    for (const r of rows) {
      if (!r.value || r.value.trim().toLowerCase() === '- neg') continue;
      const isConclusion = r.refRange === 'CĐHA' || r.refRange === 'TDCN';
      const abbr = state.showAbbr ? state.currentAbbrMap[r.cleanName] : '';
      const name = abbr || r.cleanName;
      const sep = isConclusion ? ': ' : (SEP_INNER[name] || ' ');
      const unit = (!isConclusion && state.showUnit && r.unit) ? ' ' + r.unit : '';
      const ev = escapeHtml(r.value);
      const hv = r._status === 'abnormal' ? `<span class="abnormal-value">${ev}</span>` : ev;
      const nHtml = abbr
        ? `<span class="abbr-tip" title="${escapeAttr(r.cleanName)}">${escapeHtml(name)}</span>`
        : escapeHtml(name);
      htmlParts.push(`${nHtml}${sep}${hv}${escapeHtml(unit)}`);
      plainParts.push(`${name}${sep}${r.value}${unit}`);
    }
    const sepHtml = state.copyFormat === 'newline' ? '<br>' : (state.copyFormat === 'semicolon' ? '; ' : ', ');
    const sepPlain = state.copyFormat === 'newline' ? '\n' : (state.copyFormat === 'semicolon' ? '; ' : ', ');
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