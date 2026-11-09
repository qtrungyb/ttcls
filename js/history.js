/* History — chỉ lưu để tra cứu nội bộ, không hiển thị "Gần đây" */
window.CLS = window.CLS || {};

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