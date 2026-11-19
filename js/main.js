/* =========================================================
   MAIN — event bindings + auto-extract HIS + PiP + bootstrap
   ========================================================= */
window.CLS = window.CLS || {};

/* ---------- Events ---------- */
(function() {
  function getActiveWin() {
    return window.CLS.getActiveWin ? window.CLS.getActiveWin() : window;
  }

  function getActiveDoc() {
    return window.CLS.getActiveDoc ? window.CLS.getActiveDoc() : getActiveWin().document;
  }

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

  // Hàm này được bơm (inject) trực tiếp vào trang HIS — không dùng biến ngoài phạm vi hàm
  function extractDataFromHIS() {
    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

    function isVisible(node) {
      if (!node || !node.getBoundingClientRect) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function getCellText(cell) {
      if (!cell) return '';
      const field = cell.querySelector('input:not([type="checkbox"]):not([type="radio"]), textarea, select');
      if (field) {
        if (field.tagName === 'SELECT') {
          return clean(field.options[field.selectedIndex]?.text || '');
        }
        return clean(field.value);
      }
      return clean(cell.innerText || cell.textContent);
    }

    function mapHeaderRow(row) {
      const map = { stt: -1, name: -1, value: -1, ref: -1, unit: -1 };
      const cells = Array.from(row.cells || []);

      cells.forEach((cell, idx) => {
        const h = getCellText(cell).toLowerCase();
        if (!h) return;

        if (map.stt === -1 && /^(stt|tt|#)$/.test(h)) {
          map.stt = idx;
        } else if (
          map.name === -1 &&
          !h.includes('loại xét nghiệm') &&
          (h === 'chỉ số' || h.includes('chỉ số') || h.includes('tên xét nghiệm') ||
           h.includes('tên xn') || h.includes('thông số'))
        ) {
          map.name = idx;
        } else if (
          map.value === -1 &&
          !h.includes('tiền sử') && !h.includes('cũ') && !h.includes('trước') &&
          (h === 'kết quả' || h.includes('kết quả') || h === 'kq' || h === 'giá trị' || h === 'result')
        ) {
          map.value = idx;
        } else if (
          map.ref === -1 &&
          (h.includes('tham chiếu') || h.includes('trị số') || h.includes('bình thường') ||
           h.includes('csbt') || h.includes('ngưỡng') || h.includes('reference'))
        ) {
          map.ref = idx;
        } else if (
          map.unit === -1 &&
          (h.includes('đơn vị') || h === 'đv' || h === 'unit')
        ) {
          map.unit = idx;
        }
      });

      let score = 0;
      if (map.name !== -1) score += 3;
      if (map.value !== -1) score += 3;
      if (map.ref !== -1) score += 2;
      if (map.unit !== -1) score += 1;
      if (map.stt !== -1) score += 1;

      return { map, score, colCount: cells.length };
    }

    function findPairedBodyTable(headerTable, expectedCols) {
      let container = headerTable.parentElement;
      for (let depth = 0; depth < 3 && container && container !== document.body; depth++) {
        const candidates = Array.from(container.querySelectorAll('table')).filter((t) => {
          if (t === headerTable || !isVisible(t)) return false;
          if (!(headerTable.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
          const rows = t.tBodies.length ? Array.from(t.tBodies[0].rows) : Array.from(t.rows);
          return rows.length > 0;
        });

        if (candidates.length) {
          const exact = candidates.find((t) => {
            const firstRow = (t.tBodies[0]?.rows[0]) || t.rows[0];
            return firstRow && firstRow.cells.length === expectedCols;
          });
          return exact || candidates[0];
        }
        container = container.parentElement;
      }
      return null;
    }

    // Ưu tiên 1: Chỉ dùng vùng bôi đen nếu người dùng thực sự quét khối nhiều cột/dòng
    const selection = window.getSelection()?.toString() || '';
    if (selection.trim() && /[\t\n]/.test(selection) && /\d/.test(selection)) {
      return { type: 'selection', text: selection.trim() };
    }

    // Ưu tiên 2: Tự động tìm đúng bảng "Danh sách chỉ số" đang hiển thị
    const visibleTables = Array.from(document.querySelectorAll('table')).filter(isVisible);
    let bestCls = null;

    for (const table of visibleTables) {
      const headerCandidates = table.tHead
        ? Array.from(table.tHead.rows)
        : Array.from(table.rows).slice(0, 2);

      let bestHeader = null;
      let headerRowRef = null;
      for (const hRow of headerCandidates) {
        const res = mapHeaderRow(hRow);
        if (!bestHeader || res.score > bestHeader.score) {
          bestHeader = res;
          headerRowRef = hRow;
        }
      }

      // Bắt buộc có cả cột "Chỉ số" và "Kết quả"
      if (!bestHeader || bestHeader.map.name === -1 || bestHeader.map.value === -1) continue;

      let dataRows = [];
      if (table.tBodies && table.tBodies.length) {
        for (const tb of table.tBodies) dataRows.push(...Array.from(tb.rows));
      } else {
        dataRows = Array.from(table.rows);
      }
      dataRows = dataRows.filter((r) => r !== headerRowRef && isVisible(r));

      // Xử lý trường hợp bảng tách header và body thành 2 thẻ <table> riêng
      if (!dataRows.length) {
        const bodyTable = findPairedBodyTable(table, bestHeader.colCount);
        if (bodyTable) {
          const bodyRows = bodyTable.tBodies?.length
            ? Array.from(bodyTable.tBodies[0].rows)
            : Array.from(bodyTable.rows);
          dataRows = bodyRows.filter(isVisible);
        }
      }

      const { map } = bestHeader;
      const lines = [];
      let autoStt = 1;

      for (const row of dataRows) {
        const cells = Array.from(row.cells || []);
        if (cells.length <= Math.max(map.name, map.value)) continue;

        const name = getCellText(cells[map.name]);
        const value = getCellText(cells[map.value]);
        if (!name || !value) continue;

        const nameLower = name.toLowerCase();
        if (nameLower === 'chỉ số' || nameLower === 'tên xét nghiệm') continue;

        let stt = map.stt !== -1 && cells[map.stt] ? getCellText(cells[map.stt]) : '';
        if (!/^\d+$/.test(stt)) stt = String(autoStt);
        autoStt++;

        const ref = map.ref !== -1 && cells[map.ref] ? getCellText(cells[map.ref]) : '';
        const unit = map.unit !== -1 && cells[map.unit] ? getCellText(cells[map.unit]) : '';

        // Giữ '—' nếu khoảng tham chiếu trống để không bị trượt cột Đơn vị
        lines.push([stt, name, value, ref || '—', unit].join('\t'));
      }

      if (lines.length > 0) {
        const candidate = {
          type: 'cls_table',
          score: bestHeader.score,
          rowCount: lines.length,
          text: lines.join('\n')
        };
        if (
          !bestCls ||
          candidate.score > bestCls.score ||
          (candidate.score === bestCls.score && candidate.rowCount > bestCls.rowCount)
        ) {
          bestCls = candidate;
        }
      }
    }

    if (bestCls) return bestCls;

    // Ưu tiên 3 (Dự phòng): Quét bảng hiển thị lớn nhất nếu giao diện khác chuẩn
    if (visibleTables.length > 0) {
      let bestTable = visibleTables[0];
      for (const t of visibleTables) {
        if ((t.innerText || '').length > (bestTable.innerText || '').length) {
          bestTable = t;
        }
      }
      let resultText = '';
      for (const row of bestTable.rows) {
        if (!isVisible(row)) continue;
        resultText += Array.from(row.cells).map(getCellText).join('\t') + '\n';
      }
      return { type: 'table', text: resultText.trim() };
    }

    return null;
  }

  window.CLS.performSummarize = function() {
    const { state, el, parseInputToRows, computeSummary, updateSummary,
            updateStats, renderTable, closeDrawer, pushHistory, showToast, copyToClipboard } = window.CLS;

    const win = getActiveWin();
    const doc = getActiveDoc();
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

    if (doc.activeElement === el.dataTextarea) {
      el.dataTextarea.blur();
    }

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

    if (plain) copyToClipboard(plain);
    showToast('Đã tóm tắt & sao chép');

    el.outputCard.classList.remove('animate-pulse');
    win.requestAnimationFrame(() => {
      win.requestAnimationFrame(() => el.outputCard.classList.add('animate-pulse'));
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
      getActiveDoc().body.classList.add('focus-mode');
      el.clearTextBtn.classList.toggle('hidden', !el.dataTextarea.value.length);
    });
    el.dataTextarea.addEventListener('blur', () => {
      getActiveDoc().body.classList.remove('focus-mode');
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

    /* Nút Quét dữ liệu tự động từ HIS (chạy cả Side Panel lẫn PiP trên GitHub) */
    function requestScanHIS() {
      // Trường hợp 1: Đang chạy trực tiếp bên trong Extension (Side Panel)
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage) {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'CLS_SCAN_HIS' }, (res) => {
            if (chrome.runtime.lastError) {
              return resolve({ ok: false, error: chrome.runtime.lastError.message });
            }
            resolve(res || { ok: false, error: 'Không nhận được phản hồi từ Extension.' });
          });
        });
      }

      // Trường hợp 2: Đang chạy trên web GitHub (tab thường hoặc cửa sổ nổi PiP)
      return new Promise((resolve) => {
        if (document.documentElement.dataset.clsExtReady !== '1') {
          return resolve({
            ok: false,
            error: 'Chưa kết nối Extension. Hãy bật Extension "Tóm tắt CLS" và F5 lại trang web!'
          });
        }

        const requestId = 'scan_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const timer = setTimeout(() => {
          window.removeEventListener('message', onReply);
          resolve({ ok: false, error: 'Hết thời gian chờ Extension — hãy F5 lại trang Tóm tắt CLS.' });
        }, 4000);

        function onReply(event) {
          if (event.source !== window) return;
          const d = event.data;
          if (!d || d.type !== 'CLS_SCAN_RESPONSE' || d.requestId !== requestId) return;
          clearTimeout(timer);
          window.removeEventListener('message', onReply);
          resolve(d);
        }

        window.addEventListener('message', onReply);
        window.postMessage({ type: 'CLS_SCAN_REQUEST', requestId }, window.location.origin);
      });
    }

    const autoExtractBtn = document.getElementById('autoExtractBtn');
    if (autoExtractBtn) {
      autoExtractBtn.addEventListener('click', async () => {
        const origHtml = autoExtractBtn.innerHTML;
        autoExtractBtn.disabled = true;
        autoExtractBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang quét…';

        try {
          const res = await requestScanHIS();
          if (res.ok && res.text && res.text.trim()) {
            el.dataTextarea.value = res.text;
            el.clearTextBtn.classList.remove('hidden');
            window.CLS.performSummarize();
          } else {
            showToast(res.error || 'Không tìm thấy bảng kết quả xét nghiệm!', 4000);
          }
        } catch (err) {
          console.error('AUTO EXTRACT ERROR:', err);
          showToast(`Lỗi quét: ${err.message}`, 5000);
        } finally {
          autoExtractBtn.disabled = false;
          autoExtractBtn.innerHTML = origHtml;
        }
      });
    }
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

    /* Theme + Density segmented */
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
      const panelHead = e.target.closest('.panel-head');
      if (panelHead) {
        const group = panelHead.parentElement;
        const panel = group.dataset.panel;
        const collapsed = group.classList.toggle('collapsed');
        if (collapsed) state.collapsedPanels.add(panel);
        else state.collapsedPanels.delete(panel);
        return;
      }

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
      const win = getActiveWin();
      el.contextMenu.classList.remove('hidden');
      el.contextMenu.style.left = Math.min(e.clientX, win.innerWidth - 180) + 'px';
      el.contextMenu.style.top = Math.min(e.clientY, win.innerHeight - 100) + 'px';
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
      window.CLS.applyTheme();
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
    el.scrollTopBtn.addEventListener('click', () => {
      getActiveWin().scrollTo({ top: 0, behavior: 'smooth' });
    });

    /* Shortcuts (dùng chung cho cửa sổ chính và cửa sổ PiP) */
    function handleGlobalKeydown(e) {
      const cmd = e.ctrlKey || e.metaKey;
      const doc = getActiveDoc();
      if (cmd && e.key === 'Enter') {
        e.preventDefault();
        window.CLS.performSummarize();
      } else if (cmd && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        el.copySummaryBtn.click();
      } else if (e.key === 'Escape') {
        if (doc.activeElement === el.dataTextarea && el.dataTextarea.value) {
          el.clearBtn.click();
          el.dataTextarea.focus();
          return;
        }
        closeDrawer();
        el.itemModal.classList.add('hidden');
        el.settingsModal.classList.add('hidden');
        el.contextMenu.classList.add('hidden');
        el.formatDropdownMenu.classList.add('hidden');
      }
    }
    document.addEventListener('keydown', handleGlobalKeydown);

    /* ---------- Document Picture-in-Picture (PiP) ---------- */
    const pipNodes = [
      el.appShell,
      el.tableContainer,
      el.drawerBackdrop,
      el.settingsModal,
      el.itemModal,
      el.contextMenu,
      el.scrollTopBtn
    ].filter(Boolean);

    function restoreFromPiP() {
      if (!state.pipWindow) return;
      pipNodes.forEach(node => document.body.appendChild(node));
      state.pipWindow = null;

      if (el.pipPlaceholder) el.pipPlaceholder.classList.add('hidden');
      if (el.pipToggleBtn) {
        el.pipToggleBtn.classList.remove('active');
        el.pipToggleBtn.title = 'Cửa sổ nổi (PiP)';
        el.pipToggleBtn.innerHTML = '<i class="fas fa-up-right-from-square"></i>';
      }
      el.scrollTopBtn.classList.toggle('visible', window.scrollY > 300);
      el.appBar.classList.toggle('scrolled', window.scrollY > 8);
      window.CLS.applyTheme();
      window.CLS.applyDensity();
    }

    async function openPiP() {
      if (!('documentPictureInPicture' in window)) {
        return showToast('Trình duyệt không hỗ trợ Document PiP (cần Chrome/Edge 116+)', 4000);
      }
      try {
        const pipWin = await window.documentPictureInPicture.requestWindow({
          width: 430,
          height: 660
        });

        // Copy toàn bộ CSS sang cửa sổ PiP
        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
          const cloned = pipWin.document.createElement('link');
          cloned.rel = 'stylesheet';
          cloned.href = link.href;
          pipWin.document.head.appendChild(cloned);
        });
        document.querySelectorAll('style').forEach(style => {
          const cloned = pipWin.document.createElement('style');
          cloned.textContent = style.textContent;
          pipWin.document.head.appendChild(cloned);
        });

        pipWin.document.title = 'Tóm tắt CLS';
        pipWin.document.body.className = document.body.className;
        pipWin.document.body.classList.add('pip-mode');

        // Di chuyển toàn bộ UI sang cửa sổ PiP
        pipNodes.forEach(node => pipWin.document.body.appendChild(node));
        state.pipWindow = pipWin;

        if (el.pipPlaceholder) el.pipPlaceholder.classList.remove('hidden');
        if (el.pipToggleBtn) {
          el.pipToggleBtn.classList.add('active');
          el.pipToggleBtn.title = 'Đóng cửa sổ nổi (PiP)';
          el.pipToggleBtn.innerHTML = '<i class="fas fa-compress-alt"></i>';
        }

        // Gắn lại sự kiện cho cửa sổ PiP
        pipWin.document.addEventListener('click', (e) => {
          el.formatDropdownMenu.classList.add('hidden');
          if (!el.contextMenu.classList.contains('hidden') && !el.contextMenu.contains(e.target)) {
            el.contextMenu.classList.add('hidden');
          }
        });
        pipWin.document.addEventListener('keydown', handleGlobalKeydown);
        pipWin.addEventListener('scroll', () => {
          const y = pipWin.scrollY;
          el.scrollTopBtn.classList.toggle('visible', y > 250);
          el.appBar.classList.toggle('scrolled', y > 8);
        }, { passive: true });

        pipWin.addEventListener('pagehide', restoreFromPiP);

        // Nếu mở PiP từ tab trung gian (?launchPip=1), tự quay lại đúng tab HIS phía sau
        const params = new URLSearchParams(window.location.search);
        const fromTabId = parseInt(params.get('fromTab'), 10);
        if (fromTabId && typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.update(fromTabId, { active: true }).catch(() => {});
        }

        showToast('Đã mở cửa sổ nổi PiP');
      } catch (err) {
        console.error('PiP ERROR:', err);
        // Chrome chặn bật PiP trực tiếp trong Side Panel → tự mở tab Extension để bật PiP có quyền Quét
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
          const targetTab = await findTargetTabForScan();
          const url = chrome.runtime.getURL(
            'index.html?launchPip=1' + (targetTab?.id ? `&fromTab=${targetTab.id}` : '')
          );
          chrome.tabs.create({ url });
          return;
        }
        showToast(`Không mở được PiP: ${err.message}`, 4000);
      }
    }

    function togglePiP() {
      if (state.pipWindow && !state.pipWindow.closed) {
        state.pipWindow.close();
      } else {
        openPiP();
      }
    }

    if (el.pipToggleBtn) el.pipToggleBtn.addEventListener('click', togglePiP);
    if (el.pipRestoreBtn) {
      el.pipRestoreBtn.addEventListener('click', () => {
        if (state.pipWindow && !state.pipWindow.closed) state.pipWindow.close();
      });
    }
    const pipFocusBtn = document.getElementById('pipFocusBtn');
    if (pipFocusBtn) {
      pipFocusBtn.addEventListener('click', () => {
        if (state.pipWindow && !state.pipWindow.closed) state.pipWindow.focus();
      });
    }

    // Hiện nút mở nhanh 1 chạm khi được chuyển từ Side Panel sang tab Extension
    if (new URLSearchParams(window.location.search).get('launchPip') === '1') {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="pip-card" style="max-width:360px;">
          <div class="pip-icon-wrap"><i class="fas fa-up-right-from-square"></i></div>
          <h3 class="pip-title">Mở cửa sổ nổi Tóm tắt CLS</h3>
          <p class="pip-desc">Bấm nút bên dưới để bật cửa sổ nổi (PiP) và tự động quay lại trang bệnh án.</p>
          <button class="btn btn-primary" id="confirmLaunchPipBtn" style="width:100%;">
            <i class="fas fa-external-link-alt"></i> Mở cửa sổ nổi ngay
          </button>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('#confirmLaunchPipBtn').addEventListener('click', async () => {
        overlay.remove();
        await openPiP();
      });
    }
  };
})();

/* ---------- Bootstrap ---------- */
(function bootstrap() {
  console.log('🚀 [main] Bootstrap starting...');

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

    CLS.applyTheme();
    CLS.applyDensity();

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