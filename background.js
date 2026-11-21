/* =========================================================
   BACKGROUND — Side Panel + Quét dữ liệu bảng CLS từ HIS
   ========================================================= */
const CLS_WEB_URL = 'https://qtrungyb.github.io/ttcls/';

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: 'https://qtrungyb.github.io/*' });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: CLS_WEB_URL });
  }
});

function isScannableUrl(url) {
  if (typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (/^https?:\/\/qtrungyb\.github\.io\b/i.test(url)) return false;
  return true;
}

function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ]);
}

async function findTargetTabForScan(senderTabId) {
  // 1. Ưu tiên tab HIS đang mở ở cửa sổ Chrome chính
  try {
    const win = await chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal'] });
    const active = win?.tabs?.find(
      (t) => t.active && !t.discarded && t.id !== senderTabId && isScannableUrl(t.url)
    );
    if (active) return active;
  } catch {}

  // 2. Lấy tab web đang active trên bất kỳ cửa sổ nào
  try {
    const activeTabs = await chrome.tabs.query({ active: true });
    const validActive = activeTabs
      .filter((t) => t.id && !t.discarded && t.id !== senderTabId && isScannableUrl(t.url))
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    if (validActive.length) return validActive[0];

    // 3. Nếu đang dừng ở tab GitHub -> lấy tab web vừa xem gần nhất
    const allTabs = await chrome.tabs.query({});
    const validAll = allTabs
      .filter((t) => t.id && !t.discarded && t.id !== senderTabId && isScannableUrl(t.url))
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    if (validAll.length) return validAll[0];
  } catch {}

  return null;
}

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

function pickBestResult(results, mode = 'manual') {
  const validResults = (results || []).map((r) => r.result).filter(Boolean);
  const clsTableHit = validResults
    .filter((r) => r.type === 'cls_table' && r.text.trim())
    .sort((a, b) => (b.score - a.score) || (b.rowCount - a.rowCount))[0];

  // Chế độ tự động: CHỈ nhận bảng kết quả xét nghiệm chuẩn, bỏ qua bôi đen và bảng khác
  if (mode === 'auto') {
    return clsTableHit || null;
  }

  const selectionHit = validResults.find((r) => r.type === 'selection' && r.text.trim());
  const fallbackTableHit = validResults
    .filter((r) => r.type === 'table' && r.text.trim())
    .sort((a, b) => b.text.length - a.text.length)[0];

  return selectionHit || clsTableHit || fallbackTableHit || null;
}

async function handleScanHIS(senderTabId, mode = 'manual') {
  const tab = await findTargetTabForScan(senderTabId);
  if (!tab || !tab.id) {
    if (mode === 'auto') return { ok: true, empty: true };
    return { ok: false, error: 'Không tìm thấy tab trang bệnh án (HIS) đang mở.' };
  }

  // Bước 1: Quét nhanh khung chính trước
  let mainHit = null;
  try {
    const mainRes = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractDataFromHIS
      }),
      mode === 'auto' ? 1500 : 2500,
      'Quét khung chính quá thời gian.'
    );
    mainHit = pickBestResult(mainRes, mode);
  } catch (err) {
    if (mode === 'auto') return { ok: true, empty: true };
    return { ok: false, error: `Không đọc được tab "${tab.title || tab.url}": ${err.message}` };
  }

  if (mainHit && (mainHit.type === 'selection' || mainHit.type === 'cls_table')) {
    return { ok: true, text: mainHit.text, type: mainHit.type };
  }

  // Bước 2: Nếu chưa thấy ở khung chính, kiểm tra thêm các iframe
  let frameHit = null;
  try {
    const frameRes = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: extractDataFromHIS
      }),
      mode === 'auto' ? 2000 : 3000,
      'iframe phản hồi chậm.'
    );
    frameHit = pickBestResult(frameRes, mode);
  } catch {}

  const best = (frameHit && (frameHit.type === 'selection' || frameHit.type === 'cls_table'))
    ? frameHit
    : (mainHit || frameHit);

  if (best && best.text && best.text.trim()) {
    return { ok: true, text: best.text, type: best.type };
  }

  if (mode === 'auto') return { ok: true, empty: true };
  return { ok: false, error: `Không thấy bảng xét nghiệm ở tab: ${tab.title || tab.url}` };
}

// Copy vào clipboard thông qua chính tab HIS đang có tiêu điểm (focus)
function copyTextInPage(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
  document.body.appendChild(ta);
  ta.focus({ preventScroll: true });
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}

async function handleCopyInActiveTab(senderTabId, text) {
  const tab = await findTargetTabForScan(senderTabId);
  if (!tab || !tab.id) return { ok: false };
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: copyTextInPage,
      args: [text]
    });
    return { ok: Boolean(res?.[0]?.result) };
  } catch {
    return { ok: false };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'CLS_SCAN_HIS') {
    handleScanHIS(sender?.tab?.id, msg.mode || 'manual')
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }

  if (msg.type === 'CLS_COPY_TEXT' && msg.text) {
    handleCopyInActiveTab(sender?.tab?.id, msg.text)
      .then((res) => sendResponse(res))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});