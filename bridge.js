/* =========================================================
   BRIDGE — Cầu nối giữa qtrungyb.github.io (kể cả PiP)
            và Chrome Extension
   ========================================================= */
(function() {
  document.documentElement.dataset.clsExtReady = '1';

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== 'CLS_SCAN_REQUEST') return;

    const reply = (payload) => {
      window.postMessage(
        { type: 'CLS_SCAN_RESPONSE', requestId: data.requestId, ...payload },
        window.location.origin
      );
    };

    try {
      chrome.runtime.sendMessage({ type: 'CLS_SCAN_HIS' }, (response) => {
        if (chrome.runtime.lastError) {
          reply({
            ok: false,
            error: 'Mất kết nối Extension — hãy F5 lại trang Tóm tắt CLS.'
          });
          return;
        }
        reply(response || { ok: false, error: 'Không nhận được phản hồi từ Extension.' });
      });
    } catch {
      reply({
        ok: false,
        error: 'Extension vừa tải lại — hãy F5 trang Tóm tắt CLS rồi thử lại.'
      });
    }
  });
})();