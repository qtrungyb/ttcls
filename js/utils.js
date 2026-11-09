/* Pure helpers + toast + clipboard */
window.CLS = window.CLS || {};

(function() {
  window.CLS.escapeHtml = function(str) {
    return str ? String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])) : '';
  };

  window.CLS.escapeAttr = function(str) {
    return str ? String(str).replace(/[&<>"']/g, m =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) : '';
  };

  window.CLS.parseNumber = function(str) {
    const m = str && String(str).replace(/,/g, '.').replace(/\s+/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  };

  window.CLS.debounce = function(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  /* Phân nhóm chỉ số theo panel */
  window.CLS.classifyPanel = function(name) {
    if (!name) return 'Khac';
    const s = String(name).toLowerCase();

    // Đông máu
    if (s.includes('đông máu') || s.includes('prothrombin') || s.includes('fibrinogen') ||
        s.includes('d-dimer') || s.includes('d dimer') || s.includes('thrombin') ||
        /\b(pt|aptt|inr|tt)\b/.test(s)) return 'DongMau';

    // Huyết học
    if (s.includes('hồng cầu') || s.includes('huyết sắc tố') || s.includes('hematocrit') ||
        s.includes('hemoglobin') || s.includes('tiểu cầu') || s.includes('bạch cầu') ||
        s.includes('neutrophil') || s.includes('lympho') || s.includes('mono') ||
        s.includes('eosino') || s.includes('baso') || s.includes('tỷ lệ bạch cầu') ||
        /\b(mcv|mch|mchc|rdw|mpv|pdw|wbc|rbc|plt|hgb|hct|neut|lym)\b/.test(s)) return 'HuyetHoc';

    // Miễn dịch
    if (s.includes('hbsag') || s.includes('anti-hbs') || s.includes('anti-hcv') ||
        s.includes('anti-hiv') || s.includes('tsh') || s.includes('ft3') || s.includes('ft4') ||
        s.includes('crp') || s.includes('procalcitonin') || s.includes('ana') ||
        s.includes('kháng thể') || s.includes('miễn dịch') || s.includes('globulin')) return 'MienDich';

    // Nước tiểu
    if (s.includes('nước tiểu') || s.includes('niệu') || s.includes('urine')) return 'NuocTieu';

    // Mặc định: sinh hoá (đa số xét nghiệm máu)
    return 'SinhHoa';
  };

  window.CLS.showToast = function(msg, duration = 2200) {
    document.querySelector('.toast-message')?.remove();
    const t = document.createElement('div');
    t.className = 'toast-message';
    t.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => {
      t.classList.add('fade-out');
      setTimeout(() => t.remove(), 350);
    }, duration);
  };

  /* Clipboard — có fallback vì file:// đôi khi chặn navigator.clipboard */
  window.CLS.copyToClipboard = function(text) {
    if (navigator.clipboard && window.isSecureContext !== false) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  };

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    if (!ok) console.warn('Clipboard copy failed');
  }
})();