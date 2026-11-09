/* Compute summary */
window.CLS = window.CLS || {};

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

      // HTML: nếu đang dùng viết tắt → bọc tooltip tên đầy đủ
      let nHtml;
      if (isAbbr) {
        nHtml = `<span class="abbr-tip" title="${escapeAttr(r.cleanName)}">${escapeHtml(n)}</span>`;
      } else {
        nHtml = escapeHtml(n);
      }

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