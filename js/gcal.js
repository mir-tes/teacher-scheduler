// ========== GCAL.JS — Google Calendar / Tasks / Drive API連携 ==========

const GCAL = {
  CLIENT_ID: '116307121637-ev8bq1td5q8v6v11f5dtmo9u53nqtft2.apps.googleusercontent.com',
  // drive.appdata を分離: iOS Safari の ITP が drive.appdata 同意画面の
  // postMessage を遮断するため、メイン接続には含めない
  SCOPES_MAIN: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks',
  SCOPE_DRIVE:  'https://www.googleapis.com/auth/drive.appdata',
  DISCOVERY_CAL:   'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
  DISCOVERY_TASKS: 'https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest',

  tokenClient:      null, // Calendar + Tasks 用
  driveTokenClient: null, // Drive Appdata 用
  isConnected:      false,
  isDriveConnected: false,
  gapiReady:  false,
  gisReady:   false,

  DRIVE_FILE_NAME: 'teacher-scheduler-data.json',
  driveFileId:     null,
  _driveSaveTimer: null,
  accessToken:     null,

  // ---- 初期化 ----
  init() {
    document.getElementById('gcal-connect-btn').addEventListener('click',    () => this.connect());
    document.getElementById('gcal-disconnect-btn').addEventListener('click', () => this.disconnect());
    document.getElementById('gcal-fetch-btn').addEventListener('click',      () => this.fetchAndImport());
    document.getElementById('gcal-send-btn').addEventListener('click',       () => this.sendLocalEvents());
    document.getElementById('drive-enable-btn').addEventListener('click',    () => this.enableDriveSync());

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
    // ① メイン接続クライアント（Calendar + Tasks のみ）
    //    iOS Safari でも安定して動作するスコープ構成
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.CLIENT_ID,
      scope: this.SCOPES_MAIN,
      callback: async (resp) => {
        if (resp.error) {
          console.error('GIS error:', resp);
          alert('Google認証に失敗しました: ' + resp.error);
          return;
        }
        this.accessToken = resp.access_token;
        gapi.client.setToken(resp);
        this.isConnected = true;
        this.updateStatus('接続中');
        // ログイン後に Drive スコープをサイレント取得試行
        this._tryDriveSilent();
      }
    });

    // ② Drive Appdata クライアント（サイレント取得 / 手動有効化 兼用）
    //    include_granted_scopes: true → Calendar+Tasks スコープも引き継ぎ
    this.driveTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.CLIENT_ID,
      scope: this.SCOPE_DRIVE,
      include_granted_scopes: true,
      callback: async (resp) => {
        if (resp.error) {
          // サイレント取得失敗（ITP や未許可）→ ボタンを表示してユーザーに委ねる
          this.updateDriveStatus('未接続');
          this._showDriveEnableBtn(true);
          return;
        }
        // Drive を含む新トークンで上書き
        this.accessToken = resp.access_token;
        gapi.client.setToken(resp);
        this.isDriveConnected = true;
        this._showDriveEnableBtn(false);
        const driveData = await this.loadFromDrive();
        if (driveData) APP.applyDriveData(driveData);
      }
    });

    this.gisReady = true;
    this._maybeEnable();
  },

  _maybeEnable() {
    if (this.gapiReady && this.gisReady) {
      document.getElementById('gcal-connect-btn').disabled = false;
      // iOS リダイレクト認証の戻り処理（URLハッシュにトークンがあれば適用）
      this._checkOAuthRedirect();
    }
  },

  // iOS Safari 判定
  _isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  // iOS: ページごとリダイレクトする implicit flow
  // 戻り先 redirect_uri はGoogle Cloud Console の「承認済みリダイレクトURI」に要登録:
  //   https://mir-tes.github.io/teacher-scheduler/
  _connectViaRedirect() {
    const redirectUri = 'https://mir-tes.github.io/teacher-scheduler/';
    const params = new URLSearchParams({
      client_id:             this.CLIENT_ID,
      redirect_uri:          redirectUri,
      response_type:         'token',
      scope:                 this.SCOPES_MAIN,
      prompt:                'consent',
      include_granted_scopes:'true'
    });
    location.href = 'https://accounts.google.com/o/oauth2/auth?' + params;
  },

  // リダイレクト戻り時：URLハッシュから access_token を取得して接続処理
  _checkOAuthRedirect() {
    if (!location.hash) return;
    const params = new URLSearchParams(location.hash.slice(1));
    // エラーの場合
    const error = params.get('error');
    if (error) {
      history.replaceState(null, '', location.pathname);
      alert('Google認証エラー: ' + error + '\nGoogle Cloud ConsoleでリダイレクトURIが登録されているか確認してください。');
      return;
    }
    const token = params.get('access_token');
    if (!token) return;
    // URLからハッシュを除去（ブラウザ履歴にトークンを残さない）
    history.replaceState(null, '', location.pathname);
    this.accessToken = token;
    gapi.client.setToken({ access_token: token });
    this.isConnected = true;
    this.updateStatus('接続中');
    this._tryDriveSilent();
  },

  // ---- 接続 / 切断 ----
  connect() {
    if (!this.gisReady || !this.tokenClient) {
      alert('Google APIの初期化中です。しばらくお待ちください。');
      return;
    }
    if (this._isIOS()) {
      // iOS Safari はポップアップのpostMessageを遮断するためリダイレクト方式を使用
      this._connectViaRedirect();
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
    this.isConnected      = false;
    this.isDriveConnected = false;
    this.accessToken      = null;
    this.driveFileId      = null;
    this.updateStatus('未接続');
    this.updateDriveStatus('未接続');
    this._showDriveEnableBtn(false);
  },

  // Drive スコープをサイレントで取得試行
  // prompt:'none' = UIなし。未許可 or ITP遮断時はエラーコールバックで処理
  _tryDriveSilent() {
    if (!this.driveTokenClient) return;
    this.driveTokenClient.requestAccessToken({ prompt: 'none' });
  },

  // 「Drive同期」ボタンからの手動有効化
  enableDriveSync() {
    if (!this.isConnected || !this.driveTokenClient) return;
    this.driveTokenClient.requestAccessToken({ prompt: 'consent' });
  },

  _showDriveEnableBtn(show) {
    const btn = document.getElementById('drive-enable-btn');
    if (btn) btn.style.display = show ? 'inline' : 'none';
  },

  updateStatus(text) {
    const el = document.getElementById('gcal-status');
    const connectBtn    = document.getElementById('gcal-connect-btn');
    const disconnectBtn = document.getElementById('gcal-disconnect-btn');
    if (!el) return;
    el.textContent = text;
    if (this.isConnected) {
      el.className = 'status-badge connected';
      connectBtn.style.display    = 'none';
      disconnectBtn.style.display = 'inline';
    } else {
      el.className = 'status-badge';
      connectBtn.style.display    = 'inline';
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
        console.error('Drive files.list error:', res.status, await res.text());
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

  // isDriveConnected のときのみ保存（Drive スコープ未取得時はスキップ）
  saveToDrive() {
    if (!this.isConnected || !this.isDriveConnected) return;
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

  async clearDriveData() {
    const token = this._driveToken();
    if (!token) return;
    try {
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
