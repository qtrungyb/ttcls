/* =========================================================
   BRIDGE — Cầu nối giữa qtrungyb.github.io (kể cả PiP)
            và Chrome Extension
   ========================================================= */
(function() {
  document.documentElement.dataset.clsExtReady = '1';

  function parseDetail(ev) {
    try {
      return typeof ev.detail === 'string' ? JSON.parse(ev.detail) : ev.detail;
    } catch {
      return null;
    }
  }

  document.addEventListener('cls-scan-request', (event) => {
    const req = parseDetail(event);
    if (!req || !req.requestId) return;

    const requestId = req.requestId;
    const mode = req.mode || 'manual';

    document.dispatchEvent(
      new CustomEvent('cls-scan-ack', { detail: JSON.stringify({ requestId }) })
    );

    const reply = (payload) => {
      document.dispatchEvent(
        new CustomEvent('cls-scan-response', {
          detail: JSON.stringify({ requestId, ...payload })
        })
      );
    };

    try {
      chrome.runtime.sendMessage({ type: 'CLS_SCAN_HIS', mode }, (response) => {
        if (chrome.runtime.lastError) {
          reply({
            ok: false,
            error: 'Lỗi kết nối Extension: ' + chrome.runtime.lastError.message
          });
          return;
        }
        reply(response || { ok: false, error: 'Background không trả về dữ liệu.' });
      });
    } catch {
      reply({
        ok: false,
        error: 'Extension vừa tải lại — hãy F5 trang Tóm tắt CLS rồi thử lại.'
      });
    }
  });

  // Kênh copy dự phòng khi tự động quét (lúc đó tab HIS đang focus, PiP không focus)
  document.addEventListener('cls-copy-request', (event) => {
    const req = parseDetail(event);
    if (!req || !req.text) return;
    try {
      chrome.runtime.sendMessage({ type: 'CLS_COPY_TEXT', text: req.text }, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
  });
})();