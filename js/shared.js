// ========== SHARED.JS — 共有カレンダー管理 ==========

const SHARED = {
  CORS_PROXY: 'https://api.allorigins.win/get?url=',

  init() {
    this._setupTypeToggle();
    this._setupAddBtn();
    this.renderList();
  },

  // ---- gcal/ical 切り替え ----
  _setupTypeToggle() {
    document.querySelectorAll('input[name="shared-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const type = document.querySelector('input[name="shared-type"]:checked').value;
        document.getElementById('shared-gcal-input').style.display = type === 'gcal' ? '' : 'none';
        document.getElementById('shared-ical-input').style.display = type === 'ical' ? '' : 'none';
      });
    });
  },

  // ---- 追加ボタン ----
  _setupAddBtn() {
    document.getElementById('shared-add-btn').addEventListener('click', () => {
      const name = document.getElementById('shared-name').value.trim();
      const type = document.querySelector('input[name="shared-type"]:checked').value;
      const calId  = document.getElementById('shared-cal-id').value.trim();
      const icalUrl= document.getElementById('shared-ical-url').value.trim();

      if (!name) { alert('名前を入力してください。'); return; }
      if (type === 'gcal' && !calId)  { alert('カレンダーIDを入力してください。'); return; }
      if (type === 'ical' && !icalUrl){ alert('iCal URLを入力してください。'); return; }

      const entry = {
        id: APP.generateId(),
        name,
        type,
        calendarId: calId,
        icalUrl: icalUrl
      };
      APP.sharedCalendars.push(entry);
      APP.saveSharedCalendars();
      this.renderList();

      // 追加後すぐ取得
      this.fetchShared(entry);

      // フォームリセット
      document.getElementById('shared-name').value    = '';
      document.getElementById('shared-cal-id').value  = '';
      document.getElementById('shared-ical-url').value= '';
    });
  },

  // ---- 一覧表示 ----
  renderList() {
    const list = document.getElementById('shared-list');
    list.innerHTML = '';

    if (!APP.sharedCalendars.length) {
      list.innerHTML = '<div class="dl-empty" style="text-align:center;color:#aaa;padding:24px">登録なし</div>';
      return;
    }

    APP.sharedCalendars.forEach(cal => {
      const item = document.createElement('div');
      item.className = 'shared-item';

      const info = document.createElement('div');
      info.className = 'shared-info';

      const badge = document.createElement('span');
      badge.className = `shared-type-badge${cal.type === 'ical' ? ' ical' : ''}`;
      badge.textContent = cal.type === 'gcal' ? 'GCal' : 'iCal';

      const nameLine = document.createElement('div');
      nameLine.className = 'shared-name';
      nameLine.appendChild(badge);
      nameLine.appendChild(document.createTextNode(' ' + cal.name));

      const idLine = document.createElement('div');
      idLine.className = 'shared-id';
      idLine.textContent = cal.type === 'gcal' ? cal.calendarId : cal.icalUrl;

      info.appendChild(nameLine);
      info.appendChild(idLine);
      item.appendChild(info);

      // 再取得ボタン
      const fetchBtn = document.createElement('button');
      fetchBtn.className = 'btn btn-sm';
      fetchBtn.textContent = '再取得';
      fetchBtn.addEventListener('click', () => this.fetchShared(cal));
      item.appendChild(fetchBtn);

      // 削除ボタン
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = '削除';
      delBtn.addEventListener('click', () => {
        if (confirm(`「${cal.name}」を削除しますか？\n（このカレンダーから取得したイベントも削除されます）`)) {
          // このソースのイベントを削除
          APP.events = APP.events.filter(ev => ev.sharedId !== cal.id);
          APP.saveEvents();
          APP.sharedCalendars = APP.sharedCalendars.filter(c => c.id !== cal.id);
          APP.saveSharedCalendars();
          this.renderList();
          CALENDAR.render();
        }
      });
      item.appendChild(delBtn);

      list.appendChild(item);
    });
  },

  // ---- 共有カレンダーからイベント取得 ----
  async fetchShared(cal) {
    const month = APP.currentMonth;
    const y = month.getFullYear();
    const m = month.getMonth();

    // 当月の同ソースイベントを削除（リフレッシュ）
    const monthStart = APP.formatDate(new Date(y, m, 1));
    const monthEnd   = APP.formatDate(new Date(y, m + 1, 0));
    APP.events = APP.events.filter(ev => {
      if (ev.sharedId !== cal.id) return true;
      return ev.date < monthStart || ev.date > monthEnd;
    });

    let fetched = [];
    try {
      if (cal.type === 'gcal') {
        fetched = await this._fetchGcal(cal, y, m);
      } else {
        fetched = await this._fetchIcal(cal, y, m);
      }
    } catch(e) {
      console.error('fetchShared error:', e);
      alert(`「${cal.name}」の取得に失敗しました。`);
      return;
    }

    fetched.forEach(ev => APP.events.push(ev));
    APP.saveEvents();
    CALENDAR.render();
    alert(`「${cal.name}」から${fetched.length}件取得しました。`);
  },

  async _fetchGcal(cal, y, m) {
    if (!GCAL.isConnected) { alert('Google Calendarへ接続してください。'); return []; }
    const timeMin = new Date(y, m, 1).toISOString();
    const timeMax = new Date(y, m + 1, 0, 23, 59).toISOString();
    const items = await GCAL.fetchEvents(cal.calendarId, timeMin, timeMax);

    return items.map(item => {
      const date = (item.start.date || item.start.dateTime || '').substring(0, 10);
      return {
        id: APP.generateId(),
        title: item.summary || '(無題)',
        date,
        type: '行事',
        source: 'shared',
        sharedId: cal.id,
        gcalId: item.id
      };
    }).filter(ev => ev.date);
  },

  async _fetchIcal(cal, y, m) {
    const proxyUrl = this.CORS_PROXY + encodeURIComponent(cal.icalUrl);
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    const data = await res.json();
    const icalText = data.contents;
    const events = this._parseIcal(icalText);

    // 当月フィルタ
    const monthStart = `${y}-${String(m+1).padStart(2,'0')}-01`;
    const monthEnd   = APP.formatDate(new Date(y, m + 1, 0));

    return events
      .filter(ev => ev.date >= monthStart && ev.date <= monthEnd)
      .map(ev => ({
        id: APP.generateId(),
        title: ev.title,
        date: ev.date,
        type: '行事',
        source: 'shared',
        sharedId: cal.id
      }));
  },

  _parseIcal(text) {
    const events = [];
    if (!text) return events;
    const blocks = text.split('BEGIN:VEVENT');
    blocks.shift();

    for (const block of blocks) {
      const lines = this._unfoldLines(block);
      let summary = '';
      let dtstart = '';

      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.startsWith('summary:')) {
          summary = line.substring(8).trim();
        } else if (lower.startsWith('dtstart')) {
          const val = line.split(':').slice(1).join(':').trim();
          // YYYYMMDD or YYYYMMDDTHHmmss
          dtstart = val.replace(/T.*$/, '').replace(/-/g, '');
        }
      }

      if (summary && dtstart && dtstart.length >= 8) {
        const y = dtstart.substring(0, 4);
        const mo = dtstart.substring(4, 6);
        const d  = dtstart.substring(6, 8);
        events.push({ title: summary, date: `${y}-${mo}-${d}` });
      }
    }
    return events;
  },

  _unfoldLines(text) {
    // iCal折り返し解除（行頭スペース/タブで継続）
    return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  }
};
