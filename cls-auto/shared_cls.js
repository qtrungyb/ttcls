/* =========================================================
   SHARED CLS — Logic xử lý dùng chung cho Background, Popup & Web
   ========================================================= */
(function(root) {
  const CLS_WEB_URL = 'https://qtrungyb.github.io/ttcls/';
  const ABBR_ENDPOINT = 'https://tomtatcls-default-rtdb.asia-southeast1.firebasedatabase.app/abbreviations.json';
  const SHARED_SETTINGS_KEY = 'cls_shared_settings';
  const MERGE_SESSION_KEY = 'cls_merge_session_v1';
  const ABBR_CACHE_KEY = 'cls_abbr_cache';
  const CAPTURE_PAUSED_KEY = 'cls_capture_paused';

  const MERGE_PRIORITY = {
    CTM: 1, SHM: 2, ĐGĐ: 3, XN: 4, MD: 5, ĐM: 6, VSS: 7, KM: 8, VS: 9, TPTNT: 10,
    CĐHA: 11, TDCN: 12
  };
  const DEFAULT_PRIORITY = 9;

  const SPECIAL_NAMES = [
    'Số lượng hồng cầu', 'Huyết sắc tố', 'Hematocrit',
    'Số lượng tiểu cầu', 'Số lượng bạch cầu', 'Tỷ lệ bạch cầu GR'
  ];

  const DEFAULT_ABBR = {
    'Số lượng hồng cầu': 'HC',
    'Huyết sắc tố': 'Hb',
    'Hematocrit': 'HTC',
    'Số lượng tiểu cầu': 'TC',
    'Số lượng bạch cầu': 'BC',
    'Tỷ lệ bạch cầu GR': 'N%'
  };

  const SEP_INNER = { T3: ': ', T4: ': ', TSH: ': ', Tg: ': ' };
  const VALID_KEEP = ['inr', 'bệnh/ chứng r', 'bệnh/chứng r', 'alt', 'ast'];

  const RANGE_RE = /(\d+[.,]?\d*)\s*[-–]\s*(\d+[.,]?\d*)/;
  const LE_RE = /(<=|≤)\s*(\d+[.,]?\d*)/;
  const L_RE = /<\s*(\d+[.,]?\d*)/;
  const GE_RE = /(>=|≥)\s*(\d+[.,]?\d*)/;
  const G_RE = />\s*(\d+[.,]?\d*)/;

  const NAME_PREFIX_RE = /^\([^)]+\)\s*(.*)/;
  const INNER_PAREN_RE = /\s*\(([^)]+)\)/g;
  const DEMOGRAPHIC_TAIL_RE = /\s+(?:ở|cho|của)?\s*(?:nam(?:\s+giới)?|nữ(?:\s+giới)?|người\s+lớn|trẻ\s+em|sơ\s+sinh|phụ\s+nữ(?:\s+có\s+thai)?)(?:\s*(?:từ|dưới|trên|>=|<=|>|<)?\s*\d[\d.,\s\-–]*(?:tuổi|tháng|ngày)?)?$/i;
  const AGE_RANGE_TAIL_RE = /\s+(?:từ|dưới|trên)?\s*\d+\s*[-–]\s*\d+\s*(?:tuổi|tháng)\b.*$/i;
  const VERBOSE_PREFIX_RE = /^(?:định\s*lượng|định\s*tính|đo\s*hoạt\s*độ|hoạt\s*độ|nồng\s*độ)\s+/i;
  const GENERIC_IMG_RE = /^(cđha|tdcn|siêu âm|chụp x-quang|x-quang|điện tim|nội soi)$/i;

  function escapeHtml(str) {
    return str ? String(str).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])) : '';
  }

  function escapeAttr(str) {
    return str ? String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])) : '';
  }

  function parseNumber(str) {
    const m = str && String(str).replace(/,/g, '.').replace(/\s+/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }

  function cleanName(raw) {
    if (!raw) return '';
    const str = raw.trim().replace(/^["']|["']$/g, '');
    const m = str.match(NAME_PREFIX_RE);
    let name = m ? m[1].trim() : str;
    name = name.replace(INNER_PAREN_RE, (match, inner) =>
      VALID_KEEP.includes(inner.trim().toLowerCase()) ? match : ''
    );
    name = name
      .replace(DEMOGRAPHIC_TAIL_RE, '')
      .replace(AGE_RANGE_TAIL_RE, '')
      .replace(/[\s,;:\-–]+$/, '');
    return name.trim();
  }

  function shortenVerboseName(name) {
    let s = String(name || '').trim();
    if (!VERBOSE_PREFIX_RE.test(s)) return s;
    s = s.replace(VERBOSE_PREFIX_RE, '').trim();
    if (s && s[0] === s[0].toLowerCase() && s[0] !== s[0].toUpperCase()) {
      s = s[0].toUpperCase() + s.slice(1);
    }
    return s || name;
  }

  function getStatus(valStr, rangeStr) {
    const val = parseNumber(valStr);
    if (isNaN(val) || !rangeStr) return 'unknown';
    let m;
    if ((m = rangeStr.match(RANGE_RE))) return (val < parseNumber(m[1]) || val > parseNumber(m[2])) ? 'abnormal' : 'normal';
    if ((m = rangeStr.match(LE_RE)))    return val <= parseNumber(m[2]) ? 'normal' : 'abnormal';
    if ((m = rangeStr.match(L_RE)))     return val <  parseNumber(m[1]) ? 'normal' : 'abnormal';
    if ((m = rangeStr.match(GE_RE)))    return val >= parseNumber(m[2]) ? 'normal' : 'abnormal';
    if ((m = rangeStr.match(G_RE)))     return val >  parseNumber(m[1]) ? 'normal' : 'abnormal';
    return 'unknown';
  }

  function isNormalUrineRow(r) {
    if (!r || !r.value) return true;
    if (r._status === 'abnormal') return false;
    const v = String(r.value).trim().toLowerCase();
    if (!v) return true;
    if (/[+]|pos|dương|vết|trace|cao|tăng|nhiều/i.test(v)) return false;
    if (r._status === 'normal') return true;
    if (/^(?:-?\s*neg(?:ative)?|âm(?:\s*tính)?|at|norm(?:al)?|bình\s*thường|bt|không)\b/i.test(v)) return true;
    if (/\bnorm(?:al)?\b/i.test(v)) return true;
    if (/^0+(?:[.,]0+)?(?:\s*[a-z/%µμ]+)?$/i.test(v)) return true;

    const name = String(r.cleanName || '').toLowerCase();
    const num = parseNumber(v);
    if (!isNaN(num)) {
      if (name.includes('tỷ trọng') || /\bsg\b/.test(name)) return num >= 1.005 && num <= 1.030;
      if (name === 'ph' || /\bph\b/.test(name)) return num >= 4.5 && num <= 8.0;
    }
    return false;
  }

  function parseInputToRows(rawText) {
    const lines = String(rawText || '').split(/\r?\n/);
    const rows = [];
    let headerMap = null;
    let sawHeader = false;
    let hasExplicitSttBeforeHeader = false;
    let autoStt = 1;

    const HEADER_NAME_RE = /^(stt|tt|#|chỉ số|tên xét nghiệm|tên xn|thông số|loại xét nghiệm|loại dịch vụ|tên dịch vụ|dịch vụ|kết quả|tham chiếu|đơn vị|trạng thái|tiền sử|ngày tiền sử)$/i;
    const META_LABEL_RE = /^(danh sách chỉ số|danh sách dịch vụ|thông tin chung|người bệnh|họ tên|mã(?:\s*(?:bn|bệnh nhân|người bệnh|phiếu|chỉ định))?|địa chỉ|tuổi|giới tính|thời gian(?:\s*(?:trả kết quả|thực hiện|chỉ định))?|ngày(?:\s*(?:trả kết quả|chỉ định|tạo))?|tg\s*(?:trả kết quả|chỉ định)|người(?:\s*(?:thực hiện|chỉ định|tạo))?|bác sĩ(?:\s*(?:chỉ định|đọc))?|nơi(?:\s*(?:thực hiện|chỉ định))?|khoa(?:\s*(?:phòng|chỉ định))?|sid|số phiếu|kết luận|mô tả|ghi chú|lời dặn|đề nghị|đồng bộ diễn biến|giao kết quả)$/i;
    const DATE_TIME_RE = /\b\d{1,2}:\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;
    const META_VAL_RE = /^(?:sid|id|mã(?:\s*(?:bn|phiếu))?|code|số\s*phiếu)\s*[:#-]\s*\S+/i;
    const SERVICE_LIST_VAL_RE = /^(?:xét\s*nghiệm|hoàn\s*tất|chưa\s*thực\s*hiện|đang\s*chờ|đã\s*hủy|đã\s*trả|đã\s*duyệt|khoa\s+|phòng\s+)/i;
    const NUM_VAL_RE = /^(?:[<>≤≥~±+-]\s*)?\d+(?:[.,]\d+)?(?:\s*(?:x\s*10\^\d+|%|mmol\/l|mg\/dl|g\/l|g\/dl|u\/l|iu\/l|ui\/l|t\/l|fl|pg|mm|s|giây|phút|[hl↑↓]|\([^)]{1,18}\)))?$/i;
    const QUAL_VAL_RE = /^(?:[+-]{1,4}(?:\s+\d[\d.,]*\s*[a-z/%µμ]*)?|\(\s*[+-]+\s*\)|\d+\+|(?:-\s*)?(?:âm(?:\s*tính)?|dương(?:\s*tính)?|neg(?:ative)?|pos(?:itive)?|norm(?:al)?|bình\s*thường|bt|vết|trace|không(?:\s+có)?|có|at|dt|react(?:ive)?|non-?react(?:ive)?))(?:\s*(?:\([^)]{1,24}\)|[+-]+))?$/i;

    function isValidLabValue(val, refCol = '') {
      const v = String(val || '').trim();
      if (!v) return false;
      if (refCol === 'CĐHA' || refCol === 'TDCN') return true;
      if (DATE_TIME_RE.test(v) || META_VAL_RE.test(v) || SERVICE_LIST_VAL_RE.test(v)) return false;
      return NUM_VAL_RE.test(v) || QUAL_VAL_RE.test(v);
    }

    function splitRowCells(line) {
      if (line.includes('\t')) {
        const arr = line.split('\t').map((c) => c.trim());
        while (arr.length && !arr[arr.length - 1]) arr.pop();
        return arr;
      }
      if (/\s{2,}/.test(line)) {
        return line.trim().split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
      }
      return [];
    }

    function detectHeader(cells) {
      const map = { stt: -1, name: -1, value: -1, ref: -1, unit: -1 };
      cells.forEach((raw, idx) => {
        const h = raw.toLowerCase();
        if (!h) return;
        if (map.stt === -1 && /^(stt|tt|#)$/.test(h)) map.stt = idx;
        else if (map.name === -1 && !h.includes('loại xét nghiệm') && (h === 'chỉ số' || h.includes('chỉ số') || h.includes('tên xét nghiệm') || h.includes('tên xn') || h.includes('thông số'))) map.name = idx;
        else if (map.value === -1 && !h.includes('tiền sử') && !h.includes('cũ') && !h.includes('trước') && (h === 'kết quả' || h.includes('kết quả') || h === 'kq' || h === 'giá trị' || h === 'result')) map.value = idx;
        else if (map.ref === -1 && (h.includes('tham chiếu') || h.includes('trị số') || h.includes('bình thường') || h.includes('csbt') || h.includes('ngưỡng') || h.includes('reference'))) map.ref = idx;
        else if (map.unit === -1 && (h.includes('đơn vị') || h === 'đv' || h === 'unit')) map.unit = idx;
      });
      return (map.name !== -1 && map.value !== -1) ? map : null;
    }

    for (const line of lines) {
      if (!line.trim()) continue;
      const rawCells = splitRowCells(line);
      if (rawCells.length < 2) continue;

      const maybeHeader = detectHeader(rawCells);
      if (maybeHeader) {
        if (!sawHeader) {
          if (rows.length && !hasExplicitSttBeforeHeader) {
            rows.length = 0;
            autoStt = 1;
          }
          sawHeader = true;
        }
        headerMap = maybeHeader;
        continue;
      }

      let stt = '';
      let name = '';
      let value = '';
      let refRange = '';
      let unit = '';
      let explicitStt = false;

      if (headerMap && rawCells.length > Math.max(headerMap.name, headerMap.value)) {
        const shift = (headerMap.stt === 0 && !/^\d+[.)]?$/.test(rawCells[0]) && rawCells.length === Math.max(headerMap.name, headerMap.value, headerMap.ref, headerMap.unit)) ? -1 : 0;
        const get = (idx) => (idx !== -1 && idx + shift >= 0 ? (rawCells[idx + shift] || '') : '');
        stt = get(headerMap.stt).replace(/[.)]$/, '');
        explicitStt = /^\d+$/.test(stt);
        name = get(headerMap.name);
        value = get(headerMap.value);
        refRange = get(headerMap.ref);
        unit = get(headerMap.unit);
      } else {
        const cells = [...rawCells];
        while (cells.length && !cells[0]) cells.shift();
        if (cells.length < 2) continue;

        let rest = cells;
        if (/^\d+[.)]?$/.test(cells[0])) {
          stt = cells[0].replace(/[.)]$/, '');
          explicitStt = true;
          rest = cells.slice(1);
        } else {
          const c0 = cells[0] || '';
          const c1 = cells[1] || '';
          const c2 = cells[2] || '';
          const c0Clean = cleanName(c0.replace(/:$/, '').trim());
          const looksLikeName =
            /[a-zA-ZÀ-ỹ]/.test(c0) &&
            !HEADER_NAME_RE.test(c0) &&
            !META_LABEL_RE.test(c0) &&
            !META_LABEL_RE.test(c0Clean) &&
            !DATE_TIME_RE.test(c0);
          if (!looksLikeName || !isValidLabValue(c1, c2)) continue;
        }

        while (rest.length && !rest[0]) rest.shift();
        name = rest[0] || '';
        let valIdx = 1;
        while (valIdx < rest.length && !rest[valIdx]) valIdx++;
        value = rest[valIdx] || '';
        refRange = rest[valIdx + 1] || '';
        unit = rest[valIdx + 2] || '';
      }

      const nameTrim = name.replace(/:$/, '').replace(/\s+/g, ' ').trim();
      const cleanedName = cleanName(nameTrim).replace(/\s+/g, ' ').trim();
      const isImgRow = refRange === 'CĐHA' || refRange === 'TDCN';
      if (
        !cleanedName ||
        !value ||
        (!isImgRow && (META_VAL_RE.test(value) || SERVICE_LIST_VAL_RE.test(value) || DATE_TIME_RE.test(value))) ||
        HEADER_NAME_RE.test(nameTrim) ||
        HEADER_NAME_RE.test(cleanedName) ||
        META_LABEL_RE.test(nameTrim) ||
        META_LABEL_RE.test(cleanedName)
      ) continue;
      if (!explicitStt && !sawHeader && !isValidLabValue(value, refRange)) continue;

      if (!sawHeader && explicitStt) hasExplicitSttBeforeHeader = true;
      if (!/^\d+$/.test(stt)) stt = String(autoStt);
      autoStt++;

      rows.push({
        stt,
        cleanName: cleanedName,
        value,
        refRange,
        unit,
        _status: getStatus(value, refRange)
      });
    }
    return rows;
  }

  function getRowOverlapRatio(rowsA, rowsB) {
    if (!rowsA?.length || !rowsB?.length) return 0;
    const setA = new Set(rowsA.map((r) => r.cleanName.toLowerCase()));
    const setB = new Set(rowsB.map((r) => r.cleanName.toLowerCase()));
    let common = 0;
    for (const n of setA) if (setB.has(n)) common++;
    return common / Math.min(setA.size, setB.size);
  }

  function getShortServiceLabel(serviceName, rows) {
    if ((rows || []).length > 0 && rows.every((r) => r.refRange === 'CĐHA' || r.refRange === 'TDCN')) {
      return rows[0].refRange;
    }
    const names = (rows || []).map((r) => r.cleanName.toLowerCase()).join(' | ');
    const svc = String(serviceName || '').toLowerCase();

    if (svc.includes('nước tiểu') || svc.includes('tptnt') || names.includes('tỷ trọng') || names.includes('urobilinogen') || names.includes('nitrit') || names.includes('cetonic') || names.includes('keton')) return 'TPTNT';
    if (svc.includes('máu lắng') || svc.includes('tốc độ lắng') || /\b(vss|esr)\b/.test(svc) || names.includes('máu lắng') || /\b(vss|esr)\b/.test(names)) return 'VSS';
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
    if (serviceName && !/^(trạng thái|tình trạng|ghi chú|chi tiết|đã duyệt|đã thực hiện|đã trả kết quả)$/i.test(serviceName.trim())) {
      return serviceName.replace(/^xét nghiệm\s+/i, '').trim().slice(0, 18);
    }
    return 'XN';
  }

  function makeSheetKey(label, resultTime, rows) {
    const grp = String(label || 'XN').toLowerCase().trim();
    const time = String(resultTime || '').trim();
    const sig = (rows || []).slice(0, 3).map((r) => r.cleanName.toLowerCase()).join('|');
    return [grp, time, sig].filter(Boolean).join('__');
  }

  function sortSheets(sheets) {
    return sheets.sort(
      (a, b) => (MERGE_PRIORITY[a.label] || DEFAULT_PRIORITY) - (MERGE_PRIORITY[b.label] || DEFAULT_PRIORITY)
    );
  }

  function isGenericImgName(name) {
    return GENERIC_IMG_RE.test(String(name || '').trim());
  }

  function findMatchingSheetIndex(sheets, { rawText, label, resultTime, rows }) {
    let idx = sheets.findIndex((s) => s.rawText === rawText);
    if (idx !== -1) return idx;

    return sheets.findIndex((s) => {
      if (s.label !== label) return false;
      if (s.resultTime && resultTime && s.resultTime !== resultTime) return false;
      const sRows = Array.isArray(s.rows) ? s.rows : parseInputToRows(s.rawText);

      if (label === 'CĐHA' || label === 'TDCN') {
        const oldName = sRows[0]?.cleanName || '';
        const newName = rows[0]?.cleanName || '';
        if (!oldName || !newName || isGenericImgName(newName)) return false;
        return oldName.toLowerCase() === newName.toLowerCase();
      }
      return getRowOverlapRatio(sRows, rows) >= 0.5;
    });
  }

  function filterRows(rows, filterName, label = '') {
    if (filterName === 'abnormal') {
      if (label === 'TPTNT') return rows.filter((r) => !isNormalUrineRow(r));
      return rows.filter((r) => r._status === 'abnormal');
    }
    if (filterName === 'all') return rows;
    const main = rows.filter((r) => SPECIAL_NAMES.includes(r.cleanName));
    return main.length ? main : rows;
  }

  function formatRows(rows, settings, abbrMap) {
    const showUnit = Boolean(settings?.showUnit);
    const showAbbr = settings?.showAbbr !== false;
    const copyFormat = settings?.copyFormat || 'comma';
    const isAllConclusion = rows.length > 0 && rows.every((r) => r.refRange === 'CĐHA' || r.refRange === 'TDCN');

    const htmlParts = [];
    const plainParts = [];
    for (const r of rows) {
      if (!r.value || r.value.trim().toLowerCase() === '- neg') continue;
      const isConclusion = r.refRange === 'CĐHA' || r.refRange === 'TDCN';
      const mappedAbbr = showAbbr && abbrMap ? abbrMap[r.cleanName] : '';
      const shortened = (!isConclusion && showAbbr && !mappedAbbr) ? shortenVerboseName(r.cleanName) : r.cleanName;
      const isAbbr = Boolean(mappedAbbr) || shortened !== r.cleanName;
      const name = mappedAbbr || shortened;
      const sep = isConclusion ? ': ' : (SEP_INNER[name] || ' ');
      const unit = (!isConclusion && showUnit && r.unit) ? ' ' + r.unit : '';

      const ev = escapeHtml(r.value);
      const hv = r._status === 'abnormal' ? `<span class="abnormal-value">${ev}</span>` : ev;
      const nHtml = isAbbr
        ? `<span class="abbr-tip" title="${escapeAttr(r.cleanName)}">${escapeHtml(name)}</span>`
        : escapeHtml(name);

      htmlParts.push(`${nHtml}${sep}${hv}${escapeHtml(unit)}`);
      plainParts.push(`${name}${sep}${r.value}${unit}`);
    }

    const sepHtml  = copyFormat === 'newline' ? '<br>' : (isAllConclusion || copyFormat === 'semicolon' ? '; ' : ', ');
    const sepPlain = copyFormat === 'newline' ? '\n'   : (isAllConclusion || copyFormat === 'semicolon' ? '; ' : ', ');
    return {
      html: htmlParts.join(sepHtml),
      plain: plainParts.join(sepPlain),
      count: plainParts.length
    };
  }

  function formatMergedSheets(sheets, settings, abbrMap) {
    const filterName = settings?.mergeFilter || 'main';
    const copyFormat = settings?.copyFormat || 'comma';
    const compactUrine = settings?.compactUrine !== false;
    const outputGroups = [];
    let total = 0;
    let abnTotal = 0;

    for (const sheet of sheets) {
      const rows = Array.isArray(sheet.rows) ? sheet.rows : parseInputToRows(sheet.rawText);
      total += rows.length;
      abnTotal += rows.filter((r) => r._status === 'abnormal').length;

      const filtered = filterRows(rows, filterName, sheet.label);
      if (!filtered.length) continue;

      const target = outputGroups.find(
        (g) => g.label === sheet.label && getRowOverlapRatio(g.rows, filtered) === 0
      );
      if (target) target.rows.push(...filtered);
      else outputGroups.push({ label: sheet.label, rows: [...filtered] });
    }

    const htmlBlocks = [];
    const plainBlocks = [];
    for (const g of outputGroups) {
      if (g.label === 'CĐHA' || g.label === 'TDCN') {
        for (const r of g.rows) {
          const { html, plain } = formatRows([r], settings, abbrMap);
          if (!plain) continue;
          const colonPos = html.indexOf(': ');
          const formattedHtml = colonPos !== -1
            ? `<span class="grp-label">- ${html.slice(0, colonPos + 1)}</span>${html.slice(colonPos + 1)}`
            : `<span class="grp-label">-</span> ${html}`;
          htmlBlocks.push(formattedHtml);
          plainBlocks.push(`- ${plain}`);
        }
        continue;
      }

      if (g.label === 'TPTNT' && compactUrine) {
        const abnUrine = g.rows.filter((r) => !isNormalUrineRow(r));
        if (!abnUrine.length) {
          if (filterName !== 'abnormal') {
            htmlBlocks.push('<span class="grp-label">- TPTNT:</span> Bình thường');
            plainBlocks.push('- TPTNT: Bình thường');
          }
          continue;
        }
        const { html, plain } = formatRows(abnUrine, settings, abbrMap);
        if (!plain) continue;
        if (copyFormat === 'newline') {
          htmlBlocks.push(`<span class="grp-label">- TPTNT:</span><br>${html}`);
          plainBlocks.push(`- TPTNT:\n${plain}`);
        } else {
          htmlBlocks.push(`<span class="grp-label">- TPTNT:</span> ${html}`);
          plainBlocks.push(`- TPTNT: ${plain}`);
        }
        continue;
      }

      const { html, plain } = formatRows(g.rows, settings, abbrMap);
      if (!plain) continue;
      if (copyFormat === 'newline') {
        htmlBlocks.push(`<span class="grp-label">- ${escapeHtml(g.label)}:</span><br>${html}`);
        plainBlocks.push(`- ${g.label}:\n${plain}`);
      } else {
        htmlBlocks.push(`<span class="grp-label">- ${escapeHtml(g.label)}:</span> ${html}`);
        plainBlocks.push(`- ${g.label}: ${plain}`);
      }
    }

    return {
      total,
      abnTotal,
      html: htmlBlocks.join('<br>'),
      plain: plainBlocks.join('\n')
    };
  }

  root.CLSShared = {
    CLS_WEB_URL,
    ABBR_ENDPOINT,
    SHARED_SETTINGS_KEY,
    MERGE_SESSION_KEY,
    ABBR_CACHE_KEY,
    CAPTURE_PAUSED_KEY,
    MERGE_PRIORITY,
    DEFAULT_PRIORITY,
    SPECIAL_NAMES,
    DEFAULT_ABBR,
    SEP_INNER,
    VALID_KEEP,
    escapeHtml,
    escapeAttr,
    parseNumber,
    cleanName,
    shortenVerboseName,
    getStatus,
    isNormalUrineRow,
    parseInputToRows,
    getRowOverlapRatio,
    getShortServiceLabel,
    makeSheetKey,
    sortSheets,
    isGenericImgName,
    findMatchingSheetIndex,
    filterRows,
    formatRows,
    formatMergedSheets
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);