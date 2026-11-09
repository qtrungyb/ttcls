/* Firebase compat SDK — chạy được với file:// */
window.CLS = window.CLS || {};

(function() {
  const firebaseConfig = {
    apiKey: "AIzaSyBO0lJNyz9N4sr5z_FZyQgX_tWXD0XH82g",
    authDomain: "tomtatcls.firebaseapp.com",
    databaseURL: "https://tomtatcls-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "tomtatcls",
    storageBucket: "tomtatcls.firebasestorage.app",
    messagingSenderId: "898386417757",
    appId: "1:898386417757:web:b1fa660ff3821abf4ad5b4"
  };

  try {
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();
    window.CLS.db = db;
    window.CLS.quickCopyRef = db.ref('quickCopyItems');
    window.CLS.abbrRef = db.ref('abbreviations');
    console.log('✅ [CLS] Firebase initialized');
  } catch (e) {
    console.error('❌ [CLS] Firebase init failed:', e);
    window.CLS.firebaseError = e;
  }

  window.CLS.logPageVisit = function() {
    if (!window.CLS.db) return;
    window.CLS.db.ref('page_visits/stats').update({
      total_views: firebase.database.ServerValue.increment(1)
    }).catch(() => {});
    window.CLS.db.ref('page_visits/logs').push({
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      localTime: new Date().toLocaleString('vi-VN'),
      userAgent: navigator.userAgent
    }).catch(() => {});
  };
})();