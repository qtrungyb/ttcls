/* Constants — gán vào window.CLS để dùng chung */
window.CLS = window.CLS || {};

window.CLS.STORAGE = {
  SHOW_UNIT: 'showUnit',
  SHOW_ABBR: 'showAbbr',
  COPY_FORMAT: 'copyFormat',
  AUTO_SUMMARIZE: 'autoSummarize',
  THEME: 'theme' // key cũ — giữ để migrate
};

window.CLS.HISTORY_KEY = 'cls_history_v1';
window.CLS.SEEDED_KEY = 'cls_seeded_v1';
window.CLS.DENSITY_KEY = 'cls_density';
window.CLS.THEME_MODE_KEY = 'cls_theme_mode';

window.CLS.SPECIAL_NAMES = [
  "Số lượng hồng cầu", "Huyết sắc tố", "Hematocrit",
  "Số lượng tiểu cầu", "Số lượng bạch cầu", "Tỷ lệ bạch cầu GR"
];

window.CLS.DEFAULT_ABBR_MAP = {
  "Số lượng hồng cầu": "HC",
  "Huyết sắc tố": "Hb",
  "Hematocrit": "HTC",
  "Số lượng tiểu cầu": "TC",
  "Số lượng bạch cầu": "BC",
  "Tỷ lệ bạch cầu GR": "N%"
};

window.CLS.FORMAT_LABELS = {
  comma: ',',
  semicolon: ';',
  newline: '↵'
};

window.CLS.SEP_INNER = { T3: ': ', T4: ': ', TSH: ': ', Tg: ': ' };

window.CLS.RANGE_REGEX = /(\d+[.,]?\d*)\s*[-–]\s*(\d+[.,]?\d*)/;
window.CLS.LE_REGEX = /(<=|≤)\s*(\d+[.,]?\d*)/;
window.CLS.L_REGEX = /<\s*(\d+[.,]?\d*)/;
window.CLS.GE_REGEX = /(>=|≥)\s*(\d+[.,]?\d*)/;
window.CLS.G_REGEX = />\s*(\d+[.,]?\d*)/;

/* Panel classification */
window.CLS.PANEL_LABELS = {
  HuyetHoc: 'Huyết học (CBC)',
  SinhHoa:  'Sinh hoá',
  DongMau:  'Đông máu',
  MienDich: 'Miễn dịch',
  NuocTieu: 'Nước tiểu',
  Khac:     'Khác'
};
window.CLS.PANEL_ORDER = ['HuyetHoc', 'SinhHoa', 'DongMau', 'MienDich', 'NuocTieu', 'Khac'];