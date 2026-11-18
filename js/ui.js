/* =========================================================
   UI — state hiển thị (theme/density/tabs)
        + render (summary/table/abbr/quick)
        + drawer
   ========================================================= */
window.CLS = window.CLS || {};

/* ---------- UI state ---------- */
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

  window.CLS.setTheme = function(isDark) {
    window.CLS.setThemeMode(isDark ? 'dark' : 'light');
  };

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

/* ---------- Render ---------- */
(function() {
  function updateSummary() {
    const { state, el, computeSummary } = window.CLS;
    const sel = state.currentRows.filter((_, i) => state.selectedIndices.includes(i));
    let newHtml = '';
    if (!sel.length) {
      newHtml = '<div class="empty-state"><i class="fas fa-file-medical-alt"></i><p>Chưa có dữ liệu</p></div>';
    } else {
      const { html } = computeSummary(sel);
      newHtml = html || '<div class="empty-state error"><i class="fas fa-exclamation-circle"></i><p>Không tìm thấy chỉ số hợp lệ.</p></div>';
    }
    if (newHtml !== state.lastSummaryHtml) {
      state.lastSummaryHtml = newHtml;
      el.summaryText.innerHTML = newHtml;
    }
  }

  function updateStats() {
    const { state, el } = window.CLS;
    el.totalIndicatorsSpan.textContent = state.currentRows.length;
    let abn = 0;
    for (const r of state.currentRows) if (r._status === 'abnormal') abn++;
    el.abnormalIndicatorsSpan.textContent = abn;
    el.selectedCountBadge.textContent = `${state.selectedIndices.length}/${state.currentRows.length}`;
    if (el.drawerCount) el.drawerCount.textContent = `${state.selectedIndices.length}/${state.currentRows.length}`;
  }

  function renderRow(r, i) {
    const { state, escapeHtml, escapeAttr } = window.CLS;
    const st = r._status;
    const isSel = state.selectedIndices.includes(i);
    const isAbbr = state.showAbbr && state.currentAbbrMap[r.cleanName];
    const n = isAbbr ? state.currentAbbrMap[r.cleanName] : r.cleanName;
    const nHtml = isAbbr
      ? `<span class="abbr-tip" title="${escapeAttr(r.cleanName)}">${escapeHtml(n)}</span>`
      : escapeHtml(n);
    const dotClass = st === 'abnormal' ? 'abn' : st === 'normal' ? 'norm' : 'unk';
    const meta = (r.refRange || '—') + (r.unit ? ' · ' + r.unit : '');
    return `
      <label class="detail-row ${isSel ? 'selected' : ''} ${st === 'abnormal' ? 'is-abn' : ''}" data-idx="${i}">
        <input type="checkbox" class="row-select" data-index="${i}" ${isSel ? 'checked' : ''}>
        <span class="detail-stt">${escapeHtml(r.stt)}</span>
        <div class="detail-info">
          <div class="detail-name">${nHtml}</div>
          <div class="detail-meta">${escapeHtml(meta)}</div>
        </div>
        <span class="detail-value ${st === 'abnormal' ? 'abn' : ''}">${escapeHtml(r.value)}</span>
        <span class="detail-dot ${dotClass}"></span>
      </label>
    `;
  }

  function renderTable() {
    const { state, el, classifyPanel, PANEL_LABELS, PANEL_ORDER, escapeHtml } = window.CLS;
    const sig = state.currentRows.length + '|' + state.selectedIndices.join(',') + '|'
              + state.showAbbr + '|' + Object.keys(state.currentAbbrMap).length;
    if (sig === state.lastTableSignature) return;
    state.lastTableSignature = sig;

    if (!state.currentRows.length) {
      el.tableBody.innerHTML = '<div class="empty-drawer">Chưa có dữ liệu.</div>';
      updateStats();
      return;
    }

    const groups = {};
    for (let i = 0; i < state.currentRows.length; i++) {
      const r = state.currentRows[i];
      const panel = classifyPanel(r.cleanName);
      if (!groups[panel]) groups[panel] = [];
      groups[panel].push({ row: r, idx: i });
    }

    const frag = [];
    for (const panel of PANEL_ORDER) {
      const items = groups[panel];
      if (!items || !items.length) continue;
      const abnCount = items.filter(x => x.row._status === 'abnormal').length;
      const isCollapsed = state.collapsedPanels.has(panel);
      const countHtml = abnCount
        ? `${items.length} · <b>${abnCount} BT</b>`
        : `${items.length}`;

      frag.push(`
        <div class="panel-group ${isCollapsed ? 'collapsed' : ''}" data-panel="${panel}">
          <div class="panel-head">
            <i class="fas fa-chevron-down panel-chevron"></i>
            <span class="panel-name">${escapeHtml(PANEL_LABELS[panel] || panel)}</span>
            <span class="panel-count">${countHtml}</span>
          </div>
          <div class="panel-body">
            ${items.map(({ row, idx }) => renderRow(row, idx)).join('')}
          </div>
        </div>
      `);
    }
    el.tableBody.innerHTML = frag.join('');
    updateStats();
  }

  function renderAbbrList() {
    const { state, el, escapeHtml, showToast, switchTab, db } = window.CLS;
    if (!el.abbrListContainer) return;
    el.abbrListContainer.innerHTML = state.firebaseAbbrList.length ? state.firebaseAbbrList.map(item => `
      <div class="abbr-row">
        <span class="raw">${escapeHtml(item.raw)}</span>
        <span class="short">${escapeHtml(item.short)}</span>
        <div class="actions">
          <button class="icon-sm-btn edit-abbr-btn" data-id="${item.id}" title="Sửa"><i class="fas fa-edit"></i></button>
          <button class="icon-sm-btn delete-abbr-btn" data-id="${item.id}" title="Xóa"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>
    `).join('') : '<div class="empty-drawer">Chưa có viết tắt</div>';

    el.abbrCountBadge.textContent = state.firebaseAbbrList.length;

    document.querySelectorAll('.edit-abbr-btn').forEach(btn => btn.addEventListener('click', e => {
      const item = state.firebaseAbbrList.find(x => x.id === e.currentTarget.dataset.id);
      if (!item) return;
      el.editAbbrId.value = item.id;
      el.newAbbrKey.value = item.raw;
      el.newAbbrValue.value = item.short;
      el.abbrFormTitle.innerHTML = '<i class="fas fa-edit"></i> Chỉnh sửa';
      el.btnCancelEditAbbr.classList.remove('hidden');
      switchTab('tabAdd');
    }));

    document.querySelectorAll('.delete-abbr-btn').forEach(btn => btn.addEventListener('click', e => {
      if (!confirm('Xóa viết tắt này trên toàn hệ thống?')) return;
      db.ref('abbreviations/' + e.currentTarget.dataset.id).remove()
        .then(() => showToast('Đã xóa'))
        .catch(err => {
          console.error('DELETE ABBR FAILED:', err);
          showToast(`❌ Xóa thất bại: ${err.message || 'Không có quyền'}`, 4000);
        });
    }));
  }

  function renderQuick() {
    const { state, el, escapeHtml } = window.CLS;
    if (!el.quickCopyGrid || !el.quickTabs) return;

    if (!state.customQuickItems.length) {
      el.quickTabs.innerHTML = '';
      el.quickCopyGrid.innerHTML = '<div class="empty-quick">Chưa có mẫu. Nhấn <b>+ Thêm</b> để tạo mẫu đầu tiên.</div>';
      return;
    }

    const groups = {};
    state.customQuickItems.forEach(i => {
      if (!groups[i.category]) groups[i.category] = [];
      groups[i.category].push(i);
    });

    const cats = Object.keys(groups).sort();
    if (state.activeQuickTab !== 'all' && !cats.includes(state.activeQuickTab)) state.activeQuickTab = 'all';

    const tabs = ['all', ...cats];
    el.quickTabs.innerHTML = tabs.map(t => `
      <button class="quick-tab ${t === state.activeQuickTab ? 'active' : ''}" data-tab="${escapeHtml(t)}">
        ${t === 'all' ? 'Tất cả' : escapeHtml(t)}
      </button>
    `).join('');

    let items = state.activeQuickTab === 'all' ? state.customQuickItems : groups[state.activeQuickTab] || [];
    const q = (el.quickSearch?.value || '').toLowerCase().trim();
    if (q) items = items.filter(i => i.content.toLowerCase().includes(q));

    if (!items.length) {
      el.quickCopyGrid.innerHTML = '<div class="empty-quick">Không có mẫu phù hợp.</div>';
      return;
    }

    el.quickCopyGrid.innerHTML = items.map(i => `
      <div class="quick-card" data-id="${i.id}">
        <div class="quick-card-body">
          <span class="quick-card-cat">${escapeHtml(i.category)}</span>
          <div class="quick-card-text">${escapeHtml(i.content).replace(/\n/g, '<br>')}</div>
        </div>
        <button class="quick-card-copy" title="Copy"><i class="fas fa-copy"></i></button>
      </div>
    `).join('');
  }

  window.CLS.updateSummary = updateSummary;
  window.CLS.updateStats = updateStats;
  window.CLS.renderTable = renderTable;
  window.CLS.renderAbbrList = renderAbbrList;
  window.CLS.renderQuick = renderQuick;
})();

/* ---------- Drawer ---------- */
(function() {
  window.CLS.openDrawer = function() {
    const { state, el, renderTable } = window.CLS;
    if (state.isTableDirty) { renderTable(); state.isTableDirty = false; }
    el.tableContainer.classList.add('open');
    el.drawerBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.CLS.closeDrawer = function() {
    const { el } = window.CLS;
    el.tableContainer.classList.remove('open');
    el.drawerBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  };

  window.CLS.syncSelection = function(indices) {
    const { state, updateStats, updateSummary } = window.CLS;
    state.selectedIndices = indices;
    document.querySelectorAll('.row-select').forEach(cb => {
      const idx = parseInt(cb.dataset.index, 10);
      const checked = indices.includes(idx);
      cb.checked = checked;
      const row = cb.closest('.detail-row');
      if (row) row.classList.toggle('selected', checked);
    });
    updateStats();
    updateSummary();
  };
})();

console.log('✅ [ui] ready');