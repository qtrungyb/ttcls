/* Drawer */
window.CLS = window.CLS || {};

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