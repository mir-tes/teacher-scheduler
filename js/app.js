// ========== APP.JS — メイン状態管理・初期化 ==========

const APP = {
  // --- データ ---
  events: [],
  timetable: {},
  deadlines: [],
  weekOverrides: {},
  memos: {},
  sharedCalendars: [],

  // --- 現在の表示状態 ---
  currentMonth: new Date(),   // カレンダー月
  currentWeekStart: null,     // 週間スケジュールの月曜日

  // --- 初期化 ---
  init() {
    this.loadData();
    this.setCurrentWeek();
    this.setupTabs();
    this.setDefaultDates();

    // 各モジュール初期化
    GCAL.init();
    CALENDAR.init();
    TIMETABLE.init();
    WEEK.init();
    DEADLINE.init();
    SHARED.init();
  },

  // --- データ読み込み ---
  loadData() {
    try {
      this.events         = JSON.parse(localStorage.getItem('sch_ev')     || '[]');
      this.timetable      = JSON.parse(localStorage.getItem('sch_tt')     || '{}');
      this.deadlines      = JSON.parse(localStorage.getItem('sch_dl')     || '[]');
      this.weekOverrides  = JSON.parse(localStorage.getItem('sch_wov')    || '{}');
      this.memos          = JSON.parse(localStorage.getItem('sch_memo')   || '{}');
      this.sharedCalendars= JSON.parse(localStorage.getItem('sch_shared') || '[]');
    } catch(e) {
      console.error('loadData error:', e);
    }
  },

  // --- 保存ヘルパー ---
  saveEvents()          { localStorage.setItem('sch_ev',     JSON.stringify(this.events)); },
  saveTimetable()       { localStorage.setItem('sch_tt',     JSON.stringify(this.timetable)); },
  saveDeadlines()       { localStorage.setItem('sch_dl',     JSON.stringify(this.deadlines)); },
  saveWeekOverrides()   { localStorage.setItem('sch_wov',    JSON.stringify(this.weekOverrides)); },
  saveMemos()           { localStorage.setItem('sch_memo',   JSON.stringify(this.memos)); },
  saveSharedCalendars() { localStorage.setItem('sch_shared', JSON.stringify(this.sharedCalendars)); },

  // --- 週の開始日（月曜日）を計算 ---
  setCurrentWeek(date) {
    const d = date ? new Date(date) : new Date();
    const dow = d.getDay(); // 0=Sun
    const diff = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    this.currentWeekStart = d;
  },

  // --- タブ切り替え ---
  setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tab = document.getElementById('tab-' + btn.dataset.tab);
        if (tab) tab.classList.add('active');
      });
    });
  },

  // --- 日付入力のデフォルト値 ---
  setDefaultDates() {
    const today = this.formatDate(new Date());
    const dEl = document.getElementById('em-date');
    if (dEl) dEl.value = today;
    const dmEl = document.getElementById('dm-due');
    if (dmEl) dmEl.value = today;
  },

  // --- ユーティリティ ---
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  },

  formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  },

  parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  },

  // イベント種別 → カラークラス
  typeClass(type) {
    return `type-${type}`;
  },

  // モーダル開閉
  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },

  // モーダル外クリックで閉じる
  setupModalClose(overlayId, modalId) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal(overlayId);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => APP.init());
