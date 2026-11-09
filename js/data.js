/* Firebase listeners & CRUD — compat API */
window.CLS = window.CLS || {};

(function() {
  const { SEEDED_KEY, DEFAULT_ABBR_MAP } = window.CLS;

  async function maybeSeedDefaults() {
    if (localStorage.getItem(SEEDED_KEY)) return;
    if (!window.CLS.abbrRef) return;
    try {
      const snap = await window.CLS.abbrRef.once('value');
      if (!snap.exists()) {
        for (const [raw, short] of Object.entries(DEFAULT_ABBR_MAP)) {
          await window.CLS.abbrRef.push({ raw, short });
        }
      }
      localStorage.setItem(SEEDED_KEY, '1');
      console.log('✅ [CLS] Seeded defaults');
    } catch (e) {
      console.warn('Seed check failed:', e);
    }
  }

  window.CLS.setupFirebaseListeners = async function() {
    if (window.CLS.firebaseError) {
      console.error('❌ Firebase error:', window.CLS.firebaseError);
      return;
    }

    await maybeSeedDefaults();

    window.CLS.abbrRef.on('value', (snapshot) => {
      const { state, renderAbbrList, renderTable, updateSummary } = window.CLS;
      state.currentAbbrMap = {};
      state.firebaseAbbrList = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach(key => {
          const item = data[key];
          if (item && item.raw != null && item.short != null) {
            state.firebaseAbbrList.push({ id: key, raw: item.raw, short: item.short });
            state.currentAbbrMap[item.raw] = item.short;
          }
        });
      }
      state.lastTableSignature = '';
      renderAbbrList();
      if (state.currentRows.length) { renderTable(); updateSummary(); }
    }, (err) => {
      console.error('❌ abbrRef on() failed:', err);
    });

    window.CLS.quickCopyRef.on('value', (snapshot) => {
      const { state, renderQuick } = window.CLS;
      state.customQuickItems = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach(key => {
          const item = data[key];
          if (item && item.content != null) {
            state.customQuickItems.push({
              id: key,
              category: item.category || 'Khác',
              content: item.content
            });
          }
        });
      }
      renderQuick();
    }, (err) => {
      console.error('❌ quickCopyRef on() failed:', err);
    });

    console.log('✅ [CLS] Firebase listeners registered');
  };

  window.CLS.resetAbbrToDefaults = async function() {
    await window.CLS.abbrRef.remove();
    for (const [raw, short] of Object.entries(DEFAULT_ABBR_MAP)) {
      await window.CLS.abbrRef.push({ raw, short });
    }
    localStorage.setItem(SEEDED_KEY, '1');
  };

  window.CLS.deleteQuickItem = function(id) {
    if (!confirm('Xóa mẫu này?')) return Promise.resolve(false);
    return window.CLS.db.ref('quickCopyItems/' + id).remove()
      .then(() => { window.CLS.showToast('Đã xóa'); return true; })
      .catch(e => {
        console.error('DELETE QUICK FAILED:', e);
        window.CLS.showToast(`❌ Xóa thất bại: ${e.message || 'Không có quyền'}`, 4000);
        throw e;
      });
  };

  window.CLS.saveQuickItem = function(id, category, content) {
    const cat = category || 'Khác';
    if (id) {
      return window.CLS.db.ref('quickCopyItems/' + id).set({ category: cat, content });
    }
    return window.CLS.quickCopyRef.push({ category: cat, content });
  };

  window.CLS.exportBackup = async function() {
    const [abbrSnap, quickSnap] = await Promise.all([
      window.CLS.abbrRef.once('value'),
      window.CLS.quickCopyRef.once('value')
    ]);
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      abbreviations: abbrSnap.val() || {},
      quickCopyItems: quickSnap.val() || {}
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cls-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    window.CLS.showToast(`Đã xuất backup (${Object.keys(backup.abbreviations).length} VT, ${Object.keys(backup.quickCopyItems).length} mẫu)`);
  };

  window.CLS.importBackup = async function(file) {
    let text;
    try { text = await file.text(); } catch { throw new Error('Không đọc được file'); }

    let backup;
    try { backup = JSON.parse(text); } catch { throw new Error('File JSON không hợp lệ'); }

    if (!backup.abbreviations && !backup.quickCopyItems) {
      throw new Error('File không đúng định dạng backup CLS');
    }

    const abbrCount = Object.keys(backup.abbreviations || {}).length;
    const quickCount = Object.keys(backup.quickCopyItems || {}).length;

    if (!confirm(
      `⚠️ GHI ĐÈ dữ liệu hiện tại bằng:\n\n` +
      `• ${abbrCount} viết tắt\n` +
      `• ${quickCount} mẫu copy nhanh\n\n` +
      `Từ: ${backup.exportedAt || 'không rõ'}\n\n` +
      `Dữ liệu hiện tại sẽ BỊ MẤT. Tiếp tục?`
    )) return false;

    await window.CLS.abbrRef.set(backup.abbreviations || {});
    await window.CLS.quickCopyRef.set(backup.quickCopyItems || {});
    localStorage.setItem(SEEDED_KEY, '1');
    window.CLS.showToast('Đã khôi phục backup thành công');
    return true;
  };
})();