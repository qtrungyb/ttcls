/* =========================================================
   BACKGROUND — Side Panel + Quét dữ liệu bảng CLS từ HIS
   ========================================================= */
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

function isScannableUrl(url) {
  if (typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  // Bỏ qua chính trang Tóm tắt CLS trên GitHub
  if (/^https?:\/\/qtrungyb\.github\.io\b/i.test(url)) return false;
  return true;
}

async function findTargetTabForScan(senderTabId) {
  // 1. Ưu tiên tab HIS đang mở trên cửa sổ Chrome chính (bỏ qua cửa sổ PiP)
  try {
    const win = await chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal'] });
    const active = win?.tabs?.find(
      (t) => t.active && t.id !== senderTabId && isScannableUrl(t.url)
    );
    if (active) return active;
  } catch {}

  // 2. Dò tất cả cửa sổ đang mở (hỗ trợ đa màn hình hoặc HIS mở dạng popup)
  try {
    const allWins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal', 'popup'] });
    const activeWebTabs = [];
    const allWebTabs = [];

    for (const w of allWins) {
      for (const t of (w.tabs || [])) {
        if (!t.id || t.id === senderTabId || !isScannableUrl(t.url)) continue;
        allWebTabs.push(t);
        if (t.active) activeWebTabs.push(t);
      }
    }

    if (activeWebTabs.length) {
      activeWebTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      return activeWebTabs[0];
    }
    if (allWebTabs.length) {
      allWebTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      return allWebTabs[0];
    }
  } catch {}

  return null;
}

// Hàm bơm trực tiếp vào trang HIS (tự lọc bảng Danh sách chỉ số đang hiển thị)
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

  const selection = window.getSelection()?.toString() || '';
  if (selection.trim() && /[\t\n]/.test(selection) && /\d/.test(selection)) {
    return { type: 'selection', text: selection.trim() };
  }

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

    if (!bestHeader || bestHeader.map.name === -1 || bestHeader.map.value === -1) continue;

    let dataRows = [];
    if (table.tBodies && table.tBodies.length) {
      for (const tb of table.tBodies) dataRows.push(...Array.from(tb.rows));
    } else {
      dataRows = Array.from(table.rows);
    }
    dataRows = dataRows.filter((r) => r !== headerRowRef && isVisible(r));

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

async function handleScanHIS(senderTabId) {
  const tab = await findTargetTabForScan(senderTabId);
  if (!tab || !tab.id) {
    return { ok: false, error: 'Không tìm thấy tab trang bệnh án (HIS) đang mở.' };
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: extractDataFromHIS
  });

  const validResults = (results || []).map((r) => r.result).filter(Boolean);
  const selectionHit = validResults.find((r) => r.type === 'selection' && r.text.trim());
  const clsTableHit = validResults
    .filter((r) => r.type === 'cls_table' && r.text.trim())
    .sort((a, b) => (b.score - a.score) || (b.rowCount - a.rowCount))[0];
  const fallbackTableHit = validResults
    .filter((r) => r.type === 'table' && r.text.trim())
    .sort((a, b) => b.text.length - a.text.length)[0];

  const hit = selectionHit || clsTableHit || fallbackTableHit;
  if (hit && hit.text.trim()) {
    return { ok: true, text: hit.text, type: hit.type };
  }
  return { ok: false, error: 'Không tìm thấy bảng kết quả xét nghiệm trên trang HIS.' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'CLS_SCAN_HIS') return;

  handleScanHIS(sender?.tab?.id)
    .then((res) => sendResponse(res))
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));

  return true; // giữ kênh mở cho phản hồi bất đồng bộ
});