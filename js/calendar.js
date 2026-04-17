// ========== CALENDAR.JS — 月間カレンダー ==========

const CALENDAR = {
  editingEventId: null,
  popupEventId: null,

  TYPE_LABELS: ['授業', '行事', '校務', '締切'],

  init() {
    this._setupNav();
    this._setupAddEvent();
    this._setupPopup();
    this._setupEventModal();
    this.render();

    // 画面回転・リサイズ時に文字数を再計算して再描画
    let _resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => this.render(), 200);
    });
  },

  // ウィンドウ幅からセル幅を逆算し、収まる最大文字数を返す
  _getMaxChars() {
    const mainPadding = window.innerWidth < 768 ? 16 : 24; // main の左右padding合計
    const cellWidth = (window.innerWidth - mainPadding) / 7;
    const fontSize  = window.innerWidth < 768 ? 10 : 11;   // .cal-event の font-size
    const overhead  = 11 + 8; // border-left(3) + padding左右(4+4) + 余白
    return Math.max(3, Math.floor((cellWidth - overhead) / fontSize));
  },

  // ---- ナビゲーション ----
  _setupNav() {
    document.getElementById('cal-prev').addEventListener('click', () => {
      APP.currentMonth = new Date(APP.currentMonth.getFullYear(), APP.currentMonth.getMonth() - 1, 1);
      this.render();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      APP.currentMonth = new Date(APP.currentMonth.getFullYear(), APP.currentMonth.getMonth() + 1, 1);
      this.render();
    });
  },

  // ---- イベント追加ボタン ----
  _setupAddEvent() {
    document.getElementById('add-event-btn').addEventListener('click', () => {
      this.editingEventId = null;
      document.getElementById('event-modal-title').textContent = 'イベント追加';
      document.getElementById('em-title').value = '';
      document.getElementById('em-date').value = APP.formatDate(new Date());
      document.getElementById('em-type').value = '行事';
      APP.openModal('event-modal');
    });
  },

  // ---- ポップアップ（イベント詳細）----
  _setupPopup() {
    document.getElementById('popup-close').addEventListener('click', () => APP.closeModal('event-popup'));
    document.getElementById('event-popup').addEventListener('click', e => {
      if (e.target.id === 'event-popup') APP.closeModal('event-popup');
    });
    document.getElementById('popup-delete').addEventListener('click', () => {
      if (!this.popupEventId) return;
      if (confirm('このイベントをアプリから削除しますか？\n（Google Calendarには影響しません）')) {
        APP.events = APP.events.filter(ev => ev.id !== this.popupEventId);
        APP.saveEvents();
        APP.closeModal('event-popup');
        this.render();
      }
    });
  },

  // ---- イベント編集モーダル ----
  _setupEventModal() {
    document.getElementById('event-modal-close').addEventListener('click', () => APP.closeModal('event-modal'));
    document.getElementById('em-cancel').addEventListener('click', () => APP.closeModal('event-modal'));
    document.getElementById('event-modal').addEventListener('click', e => {
      if (e.target.id === 'event-modal') APP.closeModal('event-modal');
    });

    document.getElementById('em-save').addEventListener('click', () => {
      const title = document.getElementById('em-title').value.trim();
      const date  = document.getElementById('em-date').value;
      const type  = document.getElementById('em-type').value;
      if (!title || !date) { alert('タイトルと日付を入力してください。'); return; }

      if (this.editingEventId) {
        const ev = APP.events.find(e => e.id === this.editingEventId);
        if (ev) { ev.title = title; ev.date = date; ev.type = type; }
      } else {
        APP.events.push({ id: APP.generateId(), title, date, type, source: 'local' });
      }
      APP.saveEvents();
      APP.closeModal('event-modal');
      this.render();
    });
  },

  // ---- カレンダーレンダリング ----
  render() {
    const month = APP.currentMonth;
    const y = month.getFullYear();
    const m = month.getMonth();

    document.getElementById('cal-title').textContent = `${y}年${m + 1}月`;

    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const firstDay = new Date(y, m, 1);
    // 月曜始まり: 0=Mon,…,6=Sun
    let startDow = firstDay.getDay(); // 0=Sun
    startDow = startDow === 0 ? 6 : startDow - 1; // 変換

    const lastDate = new Date(y, m + 1, 0).getDate();
    const today = APP.formatDate(new Date());

    // 前月の末日
    const prevLast = new Date(y, m, 0).getDate();

    const totalCells = Math.ceil((startDow + lastDate) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-day';

      let dateStr, dayNum, inMonth;
      if (i < startDow) {
        dayNum = prevLast - startDow + i + 1;
        dateStr = APP.formatDate(new Date(y, m - 1, dayNum));
        inMonth = false;
      } else if (i < startDow + lastDate) {
        dayNum = i - startDow + 1;
        dateStr = APP.formatDate(new Date(y, m, dayNum));
        inMonth = true;
      } else {
        dayNum = i - startDow - lastDate + 1;
        dateStr = APP.formatDate(new Date(y, m + 1, dayNum));
        inMonth = false;
      }

      if (!inMonth) cell.classList.add('other-month');
      if (dateStr === today) cell.classList.add('today');

      // 曜日クラス (Mon=0, Sat=5, Sun=6)
      const dayOfWeek = i % 7;
      if (dayOfWeek === 5) cell.classList.add('sat');
      if (dayOfWeek === 6) cell.classList.add('sun');

      // 日付ラベル
      const dateEl = document.createElement('div');
      dateEl.className = 'cal-date';
      dateEl.textContent = dayNum;
      cell.appendChild(dateEl);

      // イベント一覧
      const eventsEl = document.createElement('div');
      eventsEl.className = 'cal-events';
      const maxChars = this._getMaxChars();
      const dayEvents = APP.events.filter(ev => ev.date === dateStr);
      dayEvents.forEach(ev => {
        const evEl = document.createElement('div');
        evEl.className = `cal-event ${APP.typeClass(ev.type)}`;
        const shortTitle = ev.title.length > maxChars ? ev.title.substring(0, maxChars) + '…' : ev.title;
        evEl.textContent = shortTitle;
        evEl.title = ev.title;
        evEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this._showPopup(ev);
        });
        eventsEl.appendChild(evEl);
      });
      cell.appendChild(eventsEl);

      // セルクリック → イベント追加（その日付で）
      cell.addEventListener('click', () => {
        if (!inMonth) return;
        this.editingEventId = null;
        document.getElementById('event-modal-title').textContent = 'イベント追加';
        document.getElementById('em-title').value = '';
        document.getElementById('em-date').value = dateStr;
        document.getElementById('em-type').value = '行事';
        APP.openModal('event-modal');
      });

      grid.appendChild(cell);
    }
  },

  _showPopup(ev) {
    this.popupEventId = ev.id;
    document.getElementById('popup-title').textContent = ev.title;
    document.getElementById('popup-date').textContent = '日付: ' + ev.date;
    document.getElementById('popup-type').textContent = '種別: ' + ev.type +
      (ev.source === 'gcal' ? ' [Google Calendar]' : ev.source === 'shared' ? ' [共有]' : '');
    APP.openModal('event-popup');
  }
};
