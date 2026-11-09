/* Parse & status */
window.CLS = window.CLS || {};

(function() {
  const { RANGE_REGEX, LE_REGEX, L_REGEX, GE_REGEX, G_REGEX } = window.CLS;

  const nameRegex = /^\([^)]+\)\s*(.*)/;
  const innerContentRegex = /\s*\(([^)]+)\)/g;
  const validKeepText = ['inr','bệnh/ chứng r','bệnh/chứng r','alt','ast'];
  const cleanNameCache = new Map();
  const CLEAN_CACHE_LIMIT = 500;

  window.CLS.cleanName = function(raw) {
    if (!raw) return '';
    if (cleanNameCache.has(raw)) return cleanNameCache.get(raw);
    let str = raw.trim().replace(/^["']|["']$/g, '');
    let m = str.match(nameRegex);
    let name = m ? m[1].trim() : str;
    name = name.replace(innerContentRegex, (match, inner) => {
      return validKeepText.includes(inner.trim().toLowerCase()) ? match : '';
    });
    const result = name.trim();
    if (cleanNameCache.size >= CLEAN_CACHE_LIMIT) cleanNameCache.clear();
    cleanNameCache.set(raw, result);
    return result;
  };

  window.CLS.getStatus = function(valStr, rangeStr) {
    const val = window.CLS.parseNumber(valStr);
    if (isNaN(val) || !rangeStr) return 'unknown';
    let m;
    if ((m = rangeStr.match(RANGE_REGEX))) return (val < window.CLS.parseNumber(m[1]) || val > window.CLS.parseNumber(m[2])) ? 'abnormal' : 'normal';
    if ((m = rangeStr.match(LE_REGEX)))    return val <= window.CLS.parseNumber(m[2]) ? 'normal' : 'abnormal';
    if ((m = rangeStr.match(L_REGEX)))     return val <  window.CLS.parseNumber(m[1]) ? 'normal' : 'abnormal';
    if ((m = rangeStr.match(GE_REGEX)))    return val >= window.CLS.parseNumber(m[1]) ? 'normal' : 'abnormal';
    if ((m = rangeStr.match(G_REGEX)))     return val >  window.CLS.parseNumber(m[1]) ? 'normal' : 'abnormal';
    return 'unknown';
  };

  window.CLS.parseInputToRows = function(input) {
    const lines = input.split(/\r?\n/);
    const rows = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split('\t').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3 && /^\d+$/.test(cols[0])) {
        const refRange = cols[3] || '';
        rows.push({
          stt: cols[0],
          rawName: cols[1],
          cleanName: window.CLS.cleanName(cols[1]),
          value: cols[2],
          refRange,
          unit: cols[4] || '',
          _status: window.CLS.getStatus(cols[2], refRange)
        });
      }
    }
    return rows;
  };
})();