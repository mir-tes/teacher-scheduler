// ========== GCAL.JS — Google Calendar / Tasks API連携 ==========

const GCAL = {
  CLIENT_ID: '116307121637-ev8bq1td5q8v6v11f5dtmo9u53nqtft2.apps.googleusercontent.com',
  SCOPES: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks',
  DISCOVERY_CAL: 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
  DISCOVERY_TASKS: 'https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest',

  tokenClient: null,
  isConnected: false,
  gapiReady: false,
  gisReady: false,

  // ---- 初期化 ----
  init() {
    document.getElementById('gcal-connect-btn').addEventListener('click', () => this.connect());
    document.getElementById('gcal-disconnect-btn').addEventListener('click', () => this.disconnect());
    document.getElementById('gcal-fetch-btn').addEventListener('click', () => this.fetchAndImport());
    document.getElementById('gcal-send-btn').addEventListener('click', () => this.sendLocalEvents());

    this._waitForGapi();
    this._waitForGis();
  },

  // GAPIライブラリが読み込まれるまで待機
  _waitForGapi() {
    if (typeof gapi !== 'undefined') {
      this._initGapiClient();
    } else {
      setTimeout(() => this._waitForGapi(), 300);
    }
  },

  _initGapiClient() {
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          discoveryDocs: [this.DISCOVERY_CAL, this.DISCOVERY_TASKS]
        });
        this.gapiReady = true;
        this._maybeEnable();
      } catch(e) {
        console.error('gapi init error:', e);
      }
    });
  },

  // GISライブラリが読み込まれるまで待機
  _waitForGis() {
    if (typeof google !== 'undefined' && google.accounts) {
      this._initGIS();
    } else {
      setTimeout(() => this._waitForGis(), 300);
    }
  },

  _initGIS() {
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.CLIENT_ID,
      scope: this.SCOPES,
      callback: (resp) => {
        if (resp.error) {
          console.error('GIS error:', resp);
          alert('Google認証に失敗しました: ' + resp.error);
          return;
        }
        this.isConnected = true;
        this.updateStatus('接続中');
      }
    });
    this.gisReady = true;
    this._maybeEnable();
  },

  _maybeEnable() {
    if (this.gapiReady && this.gisReady) {
      document.getElementById('gcal-connect-btn').disabled = false;
    }
  },

  // ---- 接続 / 切断 ----
  connect() {
    if (!this.gisReady || !this.tokenClient) {
      alert('Google APIの初期化中です。しばらくお待ちください。');
      return;
    }
    const token = gapi.client.getToken();
    this.tokenClient.requestAccessToken({ prompt: token ? '' : 'consent' });
  },

  disconnect() {
    const token = gapi.client.getToken();
    if (token) {
      google.accounts.oauth2.revoke(token.access_token, () => {});
      gapi.client.setToken(null);
    }
    this.isConnected = false;
    this.updateStatus('未接続');
  },

  updateStatus(text) {
    const el = document.getElementById('gcal-status');
    const connectBtn = document.getElementById('gcal-connect-btn');
    const disconnectBtn = document.getElementById('gcal-disconnect-btn');
    if (!el) return;
    el.textContent = text;
    if (this.isConnected) {
      el.className = 'status-badge connected';
      connectBtn.style.display = 'none';
      disconnectBtn.style.display = 'inline';
    } else {
      el.className = 'status-badge';
      connectBtn.style.display = 'inline';
      disconnectBtn.style.display = 'none';
    }
  },

  _checkConnected() {
    if (!this.isConnected) {
      alert('Google Calendarに接続してください。');
      return false;
    }
    return true;
  },

  // ---- イベント取得 (primary) ----
  async fetchAndImport() {
    if (!this._checkConnected()) return;
    const month = APP.currentMonth;
    const timeMin = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const timeMax = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59).toISOString();

    const items = await this.fetchEvents('primary', timeMin, timeMax);
    // 既存のgcalソースを当月分削除してから追加
    APP.events = APP.events.filter(ev => {
      if (ev.source !== 'gcal') return true;
      return ev.date < APP.formatDate(new Date(month.getFullYear(), month.getMonth(), 1)) ||
             ev.date > APP.formatDate(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    });

    for (const item of items) {
      const date = (item.start.date || item.start.dateTime || '').substring(0, 10);
      if (!date) continue;
      APP.events.push({
        id: APP.generateId(),
        title: item.summary || '(無題)',
        date,
        type: '行事',
        source: 'gcal',
        gcalId: item.id
      });
    }
    APP.saveEvents();
    CALENDAR.render();
    alert(`${items.length}件のイベントを取得しました。`);
  },

  // ---- 指定カレンダーのイベント取得 ----
  async fetchEvents(calendarId, timeMin, timeMax) {
    if (!this.isConnected) return [];
    try {
      const res = await gapi.client.calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 500
      });
      return res.result.items || [];
    } catch(e) {
      console.error('fetchEvents error:', e);
      return [];
    }
  },

  // ---- ローカルイベントをGCalへ送信 ----
  async sendLocalEvents() {
    if (!this._checkConnected()) return;
    const month = APP.currentMonth;
    const y = month.getFullYear();
    const m = month.getMonth();
    const localEvs = APP.events.filter(ev => {
      if (ev.source === 'gcal') return false;
      const d = new Date(ev.date);
      return d.getFullYear() === y && d.getMonth() === m;
    });

    let sent = 0;
    for (const ev of localEvs) {
      const result = await this.insertEvent('primary', ev.title, ev.date);
      if (result) {
        ev.gcalId = result.id;
        ev.source = 'gcal';
        sent++;
      }
    }
    APP.saveEvents();
    alert(`${sent}件を Google Calendar に送信しました。`);
  },

  async insertEvent(calendarId, title, date) {
    try {
      const res = await gapi.client.calendar.events.insert({
        calendarId,
        resource: {
          summary: title,
          start: { date },
          end: { date }
        }
      });
      return res.result;
    } catch(e) {
      console.error('insertEvent error:', e);
      return null;
    }
  },

  // ---- Google Tasks 取得 ----
  async fetchTasks() {
    if (!this.isConnected) return [];
    try {
      const listsRes = await gapi.client.tasks.tasklists.list({ maxResults: 20 });
      const lists = listsRes.result.items || [];
      const all = [];
      for (const list of lists) {
        const tasksRes = await gapi.client.tasks.tasks.list({
          tasklist: list.id,
          showCompleted: false,
          maxResults: 100
        });
        const tasks = (tasksRes.result.items || []).map(t => ({
          ...t,
          listId: list.id,
          listTitle: list.title
        }));
        all.push(...tasks);
      }
      return all;
    } catch(e) {
      console.error('fetchTasks error:', e);
      return [];
    }
  }
};
