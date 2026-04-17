// ========== GCAL.JS — Google Calendar / Tasks / Drive API連携 ==========

const GCAL = {
  CLIENT_ID: '116307121637-ev8bq1td5q8v6v11f5dtmo9u53nqtft2.apps.googleusercontent.com',
  SCOPES: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/drive.appdata',
  DISCOVERY_CAL: 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
  DISCOVERY_TASKS: 'https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest',

  tokenClient: null,
  isConnected: false,
  gapiReady: false,
  gisReady: false,

  // ---- Drive Appdata ----
  DRIVE_FILE_NAME: 'teacher-scheduler-data.json',
  driveFileId: null,
  _driveSaveTimer: null,
  // GIS Token Model では gapi.client.setToken() を呼ばないと
  // gapi.client.getToken() が null を返すため自前で保持する
  accessToken: null,

  // ---- 初期化 ----
  init() {
    document.getElementById('gcal-connect-btn').addEventListener('click', () => this.connect());
    document.getElementById('gcal-disconnect-btn').addEventListener('click', () => this.disconnect());
    document.getElementById('gcal-fetch-btn').addEventListener('click', () => this.fetchAndImport());
    document.getElementById('gcal-send-btn').addEventListener('click', () => this.sendLocalEvents());

    this.updateDriveStatus('未接続');
    this._waitForGapi();
    this._waitForGis();
  },

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
      callback: async (resp) => {
        if (resp.error) {
          console.error('GIS error:', resp);
          alert('Google認証に失敗しました: ' + resp.error);
          return;
        }
        // トークンを自前で保持 + gapi.client にも設定（両方必要）
        this.accessToken = resp.access_token;
        gapi.client.setToken(resp);

        this.isConnected = true;
        this.updateStatus('接続中');

        // ログイン直後にDriveからデータを自動読み込み
        const driveData = await this.loadFromDrive();
        if (driveData) {
          APP.applyDriveData(driveData);
        }
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
    // ページリロード後は常に consent → drive.appdata スコープを確実に要求
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
    this.accessToken = null;
    this.driveFileId = null;
    this.updateStatus('未接続');
    this.updateDriveStatus('未接続');
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
        resource: { summary: title, start: { date }, end: { date } }
      });
      return res.result;
    } catch(e) {
      console.error('insertEvent error:', e);
      return null;
    }
  },

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
  },

  // ---- Google Drive Appdata 同期 ----

  // 自前で保持したトークンを返す（gapi.client.getToken() は setToken() 未実行だと null）
  _driveToken() {
    return this.accessToken;
  },

  async _findDriveFile() {
    const token = this._driveToken();
    if (!token) return null;
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${this.DRIVE_FILE_NAME}%27&fields=files(id)`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!res.ok) {
        const err = await res.text();
        console.error('Drive files.list error:', res.status, err);
        return null;
      }
      const data = await res.json();
      const files = data.files || [];
      return files.length > 0 ? files[0].id : null;
    } catch(e) {
      console.error('_findDriveFile error:', e);
      return null;
    }
  },

  async loadFromDrive() {
    const token = this._driveToken();
    if (!token) return null;
    try {
      this.updateDriveStatus('同期中...');
      const fileId = await this._findDriveFile();
      if (!fileId) {
        // まだファイルがない（初回）= 同期済みとして扱う
        this.updateDriveStatus('Drive同期済み');
        return null;
      }
      this.driveFileId = fileId;
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!res.ok) {
        console.error('Drive file get error:', res.status);
        this.updateDriveStatus('未接続');
        return null;
      }
      const data = await res.json();
      this.updateDriveStatus('Drive同期済み');
      return data;
    } catch(e) {
      console.error('loadFromDrive error:', e);
      this.updateDriveStatus('未接続');
      return null;
    }
  },

  // データ変更時に呼び出す（1秒デバウンス）
  saveToDrive() {
    if (!this.isConnected) return;
    clearTimeout(this._driveSaveTimer);
    this._driveSaveTimer = setTimeout(() => this._doSaveToDrive(), 1000);
  },

  async _doSaveToDrive() {
    const token = this._driveToken();
    if (!token) return;
    try {
      this.updateDriveStatus('同期中...');
      const payload = JSON.stringify({
        sch_ev:     APP.events,
        sch_tt:     APP.timetable,
        sch_dl:     APP.deadlines,
        sch_wov:    APP.weekOverrides,
        sch_memo:   APP.memos,
        sch_shared: APP.sharedCalendars
      });

      if (!this.driveFileId) {
        this.driveFileId = await this._findDriveFile();
      }

      if (this.driveFileId) {
        // 既存ファイルを上書き
        const res = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${this.driveFileId}?uploadType=media`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: payload
          }
        );
        if (!res.ok) {
          console.error('Drive PATCH error:', res.status, await res.text());
          this.updateDriveStatus('未接続');
          return;
        }
      } else {
        // 新規ファイルを appDataFolder に作成
        const boundary = '-------314159265358979323846';
        const metadata = JSON.stringify({ name: this.DRIVE_FILE_NAME, parents: ['appDataFolder'] });
        const body = [
          `--${boundary}`,
          'Content-Type: application/json; charset=UTF-8',
          '',
          metadata,
          `--${boundary}`,
          'Content-Type: application/json',
          '',
          payload,
          `--${boundary}--`
        ].join('\r\n');

        const res = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': `multipart/related; boundary="${boundary}"`
            },
            body
          }
        );
        if (!res.ok) {
          console.error('Drive POST error:', res.status, await res.text());
          this.updateDriveStatus('未接続');
          return;
        }
        const result = await res.json();
        this.driveFileId = result.id;
      }
      this.updateDriveStatus('Drive同期済み');
    } catch(e) {
      console.error('saveToDrive error:', e);
      this.updateDriveStatus('未接続');
    }
  },

  // Drive上のファイルを削除（データクリア時に呼び出す）
  async clearDriveData() {
    const token = this._driveToken();
    if (!token) return;
    try {
      // fileId が未取得なら検索する
      if (!this.driveFileId) {
        this.driveFileId = await this._findDriveFile();
      }
      if (!this.driveFileId) return;
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${this.driveFileId}`,
        { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok || res.status === 204) {
        this.driveFileId = null;
        this.updateDriveStatus('Drive同期済み');
      } else {
        console.error('Drive DELETE error:', res.status);
      }
    } catch(e) {
      console.error('clearDriveData error:', e);
    }
  },

  updateDriveStatus(text) {
    const el = document.getElementById('drive-status');
    if (!el) return;
    el.textContent = text;
    if (text === 'Drive同期済み') {
      el.className = 'status-badge connected';
    } else if (text === '同期中...') {
      el.className = 'status-badge syncing';
    } else {
      el.className = 'status-badge';
    }
  }
};
