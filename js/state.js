/* State + DOM refs */
window.CLS = window.CLS || {};

(function() {
  const { STORAGE, DENSITY_KEY, THEME_MODE_KEY } = window.CLS;
  const $ = (s) => document.querySelector(s);

  /* Migrate từ key 'theme' cũ → themeMode */
  const oldTheme = localStorage.getItem(STORAGE.THEME); // 'dark' | 'light' | null
  const savedThemeMode = localStorage.getItem(THEME_MODE_KEY);
  const initialThemeMode = savedThemeMode || (oldTheme === 'dark' || oldTheme === 'light' ? oldTheme : 'auto');

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
    themeMode: initialThemeMode,          // 'light' | 'dark' | 'auto'
    density: localStorage.getItem(DENSITY_KEY) || 'comfortable',
    collapsedPanels: new Set()
  };

  window.CLS.el = {
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