/* UI state */
window.CLS = window.CLS || {};

(function() {
  window.CLS.updateUI = function() {
    const { state, el, FORMAT_LABELS } = window.CLS;

    el.unitIcon.className = state.showUnit ? 'fas fa-eye' : 'fas fa-eye-slash';
    el.unitBtnText.textContent = state.showUnit ? 'Có ĐV' : 'Đơn vị';
    el.toggleUnitBtn.classList.toggle('active', state.showUnit);

    el.abbrIcon.className = state.showAbbr ? 'fas fa-font' : 'fas fa-align-left';
    el.abbrBtnText.textContent = state.showAbbr ? 'Viết tắt' : 'Tên đủ';
    el.toggleAbbrBtn.classList.toggle('active', state.showAbbr);

    el.autoToggleBtn.classList.toggle('active', state.autoSummarizeEnabled);

    el.formatLabel.textContent = FORMAT_LABELS[state.copyFormat] || ',';
    el.formatItems.forEach(i => {
      const active = i.dataset.value === state.copyFormat;
      i.classList.toggle('active', active);
      const check = i.querySelector('i');
      if (check) check.style.opacity = active ? '1' : '0';
    });
  };

  /* ---------- THEME ---------- */
  window.CLS.getEffectiveTheme = function() {
    const { state } = window.CLS;
    if (state.themeMode === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return state.themeMode;
  };

  window.CLS.applyTheme = function() {
    const { state, el } = window.CLS;
    const isDark = window.CLS.getEffectiveTheme() === 'dark';
    document.body.classList.toggle('dark-mode', isDark);

    const icon = el.themeToggle.querySelector('i');
    if (state.themeMode === 'auto') {
      icon.className = 'fas fa-circle-half-stroke';
      el.themeToggle.title = 'Giao diện: Theo hệ thống';
    } else if (state.themeMode === 'dark') {
      icon.className = 'fas fa-moon';
      el.themeToggle.title = 'Giao diện: Tối';
    } else {
      icon.className = 'fas fa-sun';
      el.themeToggle.title = 'Giao diện: Sáng';
    }

    document.querySelectorAll('#themeSegmented .seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === state.themeMode);
    });
  };

  window.CLS.setThemeMode = function(mode) {
    const { state, THEME_MODE_KEY } = window.CLS;
    state.themeMode = mode;
    localStorage.setItem(THEME_MODE_KEY, mode);
    window.CLS.applyTheme();
  };

  window.CLS.cycleThemeMode = function() {
    const { state } = window.CLS;
    const order = ['light', 'dark', 'auto'];
    const next = order[(order.indexOf(state.themeMode) + 1) % order.length];
    window.CLS.setThemeMode(next);
  };

  /* Backward-compat: giữ nguyên tên setTheme cũ */
  window.CLS.setTheme = function(isDark) {
    window.CLS.setThemeMode(isDark ? 'dark' : 'light');
  };

  /* ---------- DENSITY ---------- */
  window.CLS.applyDensity = function() {
    const { state } = window.CLS;
    document.body.classList.toggle('density-compact', state.density === 'compact');
    document.querySelectorAll('#densitySegmented .seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.density === state.density);
    });
  };

  window.CLS.setDensity = function(d) {
    const { state, DENSITY_KEY } = window.CLS;
    state.density = d;
    localStorage.setItem(DENSITY_KEY, d);
    window.CLS.applyDensity();
  };

  window.CLS.switchTab = function(tabId) {
    const { el } = window.CLS;
    el.tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    el.tabContents.forEach(c => c.classList.toggle('active', c.id === tabId));
  };

  window.CLS.resetAbbrForm = function() {
    const { el } = window.CLS;
    el.editAbbrId.value = '';
    el.newAbbrKey.value = '';
    el.newAbbrValue.value = '';
    el.abbrFormTitle.innerHTML = '<i class="fas fa-plus-circle"></i> Thêm chỉ số mới';
    el.btnCancelEditAbbr.classList.add('hidden');
  };
})();