/* Bootstrap — chạy sau khi tất cả file khác đã load */
(function bootstrap() {
  console.log('🚀 [CLS] Bootstrap starting...');

  window.addEventListener('error', (e) => {
    console.error('❌ [CLS] Global error:', e.error || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('❌ [CLS] Unhandled rejection:', e.reason);
  });

  try {
    const CLS = window.CLS;
    if (!CLS) throw new Error('window.CLS không tồn tại — file JS chưa load?');
    if (!CLS.el || !CLS.el.dataTextarea) throw new Error('DOM không tìm thấy — HTML có đúng không?');
    if (!CLS.db) console.warn('⚠️ [CLS] Firebase chưa khởi tạo — chỉ chạy offline');

    console.log('✅ [CLS] DOM & modules ready');

    if (CLS.logPageVisit) CLS.logPageVisit();

    /* Apply theme (light/dark/auto) + density */
    CLS.applyTheme();
    CLS.applyDensity();

    /* Theo dõi thay đổi prefers-color-scheme khi ở chế độ auto */
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onSystemThemeChange = () => {
        if (CLS.state.themeMode === 'auto') CLS.applyTheme();
      };
      if (mq.addEventListener) mq.addEventListener('change', onSystemThemeChange);
      else if (mq.addListener) mq.addListener(onSystemThemeChange);
    } catch (e) { console.warn('matchMedia listener failed:', e); }

    CLS.updateUI();
    CLS.bindEvents();

    CLS.setupFirebaseListeners()
      .then(() => console.log('✅ [CLS] Firebase listeners registered'))
      .catch(e => {
        console.error('❌ [CLS] Firebase init failed:', e);
        const t = document.createElement('div');
        t.className = 'toast-message';
        t.style.background = '#dc2626';
        t.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Lỗi Firebase: ${e.message}`;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 6000);
      });

    window.__cls_loaded = true;
    console.log('🎉 [CLS] Bootstrap completed');
  } catch (err) {
    console.error('❌ [CLS] BOOTSTRAP FAILED:', err);
    document.body.innerHTML = `
      <div style="max-width:600px;margin:80px auto;padding:24px;font-family:system-ui;background:#fef2f2;border:2px solid #dc2626;border-radius:12px;">
        <h2 style="color:#b91c1c;margin:0 0 12px;">⚠️ App khởi động thất bại</h2>
        <p style="color:#7f1d1d;margin:0 0 8px;"><strong>Lỗi:</strong> ${err.message}</p>
        <pre style="background:#fee2e2;padding:12px;border-radius:6px;overflow:auto;font-size:12px;">${err.stack || ''}</pre>
        <p style="color:#57534e;font-size:13px;margin-top:16px;">
          Mở DevTools Console (F12) để xem chi tiết.
        </p>
      </div>
    `;
  }
})();