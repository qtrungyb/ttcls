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

   window.CLS.performSummarize = function(meta = null) {
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

    // Nhánh chế độ Gộp nhiều phiếu trên Trang chính & PiP
    if (state.mergeEnabled && window.CLS.upsertWebMergedSheet) {
      const info = window.CLS.upsertWebMergedSheet(el.dataTextarea.value.trim(), rows, meta);
      updateSummary();
      updateStats();
      const mergedPlain = window.CLS.getSummaryPlainText();
      pushHistory(el.dataTextarea.value, mergedPlain, state.currentRows.length);
      if (mergedPlain) copyToClipboard(mergedPlain);

      const toastMsg = info.patientSwitched
        ? `Đổi BN ${state.mergePatient?.name || state.mergePatient?.id} — gộp mới (${info.label})`
        : (info.isUpdated
          ? `Đã cập nhật ${info.label} (${info.count} phiếu) & copy`
          : `Đã gộp +${info.label} (${info.count} phiếu) & copy`);
      showToast(toastMsg, 2200);

      el.outputCard.classList.remove('animate-pulse');
      win.requestAnimationFrame(() => {
        win.requestAnimationFrame(() => el.outputCard.classList.add('animate-pulse'));
      });
      if (state.pipWindow && !state.pipWindow.closed) {
        state.pipWindow.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
  };

  window.CLS.bindEvents = function() {
    const { state, el } = window.CLS;
    const { updateUI, switchTab, resetAbbrForm, showToast,
            getSummaryPlainText: origGetSummaryPlainText,
            updateSummary: origUpdateSummary,
            updateStats: origUpdateStats,
            renderTable, renderQuick,
            openDrawer, closeDrawer, syncSelection,
            deleteQuickItem, saveQuickItem,
            resetAbbrToDefaults, copyToClipboard, debounce,
            SPECIAL_NAMES, STORAGE } = window.CLS;

    /* ---------- Chế độ Gộp nhiều phiếu trên Trang chính & PiP ---------- */
    const WEB_MERGE_KEY = 'cls_web_merge_session_v1';
    const WEB_MERGE_ON_KEY = 'cls_web_merge_enabled';
    const WEB_MERGE_FILTER_KEY = 'cls_web_merge_filter';
    const WEB_MERGE_PRIORITY = { CTM: 1, SHM: 2, ĐGĐ: 3, MD: 4, TPTNT: 5, ĐM: 6, KM: 7, VS: 8, XN: 9 };

    const mergeToggleBtn = document.getElementById('mergeToggleBtn');
    const mergeBtnText = document.getElementById('mergeBtnText');
    const webMergeBar = document.getElementById('webMergeBar');
    const webPatientBadge = document.getElementById('webPatientBadge');
    const webMergeChips = document.getElementById('webMergeChips');
    const webClearMergeBtn = document.getElementById('webClearMergeBtn');
    const webMergeFilterBtns = document.querySelectorAll('#webMergeFilters .web-mf-btn');
    const summaryTextEl = document.getElementById('summaryText');
    const totalIndEl = document.getElementById('totalIndicators');
    const abnIndEl = document.getElementById('abnormalIndicators');
    const selBadgeEl = document.getElementById('selectedCountBadge');

    state.mergeEnabled = localStorage.getItem(WEB_MERGE_ON_KEY) === 'true';
    state.mergeFilter = localStorage.getItem(WEB_MERGE_FILTER_KEY) || 'main';
    state.mergePatient = { id: '', name: '' };
    state.mergedSheets = [];

    const escHtml = (s) => s ? String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])) : '';
    const escAttr = (s) => s ? String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])) : '';

    function webRowOverlap(rowsA, rowsB) {
      if (!rowsA?.length || !rowsB?.length) return 0;
      const setA = new Set(rowsA.map((r) => r.cleanName.toLowerCase()));
      const setB = new Set(rowsB.map((r) => r.cleanName.toLowerCase()));
      let common = 0;
      for (const n of setA) if (setB.has(n)) common++;
      return common / Math.min(setA.size, setB.size);
    }

    function webShortLabel(serviceName, rows) {
      const names = (rows || []).map((r) => r.cleanName.toLowerCase()).join(' | ');
      const svc = String(serviceName || '').toLowerCase();
      if (svc.includes('nước tiểu') || svc.includes('tptnt') || names.includes('tỷ trọng') || names.includes('urobilinogen') || names.includes('nitrit') || names.includes('cetonic') || names.includes('keton')) return 'TPTNT';
      if (names.includes('huyết sắc tố') || names.includes('hematocrit') || names.includes('số lượng hồng cầu') || names.includes('số lượng tiểu cầu') || names.includes('số lượng bạch cầu') || names.includes('thể tích trung bình hồng cầu') || /\bmcv\b|\bmch\b|\bmchc\b/.test(names)) return 'CTM';
      if (/\binr\b|\baptt\b/.test(names) || names.includes('fibrinogen') || names.includes('prothrombin') || names.includes('d-dimer')) return 'ĐM';
      if (/\bpco2\b|\bpo2\b|\bhco3\b/.test(names)) return 'KM';
      if (svc.includes('miễn dịch') || names.includes('ferritin') || names.includes('procalcitonin') || names.includes('troponin') || names.includes('pro-bnp') || names.includes('hbsag') || names.includes('anti-hbs') || names.includes('anti-hcv') || names.includes('dengue') || names.includes('beta-hcg') || names.includes('cortisol') || names.includes('insulin') || names.includes('vitamin d') || names.includes('vitamin b12') || names.includes('acid folic') || /\b(tsh|ft3|ft4|afp|cea|psa|hiv|ns1|ige|igg|igm|aso|anti-ccp)\b/.test(names)) return 'MD';
      if (names.includes('sgpt') || names.includes('sgot') || /\b(alt|ast|ggt|crp|hdl|ldl|ldh|ck-mb|alp|tibc|nh3)\b/.test(names) || names.includes('creatinin') || names.includes('urê') || names.includes('urea') || names.includes('glucose') || names.includes('cholesterol') || names.includes('triglycerid') || names.includes('acid uric') || names.includes('hba1c') || names.includes('amylase') || names.includes('lipase') || names.includes('albumin') || names.includes('protein') || names.includes('bilirubin') || names.includes('sắt huyết thanh') || names.includes('định lượng sắt') || names.includes('transferrin') || names.includes('canxi') || names.includes('calcium') || names.includes('magie') || names.includes('phospho') || names.includes('lactat')) return 'SHM';
      if (svc.includes('điện giải') || names.includes('natri') || names.includes('kali') || names.includes('clo') || names.includes('na+') || names.includes('k+')) return 'ĐGĐ';
      if (svc.includes('huyết học') || svc.includes('công thức máu') || svc.includes('tế bào máu')) return 'CTM';
      if (svc.includes('hóa sinh') || svc.includes('sinh hóa')) return 'SHM';
      if (svc.includes('đông máu')) return 'ĐM';
      if (svc.includes('vi sinh')) return 'VS';
      if (svc.includes('khí máu')) return 'KM';
      if (serviceName) return serviceName.replace(/^xét nghiệm\s+/i, '').trim().slice(0, 18);
      return 'XN';
    }

    function sortWebMergedSheets() {
      state.mergedSheets.sort((a, b) => (WEB_MERGE_PRIORITY[a.label] || 9) - (WEB_MERGE_PRIORITY[b.label] || 9));
    }

    function saveWebMergeSession(syncToExt = true) {
      const payload = {
        patient: state.mergePatient,
        sheets: state.mergedSheets.map((s) => ({
          key: s.key,
          label: s.label,
          serviceName: s.serviceName,
          resultTime: s.resultTime,
          rawText: s.rawText
        })),
        updatedAt: Date.now()
      };
      try { localStorage.setItem(WEB_MERGE_KEY, JSON.stringify(payload)); } catch {}
      if (syncToExt && document.documentElement.dataset.clsExtReady === '1') {
        document.dispatchEvent(new CustomEvent('cls-merge-save', { detail: JSON.stringify(payload) }));
      }
    }

    function applyWebMergePayload(saved) {
      if (!saved || typeof saved !== 'object') return;
      state.mergePatient = { id: saved.patient?.id || '', name: saved.patient?.name || '' };
      state.mergedSheets = Array.isArray(saved.sheets)
        ? saved.sheets
            .map((s) => {
              const rows = window.CLS.parseInputToRows(s.rawText);
              if (!rows.length) return null;
              return {
                key: s.key,
                label: webShortLabel(s.serviceName, rows),
                serviceName: s.serviceName || '',
                resultTime: s.resultTime || '',
                rawText: s.rawText,
                rows
              };
            })
            .filter(Boolean)
        : [];
      sortWebMergedSheets();
      if (state.mergedSheets.length) {
        state.lastAutoScannedText = state.mergedSheets[state.mergedSheets.length - 1].rawText;
      }
    }

    function buildWebMergedResult() {
      const total = state.mergedSheets.reduce((sum, s) => sum + s.rows.length, 0);
      const abn = state.mergedSheets.reduce((sum, s) => sum + s.rows.filter((r) => r._status === 'abnormal').length, 0);
      let selectedCount = 0;

      if (!state.mergedSheets.length) {
        return { total: 0, abn: 0, selectedCount: 0, html: '', plain: '' };
      }

      const groups = [];
      for (const sheet of state.mergedSheets) {
        let filtered = sheet.rows;
        if (state.mergeFilter === 'main') {
          const m = sheet.rows.filter((r) => SPECIAL_NAMES.includes(r.cleanName));
          filtered = m.length ? m : sheet.rows;
        } else if (state.mergeFilter === 'abnormal') {
          filtered = sheet.rows.filter((r) => r._status === 'abnormal');
        }
        if (!filtered.length) continue;
        selectedCount += filtered.length;

        const target = groups.find((g) => g.label === sheet.label && webRowOverlap(g.rows, filtered) === 0);
        if (target) target.rows.push(...filtered);
        else groups.push({ label: sheet.label, rows: [...filtered] });
      }

      const htmlBlocks = [];
      const plainBlocks = [];
      for (const g of groups) {
        const { html, plain } = window.CLS.computeSummary(g.rows);
        if (!plain) continue;
        if (state.copyFormat === 'newline') {
          htmlBlocks.push(`<span class="grp-label">- ${escHtml(g.label)}:</span><br>${html}`);
          plainBlocks.push(`- ${g.label}:\n${plain}`);
        } else {
          htmlBlocks.push(`<span class="grp-label">- ${escHtml(g.label)}:</span> ${html}`);
          plainBlocks.push(`- ${g.label}: ${plain}`);
        }
      }

      return { total, abn, selectedCount, html: htmlBlocks.join('<br>'), plain: plainBlocks.join('\n') };
    }

    function renderWebMergeUI() {
      if (mergeToggleBtn) mergeToggleBtn.classList.toggle('active', state.mergeEnabled);
      if (mergeBtnText) {
        mergeBtnText.textContent = state.mergeEnabled && state.mergedSheets.length
          ? `Gộp (${state.mergedSheets.length})`
          : 'Gộp';
      }
      if (!webMergeBar) return;
      webMergeBar.classList.toggle('hidden', !state.mergeEnabled);
      if (!state.mergeEnabled) return;

      const p = state.mergePatient;
      if (webPatientBadge) {
        if (p.name && p.id) webPatientBadge.textContent = `BN: ${p.name} (${p.id})`;
        else if (p.name) webPatientBadge.textContent = `BN: ${p.name}`;
        else if (p.id) webPatientBadge.textContent = `Mã BN: ${p.id}`;
        else webPatientBadge.textContent = 'Chế độ gộp nhiều phiếu XN';
      }
      if (webClearMergeBtn) webClearMergeBtn.classList.toggle('hidden', state.mergedSheets.length === 0);
      webMergeFilterBtns.forEach((b) => b.classList.toggle('active', b.dataset.filter === state.mergeFilter));

      if (webMergeChips) {
        if (!state.mergedSheets.length) {
          webMergeChips.innerHTML = '<span class="web-merge-empty">Chuyển lần lượt các phiếu trên HIS hoặc dán nhiều bảng để tự động gộp…</span>';
        } else {
          webMergeChips.innerHTML = state.mergedSheets.map((s, idx) => {
            const tip = [s.serviceName || s.label, s.resultTime].filter(Boolean).join(' — ');
            return `<span class="web-merge-chip" data-idx="${idx}" title="${escAttr(tip)}"><span>${escHtml(s.label)}</span><span class="web-merge-chip-count">(${s.rows.length})</span><button class="web-merge-chip-del" data-del="${idx}" title="Bỏ phiếu này">&times;</button></span>`;
          }).join('');
        }
      }
    }

    function updateSummary() {
      renderWebMergeUI();
      if (!state.mergeEnabled) return origUpdateSummary();
      const res = buildWebMergedResult();
      if (summaryTextEl) {
        summaryTextEl.innerHTML = res.html || '<div class="empty-state"><i class="fas fa-layer-group"></i><p>Chưa có phiếu nào được gộp</p></div>';
      }
    }

    function updateStats() {
      if (!state.mergeEnabled) return origUpdateStats();
      const res = buildWebMergedResult();
      if (totalIndEl) totalIndEl.textContent = res.total;
      if (abnIndEl) abnIndEl.textContent = res.abn;
      if (selBadgeEl) selBadgeEl.textContent = `${res.selectedCount}/${res.total}`;
    }

    function getSummaryPlainText() {
      if (!state.mergeEnabled) return origGetSummaryPlainText();
      return buildWebMergedResult().plain;
    }

    window.CLS.updateSummary = updateSummary;
    window.CLS.updateStats = updateStats;
    window.CLS.getSummaryPlainText = getSummaryPlainText;

    window.CLS.upsertWebMergedSheet = function(rawText, rows, meta) {
      let patientSwitched = false;
      const incomingId = meta?.patientId || '';
      const incomingName = meta?.patientName || '';

      if (incomingId && state.mergePatient.id && incomingId !== state.mergePatient.id) {
        state.mergedSheets = [];
        patientSwitched = true;
      }
      if (incomingId) state.mergePatient.id = incomingId;
      if (incomingName) state.mergePatient.name = incomingName;

      const label = webShortLabel(meta?.serviceName, rows);
      const resultTime = (meta?.resultTime || '').trim();
      const sig = rows.slice(0, 3).map((r) => r.cleanName.toLowerCase()).join('|');
      const key = [label.toLowerCase(), resultTime, sig].filter(Boolean).join('__');

      const sheetObj = { key, label, serviceName: meta?.serviceName || label, resultTime, rawText, rows };

      let existingIdx = state.mergedSheets.findIndex((s) => s.rawText === rawText);
      if (existingIdx === -1) {
        existingIdx = state.mergedSheets.findIndex((s) => {
          if (s.label !== label) return false;
          if (s.resultTime && resultTime && s.resultTime !== resultTime) return false;
          return webRowOverlap(s.rows, rows) >= 0.5;
        });
      }

      const isUpdated = existingIdx !== -1;
      if (isUpdated) {
        if (!sheetObj.resultTime && state.mergedSheets[existingIdx].resultTime) {
          sheetObj.resultTime = state.mergedSheets[existingIdx].resultTime;
        }
        state.mergedSheets[existingIdx] = sheetObj;
      } else {
        state.mergedSheets.push(sheetObj);
      }

      sortWebMergedSheets();
      saveWebMergeSession(true);
      return { label, isUpdated, patientSwitched, count: state.mergedSheets.length };
    };

    window.CLS.clearWebMergeSession = function(notify = true) {
      state.mergedSheets = [];
      state.mergePatient = { id: '', name: '' };
      state.lastAutoScannedText = '';
      saveWebMergeSession(true);
      updateSummary();
      updateStats();
      if (notify) showToast('Đã xóa danh sách gộp');
    };

    // Nạp phiên gộp đang lưu tại localStorage khi vừa mở trang
    try {
      const savedLocal = localStorage.getItem(WEB_MERGE_KEY);
      if (savedLocal) applyWebMergePayload(JSON.parse(savedLocal));
    } catch {}
    updateSummary();
    updateStats();

    if (mergeToggleBtn) {
      mergeToggleBtn.addEventListener('click', () => {
        state.mergeEnabled = !state.mergeEnabled;
        localStorage.setItem(WEB_MERGE_ON_KEY, state.mergeEnabled);
        if (state.mergeEnabled && state.currentRows.length && el.dataTextarea.value.trim()) {
          window.CLS.upsertWebMergedSheet(el.dataTextarea.value.trim(), state.currentRows, null);
        }
        pushSettingsToExtension();
        updateSummary();
        updateStats();
        const plain = getSummaryPlainText();
        if (state.mergeEnabled && plain) copyToClipboard(plain);
        showToast(state.mergeEnabled ? 'Bật chế độ Gộp nhiều phiếu XN' : 'Tắt chế độ Gộp phiếu');
      });
    }

    if (webClearMergeBtn) {
      webClearMergeBtn.addEventListener('click', () => window.CLS.clearWebMergeSession(true));
    }

    webMergeFilterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.mergeFilter = btn.dataset.filter;
        localStorage.setItem(WEB_MERGE_FILTER_KEY, state.mergeFilter);
        pushSettingsToExtension();
        updateSummary();
        updateStats();
        const plain = getSummaryPlainText();
        if (plain) copyToClipboard(plain).then(() => showToast('Đã cập nhật bộ lọc & sao chép'));
      });
    });

    if (webMergeChips) {
      webMergeChips.addEventListener('click', (e) => {
        const del = e.target.closest('[data-del]');
        if (del) {
          const idx = parseInt(del.dataset.del, 10);
          if (!isNaN(idx)) {
            state.mergedSheets.splice(idx, 1);
            if (!state.mergedSheets.length) state.mergePatient = { id: '', name: '' };
            saveWebMergeSession(true);
            updateSummary();
            updateStats();
            const plain = getSummaryPlainText();
            if (plain) copyToClipboard(plain).then(() => showToast('Đã bỏ phiếu & sao chép lại'));
          }
          return;
        }
        const chip = e.target.closest('.web-merge-chip');
        if (chip) {
          const sheet = state.mergedSheets[parseInt(chip.dataset.idx, 10)];
          if (sheet) el.dataTextarea.value = sheet.rawText;
        }
      });
    }

    // Nhận đồng bộ danh sách gộp từ Extension (khi gộp ngầm trên HIS hoặc sửa ở Popup/Thanh bên)
    document.addEventListener('cls-merge-sync', (ev) => {
      let saved = null;
      try { saved = typeof ev.detail === 'string' ? JSON.parse(ev.detail) : ev.detail; } catch {}
      if (!saved) return;
      applyWebMergePayload(saved);
      try { localStorage.setItem(WEB_MERGE_KEY, JSON.stringify(saved)); } catch {}
      updateSummary();
      updateStats();
    });

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
	  if (state.mergeEnabled && window.CLS.clearWebMergeSession) {
        window.CLS.clearWebMergeSession(false);
      }
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
    /* Kênh copy dự phòng qua Extension khi PiP không có focus */
    window.CLS.copyViaExtension = function(text) {
      if (!text) return;
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'CLS_COPY_TEXT', text }, () => {
          void chrome.runtime.lastError;
        });
        return;
      }
      if (document.documentElement.dataset.clsExtReady === '1') {
        document.dispatchEvent(
          new CustomEvent('cls-copy-request', { detail: JSON.stringify({ text }) })
        );
      }
    };

    /* Quét dữ liệu tự động từ HIS (chạy cả Side Panel lẫn PiP trên GitHub) */
    function requestScanHIS(mode = 'manual') {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage) {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'CLS_SCAN_HIS', mode }, (res) => {
            if (chrome.runtime.lastError) {
              return resolve({ ok: false, error: chrome.runtime.lastError.message });
            }
            resolve(res || { ok: false, error: 'Không nhận được phản hồi từ Extension.' });
          });
        });
      }

      return new Promise((resolve) => {
        if (document.documentElement.dataset.clsExtReady !== '1') {
          return resolve({
            ok: false,
            error: 'Chưa kết nối Extension. Hãy bật Extension "Tóm tắt CLS" và F5 lại trang!'
          });
        }

        const requestId = 'scan_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        let acked = false;

        const cleanup = () => {
          clearTimeout(timer);
          document.removeEventListener('cls-scan-ack', onAck);
          document.removeEventListener('cls-scan-response', onReply);
        };

        const timer = setTimeout(() => {
          cleanup();
          resolve({
            ok: false,
            error: acked
              ? 'Background Extension không phản hồi — kiểm tra mục Lỗi ở chrome://extensions.'
              : 'bridge.js chưa nhận lệnh — hãy Reload Extension và Ctrl+F5 trang Tóm tắt CLS.'
          });
        }, mode === 'auto' ? 4000 : 7000);

        function parseDetail(ev) {
          try {
            return typeof ev.detail === 'string' ? JSON.parse(ev.detail) : ev.detail;
          } catch {
            return null;
          }
        }

        function onAck(ev) {
          const d = parseDetail(ev);
          if (d && d.requestId === requestId) acked = true;
        }

        function onReply(ev) {
          const d = parseDetail(ev);
          if (!d || d.requestId !== requestId) return;
          cleanup();
          resolve(d);
        }

        document.addEventListener('cls-scan-ack', onAck);
        document.addEventListener('cls-scan-response', onReply);
        document.dispatchEvent(
          new CustomEvent('cls-scan-request', { detail: JSON.stringify({ requestId, mode }) })
        );
      });
    }

    const autoExtractBtn = document.getElementById('autoExtractBtn');
    if (autoExtractBtn) {
      autoExtractBtn.addEventListener('click', async () => {
        const origHtml = autoExtractBtn.innerHTML;
        autoExtractBtn.disabled = true;
        autoExtractBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang quét…';

        try {
          const res = await requestScanHIS('manual');
          if (res.ok && res.text && res.text.trim()) {
            state.lastAutoScannedText = res.text.trim();
            el.dataTextarea.value = res.text;
            el.clearTextBtn.classList.remove('hidden');
            window.CLS.performSummarize(res.meta || null);
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

    /* ---------- Tự động quét khi chuyển phiếu xét nghiệm trên HIS ---------- */
    let isAutoScanning = false;
    let autoScanTimerWin = null;

    function stopAutoScanLoop() {
      if (state.autoScanTimer != null) {
        try {
          (autoScanTimerWin || window).clearInterval(state.autoScanTimer);
        } catch {}
        state.autoScanTimer = null;
        autoScanTimerWin = null;
      }
    }

    async function runAutoScanTick() {
      if (!state.autoScanEnabled || isAutoScanning) return;

      // Không quét tốn tài nguyên khi cả PiP lẫn tab gốc đều đang ẩn
      const hasOpenPiP = Boolean(state.pipWindow && !state.pipWindow.closed);
      if (!hasOpenPiP && document.hidden) return;

      isAutoScanning = true;
      try {
        const res = await requestScanHIS('auto');
        if (!state.autoScanEnabled) return;

        if (res.ok && !res.empty && res.text && res.text.trim()) {
          const normalized = res.text.trim();
          if (normalized !== state.lastAutoScannedText) {
            state.lastAutoScannedText = normalized;
            el.dataTextarea.value = normalized;
            el.clearTextBtn.classList.remove('hidden');
            window.CLS.performSummarize(res.meta || null);
          }
        }
      } catch {
        // Bỏ qua im lặng ở chế độ nền
      } finally {
        isAutoScanning = false;
      }
    }

    function startAutoScanLoop(immediate = false) {
      stopAutoScanLoop();
      if (!state.autoScanEnabled) return;

      // Chạy bộ đếm trên cửa sổ đang hiển thị (PiP) để tránh Chrome bóp tốc độ tab nền
      const hostWin = getActiveWin();
      autoScanTimerWin = hostWin;
      state.autoScanTimer = hostWin.setInterval(runAutoScanTick, 1200);
      if (immediate) runAutoScanTick();
    }

    if (el.autoScanToggleBtn) {
      el.autoScanToggleBtn.addEventListener('click', () => {
        const extAvailable =
          (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ||
          document.documentElement.dataset.clsExtReady === '1';

        if (!state.autoScanEnabled && !extAvailable) {
          return showToast('Chưa kết nối Extension — hãy bật Extension và F5 lại trang!', 3500);
        }

        state.autoScanEnabled = !state.autoScanEnabled;
        localStorage.setItem(STORAGE.AUTO_SCAN, state.autoScanEnabled);
        updateUI();

        if (state.autoScanEnabled) {
          state.lastAutoScannedText = '';
          startAutoScanLoop(true);
          showToast('Đã bật tự động quét HIS');
        } else {
          stopAutoScanLoop();
          showToast('Đã tắt tự động quét HIS');
        }
      });
    }
	/* ---------- Đồng bộ cài đặt 2 chiều với Extension (chrome.storage.local) ---------- */
    function pushSettingsToExtension() {
      if (document.documentElement.dataset.clsExtReady !== '1') return;
      const isDark = getActiveDoc().body.classList.contains('dark-mode');
      document.dispatchEvent(
        new CustomEvent('cls-settings-save', {
          detail: JSON.stringify({
            showUnit: state.showUnit,
            showAbbr: state.showAbbr,
            copyFormat: state.copyFormat,
            themeMode: state.themeMode,
            darkMode: isDark,
			mergeEnabled: Boolean(state.mergeEnabled),
            mergeFilter: state.mergeFilter || 'main'
          })
        })
      );
    }

    document.addEventListener('cls-settings-sync', (ev) => {
      let s = null;
      try { s = typeof ev.detail === 'string' ? JSON.parse(ev.detail) : ev.detail; } catch {}
      if (!s || typeof s !== 'object') return;

      let needSummary = false;
      let needTable = false;

      if (typeof s.showUnit === 'boolean' && s.showUnit !== state.showUnit) {
        state.showUnit = s.showUnit;
        localStorage.setItem(STORAGE.SHOW_UNIT, state.showUnit);
        needSummary = true;
      }
      if (typeof s.showAbbr === 'boolean' && s.showAbbr !== state.showAbbr) {
        state.showAbbr = s.showAbbr;
        localStorage.setItem(STORAGE.SHOW_ABBR, state.showAbbr);
        needSummary = true;
        needTable = true;
      }
      if (s.copyFormat && s.copyFormat !== state.copyFormat) {
        state.copyFormat = s.copyFormat;
        localStorage.setItem(STORAGE.COPY_FORMAT, state.copyFormat);
        needSummary = true;
      }
      if (s.themeMode && s.themeMode !== state.themeMode && window.CLS.setThemeMode) {
        window.CLS.setThemeMode(s.themeMode);
      }
	  if (typeof s.mergeEnabled === 'boolean' && s.mergeEnabled !== state.mergeEnabled) {
        state.mergeEnabled = s.mergeEnabled;
        localStorage.setItem(WEB_MERGE_ON_KEY, state.mergeEnabled);
        needSummary = true;
      }
      if (s.mergeFilter && s.mergeFilter !== state.mergeFilter) {
        state.mergeFilter = s.mergeFilter;
        localStorage.setItem(WEB_MERGE_FILTER_KEY, state.mergeFilter);
        needSummary = true;
      }
      updateUI();
      if (needTable && state.currentRows.length) renderTable();
      if (needSummary) {
        updateSummary();
        updateStats();
      }
    });

    // Chủ động yêu cầu Extension gửi cấu hình mới nhất khi web vừa khởi động
    setTimeout(() => {
      if (document.documentElement.dataset.clsExtReady === '1') {
        document.dispatchEvent(new CustomEvent('cls-settings-request'));
        document.dispatchEvent(new CustomEvent('cls-merge-request'));
      }
    }, 500);
    /* Toggles */
    el.toggleUnitBtn.addEventListener('click', () => {
      state.showUnit = !state.showUnit;
      localStorage.setItem(STORAGE.SHOW_UNIT, state.showUnit);
      updateUI();
      if (state.currentRows.length) updateSummary();
      pushSettingsToExtension(); // 👈 Thêm (1)
    });
    el.toggleAbbrBtn.addEventListener('click', () => {
      state.showAbbr = !state.showAbbr;
      localStorage.setItem(STORAGE.SHOW_ABBR, state.showAbbr);
      updateUI();
      if (state.currentRows.length) { renderTable(); updateSummary(); }
      pushSettingsToExtension(); // 👈 Thêm (2)
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
      pushSettingsToExtension(); // 👈 Thêm (3)
    });

    /* Theme + Density segmented */
    document.querySelectorAll('#themeSegmented .seg-btn').forEach(b => {
      b.addEventListener('click', () => {
        window.CLS.setThemeMode(b.dataset.theme);
        const labels = { light: 'Sáng', dark: 'Tối', auto: 'Theo hệ thống' };
        showToast('Giao diện: ' + labels[b.dataset.theme]);
        pushSettingsToExtension(); // 👈 Thêm (4)
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
      pushSettingsToExtension(); // 👈 Thêm (5)
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
	  document.getElementById('extInstallModal'),
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
	  
	  if (state.autoScanEnabled) startAutoScanLoop(false);
    }

	/* ---------- Chỉnh độ mờ / rõ cho PiP ---------- */
    const PIP_OPACITY_KEY = 'cls_pip_opacity';
    const PIP_HOVER_CLEAR_KEY = 'cls_pip_hover_clear';
    const pipOpacityBtn = document.getElementById('pipOpacityBtn');
    const pipOpacityMenu = document.getElementById('pipOpacityMenu');
    const pipOpacitySlider = document.getElementById('pipOpacitySlider');
    const pipOpacityVal = document.getElementById('pipOpacityVal');
    const pipHoverClear = document.getElementById('pipHoverClear');

    function applyPipOpacity() {
      const pct = Math.min(100, Math.max(25, parseInt(localStorage.getItem(PIP_OPACITY_KEY) || '100', 10)));
      const hoverClear = localStorage.getItem(PIP_HOVER_CLEAR_KEY) !== 'false';

      if (pipOpacitySlider) pipOpacitySlider.value = String(pct);
      if (pipOpacityVal) pipOpacityVal.textContent = pct + '%';
      if (pipHoverClear) pipHoverClear.checked = hoverClear;
      if (pipOpacityBtn) pipOpacityBtn.classList.toggle('active', pct < 100);

      if (state.pipWindow && !state.pipWindow.closed) {
        const body = state.pipWindow.document.body;
        body.style.setProperty('--pip-opacity', String(pct / 100));
        body.classList.toggle('pip-hover-clear', hoverClear);
      }
    }

    if (pipOpacityBtn && pipOpacityMenu) {
      pipOpacityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pipOpacityMenu.classList.toggle('hidden');
      });
    }
    if (pipOpacitySlider) {
      const endAdjust = () => {
        if (state.pipWindow && !state.pipWindow.closed) {
          state.pipWindow.document.body.classList.remove('pip-adjusting');
        }
      };
      pipOpacitySlider.addEventListener('input', () => {
        if (state.pipWindow && !state.pipWindow.closed) {
          state.pipWindow.document.body.classList.add('pip-adjusting');
        }
        localStorage.setItem(PIP_OPACITY_KEY, pipOpacitySlider.value);
        applyPipOpacity();
      });
      pipOpacitySlider.addEventListener('change', endAdjust);
      pipOpacitySlider.addEventListener('pointerup', endAdjust);
    }
    if (pipHoverClear) {
      pipHoverClear.addEventListener('change', () => {
        localStorage.setItem(PIP_HOVER_CLEAR_KEY, pipHoverClear.checked ? 'true' : 'false');
        applyPipOpacity();
      });
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
		applyPipOpacity();
		
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
          if (pipOpacityMenu && !pipOpacityMenu.classList.contains('hidden') && !(e.target.closest && e.target.closest('.pip-opacity-wrap'))) {
            pipOpacityMenu.classList.add('hidden');
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

        // ✅ ĐÃ CHUYỂN VÀO ĐÂY: chạy ngay khi mở PiP thành công
        if (state.autoScanEnabled) startAutoScanLoop(true);
        showToast('Đã mở cửa sổ nổi PiP');
      } catch (err) {
        console.error('PiP ERROR:', err);
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
          const url = chrome.runtime.getURL('index.html?launchPip=1');
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
	/* ---------- Gợi ý cài đặt & Tự kiểm tra phiên bản Extension ---------- */
    (function initExtensionPrompt() {
      const LATEST_EXT_VERSION = '1.5.0';

      const extBanner = document.getElementById('extBanner');
      const extGuideBtn = document.getElementById('extGuideBtn');
      const extModal = document.getElementById('extInstallModal');
      const btnOpenExtModal = document.getElementById('btnOpenExtModal');
      const btnDismissExtBanner = document.getElementById('btnDismissExtBanner');
      const btnCloseExtModal = document.getElementById('btnCloseExtModal');
      const btnExtModalDone = document.getElementById('btnExtModalDone');
      const btnCopyExtUrl = document.getElementById('btnCopyExtUrl');
      const btnReloadAfterExt = document.getElementById('btnReloadAfterExt');

      if (!extBanner || !extModal) return;

      const DISMISS_KEY = 'cls_ext_banner_dismissed_at';
      const UPDATE_DISMISS_KEY = 'cls_ext_update_dismissed_ver';
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      let bannerMode = 'install';

      function compareVersions(a, b) {
        const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
        const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const diff = (pa[i] || 0) - (pb[i] || 0);
          if (diff !== 0) return diff;
        }
        return 0;
      }

      function hasExtension() {
        return Boolean(
          document.documentElement.dataset.clsExtReady === '1' ||
          (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id)
        );
      }

      function getInstalledVersion() {
        return document.documentElement.dataset.clsExtVersion || '';
      }

      function hideAllPromptUI() {
        extBanner.classList.add('hidden');
        if (extGuideBtn) extGuideBtn.classList.add('hidden');
      }

      function openExtModal() {
        extModal.classList.remove('hidden');
      }

      function closeExtModal() {
        extModal.classList.add('hidden');
      }

      function triggerDownloadZip() {
        const a = document.createElement('a');
        a.href = 'cls-bridge.zip';
        a.download = 'cls-bridge.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      function evaluatePrompt() {
        const installed = hasExtension();
        const currentVer = getInstalledVersion();
        const infoSpan = extBanner.querySelector('.ext-banner-info span');

        if (!installed) {
          bannerMode = 'install';
          if (extGuideBtn) extGuideBtn.classList.remove('hidden');
          const dismissedAt = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
          if (!dismissedAt || Date.now() - dismissedAt > 7 * 24 * 60 * 60 * 1000) {
            extBanner.classList.remove('hidden');
          }
          return;
        }

        // Đã cài Extension -> kiểm tra có bản mới hơn trên GitHub hay không
        if (compareVersions(currentVer || '0.0.0', LATEST_EXT_VERSION) < 0) {
          bannerMode = 'update';
          if (extGuideBtn) {
            extGuideBtn.classList.remove('hidden');
            extGuideBtn.title = `Có bản cập nhật Extension v${LATEST_EXT_VERSION}`;
          }
          if (infoSpan) {
            const verText = currentVer ? `v${currentVer}` : 'bản cũ';
            infoSpan.innerHTML = `<strong>Có bản cập nhật Extension v${LATEST_EXT_VERSION}:</strong> Máy đang dùng ${verText}. Tải và giải nén đè thư mục <code>cls-bridge</code> rồi bấm Tải lại.`;
          }
          if (btnOpenExtModal) {
            btnOpenExtModal.innerHTML = '<i class="fas fa-arrow-up"></i> Cập nhật';
          }
          if (localStorage.getItem(UPDATE_DISMISS_KEY) !== LATEST_EXT_VERSION) {
            extBanner.classList.remove('hidden');
          }
          return;
        }

        hideAllPromptUI();
      }

      window.CLS.openExtInstallModal = openExtModal;

      if (btnOpenExtModal) {
        btnOpenExtModal.addEventListener('click', () => {
          triggerDownloadZip();
          openExtModal();
        });
      }
      if (extGuideBtn) extGuideBtn.addEventListener('click', openExtModal);
      if (btnCloseExtModal) btnCloseExtModal.addEventListener('click', closeExtModal);
      if (btnExtModalDone) btnExtModalDone.addEventListener('click', closeExtModal);
      extModal.addEventListener('click', (e) => {
        if (e.target === extModal) closeExtModal();
      });

      if (btnDismissExtBanner) {
        btnDismissExtBanner.addEventListener('click', () => {
          extBanner.classList.add('hidden');
          if (bannerMode === 'update') {
            localStorage.setItem(UPDATE_DISMISS_KEY, LATEST_EXT_VERSION);
          } else {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
          }
        });
      }

      if (btnCopyExtUrl) {
        btnCopyExtUrl.addEventListener('click', () => {
          copyToClipboard('chrome://extensions/').then(() => {
            showToast('Đã copy chrome://extensions/ — hãy dán lên thanh địa chỉ!');
          });
        });
      }

      if (btnReloadAfterExt) {
        btnReloadAfterExt.addEventListener('click', () => window.location.reload());
      }

      if (isMobile) return;

      const observer = new MutationObserver(() => evaluatePrompt());
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-cls-ext-ready', 'data-cls-ext-version']
      });

      setTimeout(evaluatePrompt, 700);
    })();

    if (state.autoScanEnabled) startAutoScanLoop(false);
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