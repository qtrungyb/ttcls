/* Render functions */
window.CLS = window.CLS || {};

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

    // Gom nhóm theo panel
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