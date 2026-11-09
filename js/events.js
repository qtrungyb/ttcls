/* Event bindings */
window.CLS = window.CLS || {};

(function() {
  console.log('📦 [events.js] loading...');

  function openQuickModal(item = null) {
    const { state, el } = window.CLS;
    state.editingQuickId = item ? item.id : null;
    el.modalTitle.innerHTML = item
      ? '<i class="fas fa-edit"></i> Sửa mẫu'
      : '<i class="fas fa-plus-circle"></i> Thêm mẫu mới';
    el.modalContent.value = item ? item.content : '';

    const cats = [...new Set(['Liều dùng thuốc', 'Toàn thân', ...state.customQuickItems.map(x => x.category)])];
    el.catSelect.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('')
      + '<option value="--new--">+ Nhóm mới…</option>';

    if (item) {
      if (cats.includes(item.category)) {
        el.catSelect.value = item.category;
        el.catInput.style.display = 'none';
        el.catInput.value = '';
      } else {
        el.catSelect.value = '--new--';
        el.catInput.value = item.category;
        el.catInput.style.display = 'block';
      }
    } else {
      el.catInput.style.display = 'none';
      el.catInput.value = '';
    }

    el.itemModal.classList.remove('hidden');
  }

  window.CLS.performSummarize = function() {
    const { state, el, parseInputToRows, computeSummary, updateSummary,
            updateStats, renderTable, closeDrawer, pushHistory, showToast, copyToClipboard } = window.CLS;

    const rows = parseInputToRows(el.dataTextarea.value);

    if (!rows.length) {
      const t = el.dataTextarea;
      t.style.transition = 'border-color 0.1s';
      t.style.borderColor = 'var(--abn)';
      setTimeout(() => { t.style.borderColor = ''; }, 500);
      showToast('Không có dữ liệu hợp lệ');
      state.currentRows = []; state.selectedIndices = [];
      state.lastSummaryHtml = ''; state.lastTableSignature = '';
      updateSummary(); updateStats(); renderTable();
      closeDrawer();
      return;
    }

    state.currentRows = rows;
    const main = state.currentRows.reduce((a, r, i) => window.CLS.SPECIAL_NAMES.includes(r.cleanName) ? [...a, i] : a, []);
    state.selectedIndices = main.length ? main : state.currentRows.map((_, i) => i);
    state.lastTableSignature = '';

    requestAnimationFrame(() => el.dataTextarea.blur());

    requestAnimationFrame(() => {
      if (!el.tableContainer.classList.contains('open')) {
        state.isTableDirty = true;
      } else {
        renderTable();
        state.isTableDirty = false;
      }
      updateSummary();
      updateStats();

      const sel = state.currentRows.filter((_, i) => state.selectedIndices.includes(i));
      const { plain } = computeSummary(sel);
      pushHistory(el.dataTextarea.value, plain, state.currentRows.length);

      const doSecondary = () => {
        if (plain) copyToClipboard(plain);
        showToast('Đã tóm tắt & sao chép');
        el.outputCard.classList.remove('animate-pulse');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => el.outputCard.classList.add('animate-pulse'));
        });
      };
      if ('requestIdleCallback' in window) {
        requestIdleCallback(doSecondary, { timeout: 900 });
      } else {
        setTimeout(doSecondary, 60);
      }
    });
  };

  window.CLS.bindEvents = function() {
    const { state, el } = window.CLS;
    const { updateUI, switchTab, resetAbbrForm, showToast,
            getSummaryPlainText, updateSummary, updateStats, renderTable, renderQuick,
            openDrawer, closeDrawer, syncSelection,
            deleteQuickItem, saveQuickItem,
            resetAbbrToDefaults, copyToClipboard, debounce,
            SPECIAL_NAMES, STORAGE } = window.CLS;

    /* Input */
    el.dataTextarea.addEventListener('focus', () => {
      document.body.classList.add('focus-mode');
      el.clearTextBtn.classList.toggle('hidden', !el.dataTextarea.value.length);
    });
    el.dataTextarea.addEventListener('blur', () => {
      document.body.classList.remove('focus-mode');
    });

    const debouncedSummarize = debounce(() => {
      if (state.autoSummarizeEnabled) window.CLS.performSummarize();
    }, 300);

    el.dataTextarea.addEventListener('input', () => {
      el.clearTextBtn.classList.toggle('hidden', !el.dataTextarea.value.length);
      debouncedSummarize();
    });

    el.clearTextBtn.addEventListener('click', () => el.clearBtn.click());
    el.summarizeBtn.addEventListener('click', () => window.CLS.performSummarize());

    el.clearBtn.addEventListener('click', () => {
      el.dataTextarea.value = '';
      el.clearTextBtn.classList.add('hidden');
      state.currentRows = []; state.selectedIndices = [];
      state.lastSummaryHtml = ''; state.lastTableSignature = '';
      updateSummary(); updateStats(); renderTable();
      closeDrawer();
      showToast('Đã làm mới');
    });

    /* Copy */
    el.copySummaryBtn.addEventListener('click', () => {
      const t = getSummaryPlainText();
      if (!t) return showToast('Chưa có dữ liệu');
      copyToClipboard(t).then(() => {
        showToast('Đã copy tóm tắt');
        const orig = el.copySummaryBtn.innerHTML;
        el.copySummaryBtn.classList.add('copied');
        el.copySummaryBtn.innerHTML = '<i class="fas fa-check"></i> Đã copy';
        setTimeout(() => {
          el.copySummaryBtn.classList.remove('copied');
          el.copySummaryBtn.innerHTML = orig;
        }, 1800);
      });
    });

    /* Toggles */
    el.toggleUnitBtn.addEventListener('click', () => {
      state.showUnit = !state.showUnit;
      localStorage.setItem(STORAGE.SHOW_UNIT, state.showUnit);
      updateUI();
      if (state.currentRows.length) updateSummary();
    });
    el.toggleAbbrBtn.addEventListener('click', () => {
      state.showAbbr = !state.showAbbr;
      localStorage.setItem(STORAGE.SHOW_ABBR, state.showAbbr);
      updateUI();
      if (state.currentRows.length) { renderTable(); updateSummary(); }
    });
    el.autoToggleBtn.addEventListener('click', () => {
      state.autoSummarizeEnabled = !state.autoSummarizeEnabled;
      localStorage.setItem(STORAGE.AUTO_SUMMARIZE, state.autoSummarizeEnabled);
      updateUI();
      showToast(state.autoSummarizeEnabled ? 'Bật tự động' : 'Tắt tự động');
    });

    /* Theme toggle — cycle light → dark → auto */
    el.themeToggle.addEventListener('click', () => {
      window.CLS.cycleThemeMode();
      const labels = { light: 'Sáng', dark: 'Tối', auto: 'Theo hệ thống' };
      showToast('Giao diện: ' + labels[state.themeMode]);
    });

    /* Theme + Density segmented (Settings > Giao diện) */
    document.querySelectorAll('#themeSegmented .seg-btn').forEach(b => {
      b.addEventListener('click', () => {
        window.CLS.setThemeMode(b.dataset.theme);
        const labels = { light: 'Sáng', dark: 'Tối', auto: 'Theo hệ thống' };
        showToast('Giao diện: ' + labels[b.dataset.theme]);
      });
    });
    document.querySelectorAll('#densitySegmented .seg-btn').forEach(b => {
      b.addEventListener('click', () => {
        window.CLS.setDensity(b.dataset.density);
        showToast('Mật độ: ' + (b.dataset.density === 'compact' ? 'Gọn' : 'Thoáng'));
      });
    });

    /* Format dropdown */
    el.formatDropdownToggle.addEventListener('click', e => {
      e.stopPropagation();
      el.formatDropdownMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => el.formatDropdownMenu.classList.add('hidden'));
    el.formatItems.forEach(i => i.addEventListener('click', e => {
      e.stopPropagation();
      state.copyFormat = i.dataset.value;
      localStorage.setItem(STORAGE.COPY_FORMAT, state.copyFormat);
      el.formatDropdownMenu.classList.add('hidden');
      updateUI();
      if (state.currentRows.length) updateSummary();
    }));

    /* Drawer */
    el.toggleTableBtn.addEventListener('click', openDrawer);
    el.openDrawerBtn.addEventListener('click', openDrawer);
    el.drawerClose.addEventListener('click', closeDrawer);
    el.drawerApply.addEventListener('click', closeDrawer);
    el.drawerBackdrop.addEventListener('click', closeDrawer);

    el.tableBody.addEventListener('change', (e) => {
      if (!e.target.classList.contains('row-select')) return;
      const i = parseInt(e.target.dataset.index, 10);
      if (e.target.checked && !state.selectedIndices.includes(i)) state.selectedIndices.push(i);
      else state.selectedIndices = state.selectedIndices.filter(x => x !== i);
      state.selectedIndices.sort((a, b) => a - b);
      const row = e.target.closest('.detail-row');
      if (row) row.classList.toggle('selected', e.target.checked);
      updateStats();
      updateSummary();
    });

    el.tableBody.addEventListener('click', (e) => {
      /* Panel collapse */
      const panelHead = e.target.closest('.panel-head');
      if (panelHead) {
        const group = panelHead.parentElement;
        const panel = group.dataset.panel;
        const collapsed = group.classList.toggle('collapsed');
        if (collapsed) state.collapsedPanels.add(panel);
        else state.collapsedPanels.delete(panel);
        return;
      }

      /* Row toggle */
      const row = e.target.closest('.detail-row');
      if (!row) return;
      if (e.target.tagName === 'INPUT') return;
      const cb = row.querySelector('.row-select');
      if (!cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });

    el.selectMainBtn.addEventListener('click', () => {
      syncSelection(state.currentRows.reduce((a, r, i) => SPECIAL_NAMES.includes(r.cleanName) ? [...a, i] : a, []));
    });
    el.selectAbnormalBtn.addEventListener('click', () => {
      syncSelection(state.currentRows.reduce((a, r, i) => r._status === 'abnormal' ? [...a, i] : a, []));
    });
    el.selectAllBtn.addEventListener('click', () => syncSelection(state.currentRows.map((_, i) => i)));
    el.deselectAllBtn.addEventListener('click', () => syncSelection([]));

    /* Quick copy */
    el.quickTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.quick-tab');
      if (!tab) return;
      state.activeQuickTab = tab.dataset.tab;
      renderQuick();
    });
    el.quickSearch.addEventListener('input', debounce(() => renderQuick(), 200));
    el.quickCopyGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.quick-card');
      if (!card) return;
      const item = state.customQuickItems.find(x => x.id === card.dataset.id);
      if (item) {
        copyToClipboard(item.content).then(() => showToast('Đã sao chép!'));
      }
    });
    el.quickCopyGrid.addEventListener('contextmenu', (e) => {
      const card = e.target.closest('.quick-card');
      if (!card) return;
      e.preventDefault();
      state.contextMenuTargetId = card.dataset.id;
      el.contextMenu.classList.remove('hidden');
      el.contextMenu.style.left = Math.min(e.pageX, window.innerWidth - 180) + 'px';
      el.contextMenu.style.top = Math.min(e.pageY, window.innerHeight - 100) + 'px';
    });

    /* Quick copy collapse */
    if (el.quickToggle && el.quickBody) {
      const COLLAPSED_KEY = 'cls_quick_collapsed';
      if (localStorage.getItem(COLLAPSED_KEY) === 'true') {
        el.quickBody.classList.add('collapsed');
        el.quickToggle.classList.add('collapsed');
      }
      el.quickToggle.addEventListener('click', () => {
        const isCollapsed = el.quickBody.classList.toggle('collapsed');
        el.quickToggle.classList.toggle('collapsed', isCollapsed);
        localStorage.setItem(COLLAPSED_KEY, isCollapsed ? 'true' : 'false');
      });
    }

    /* Quick modal */
    el.btnAddQuickCopy.addEventListener('click', () => openQuickModal(null));
    el.catSelect.addEventListener('change', () => {
      const isNew = el.catSelect.value === '--new--';
      el.catInput.style.display = isNew ? 'block' : 'none';
      if (isNew) el.catInput.focus();
    });
    el.modalCancel.addEventListener('click', () => el.itemModal.classList.add('hidden'));
    el.modalCloseBtn.addEventListener('click', () => el.itemModal.classList.add('hidden'));

    el.modalSave.addEventListener('click', () => {
      const c = el.catSelect.value === '--new--' ? el.catInput.value.trim() : el.catSelect.value;
      const t = el.modalContent.value.trim();
      if (!t) return showToast('Nhập nội dung!');

      saveQuickItem(state.editingQuickId, c, t)
        .then(() => {
          el.itemModal.classList.add('hidden');
          showToast(state.editingQuickId ? 'Đã cập nhật' : 'Đã lưu');
        })
        .catch(e => {
          console.error('SAVE QUICK FAILED:', e);
          showToast(`❌ Lỗi lưu: ${e.message || 'Không có quyền'}`, 4000);
        });
    });

    /* Settings */
    el.settingsBtn.addEventListener('click', () => {
      resetAbbrForm();
      switchTab('tabList');
      window.CLS.applyTheme();   // đồng bộ nút segmented
      window.CLS.applyDensity();
      el.settingsModal.classList.remove('hidden');
    });
    el.btnCloseSettings.addEventListener('click', () => el.settingsModal.classList.add('hidden'));
    el.tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    el.btnCancelEditAbbr.addEventListener('click', () => { resetAbbrForm(); switchTab('tabList'); });

    el.btnAddAbbr.addEventListener('click', () => {
      const k = el.newAbbrKey.value.trim();
      const v = el.newAbbrValue.value.trim();
      const id = el.editAbbrId.value;
      if (!k || !v) return showToast('Nhập đủ tên gốc và viết tắt');

      const promise = id
        ? window.CLS.db.ref('abbreviations/' + id).update({ raw: k, short: v })
        : window.CLS.abbrRef.push({ raw: k, short: v });

      promise
        .then(() => {
          showToast(id ? 'Đã cập nhật' : 'Đã thêm mới');
          resetAbbrForm();
          switchTab('tabList');
        })
        .catch(e => {
          console.error('SAVE ABBR FAILED:', e);
          showToast(`❌ Lỗi lưu: ${e.message || 'Không có quyền'}`, 4000);
        });
    });

    el.btnResetAbbr.addEventListener('click', async () => {
      const n = state.firebaseAbbrList.length;
      if (!confirm(`⚠️ Xóa toàn bộ ${n} viết tắt hiện tại và khôi phục 6 mặc định?\n\nThao tác này KHÔNG THỂ HOÀN TÁC.`)) return;
      try {
        await resetAbbrToDefaults();
        showToast('Đã khôi phục mặc định');
      } catch (e) {
        console.error('RESET ABBR FAILED:', e);
        showToast(`❌ Reset thất bại: ${e.message || 'Không có quyền'}`, 4000);
      }
    });

    /* Context menu */
    document.addEventListener('click', (e) => {
      if (!el.contextMenu.classList.contains('hidden') && !el.contextMenu.contains(e.target)) {
        el.contextMenu.classList.add('hidden');
      }
    });
    el.menuEdit.addEventListener('click', () => {
      const item = state.customQuickItems.find(x => x.id === state.contextMenuTargetId);
      if (item) openQuickModal(item);
      el.contextMenu.classList.add('hidden');
    });
    el.menuDelete.addEventListener('click', () => {
      deleteQuickItem(state.contextMenuTargetId).catch(() => {});
      el.contextMenu.classList.add('hidden');
    });

    /* Modals backdrop click */
    [el.itemModal, el.settingsModal].forEach(m => {
      m.addEventListener('click', e => {
        if (e.target === m) m.classList.add('hidden');
      });
    });

    /* Scroll */
    let scrolling = false;
    window.addEventListener('scroll', () => {
      if (!scrolling) {
        requestAnimationFrame(() => {
          const y = window.scrollY;
          el.scrollTopBtn.classList.toggle('visible', y > 300);
          el.appBar.classList.toggle('scrolled', y > 8);
          scrolling = false;
        });
        scrolling = true;
      }
    }, { passive: true });
    el.scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    /* Shortcuts */
    document.addEventListener('keydown', (e) => {
      const cmd = e.ctrlKey || e.metaKey;
      if (cmd && e.key === 'Enter') {
        e.preventDefault();
        window.CLS.performSummarize();
      } else if (cmd && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        el.copySummaryBtn.click();
      } else if (e.key === 'Escape') {
        /* ESC khi đang focus input → xoá ngay */
        if (document.activeElement === el.dataTextarea && el.dataTextarea.value) {
          el.clearBtn.click();
          el.dataTextarea.focus();
          return;
        }
        /* Còn lại: đóng mọi thứ */
        closeDrawer();
        el.itemModal.classList.add('hidden');
        el.settingsModal.classList.add('hidden');
        el.contextMenu.classList.add('hidden');
        el.formatDropdownMenu.classList.add('hidden');
      }
    });
  };

  console.log('✅ [events.js] bindEvents defined:', typeof window.CLS.bindEvents);
})();