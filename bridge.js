/* =========================================================
   BRIDGE — Cầu nối giữa qtrungyb.github.io (kể cả PiP)
            và Chrome Extension qua CustomEvent
   ========================================================= */
(function() {
  document.documentElement.dataset.clsExtReady = '1';

  document.addEventListener('cls-scan-request', (event) => {
    let req = null;
    try {
      req = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch {}
    if (!req || !req.requestId) return;

    const requestId = req.requestId;

    // Báo ngay cho trang web biết bridge.js đã nhận yêu cầu
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
      chrome.runtime.sendMessage({ type: 'CLS_SCAN_HIS' }, (response) => {
        if (chrome.runtime.lastError) {
          reply({
            ok: false,
            error: 'Lỗi kết nối Extension: ' + chrome.runtime.lastError.message
          });
          return;
        }
        reply(response || { ok: false, error: 'Background không trả về dữ liệu.' });
      });
    } catch (err) {
      reply({
        ok: false,
        error: 'Extension vừa tải lại — hãy F5 trang Tóm tắt CLS rồi thử lại.'
      });
    }
  });
})();