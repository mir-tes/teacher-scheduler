// ========== WEEK.JS — 週間スケジュール ==========

const WEEK = {
  ROWS: [
    { key: 'shr',      label: '朝SHR',  time: '8:55',  special: true  },
    { key: '1',        label: '1校時',  time: '9:20',  period: 1      },
    { key: '2',        label: '2校時',  time: '10:20', period: 2      },
    { key: '3',        label: '3校時',  time: '11:20', period: 3      },
    { key: 'lunch',    label: '昼休み', time: '12:10', special: true  },
    { key: '4',        label: '4校時',  time: '13:00', period: 4      },
    { key: '5',        label: '5校時',  time: '14:00', period: 5      },
    { key: '6',        label: '6校時',  time: '15:00', period: 6      },
    { key: 'after',    label: '放課後', time: '16:10', special: true  },
    { key: 'overtime', label: '時間外', time: '17:00', special: true  },
  ],

  editingKey: null,   // "dateStr-rowKey"
  editingIsSpecial: false,

  init() {
    this._setupNav();
    this._setupReset();
    this._setupModal();
    this._setupMemoModal();
    this.render();
  },

  // ---- ナビゲーション ----
  _setupNav() {
    document.getElementById('week-prev').addEventListener('click', () => {
      const d = new Date(APP.currentWeekStart);
      d.setDate(d.getDate() - 7);
      APP.currentWeekStart = d;
      this.render();
    });
    document.getElementById('week-next').addEventListener('click', () => {
      const d = new Date(APP.currentWeekStart);
      d.setDate(d.getDate() + 7);
      APP.currentWeekStart = d;
      this.render();
    });
  },

  // ---- 基本に戻す ----
  _setupReset() {
    document.getElementById('week-reset').addEventListener('click', () => {
      if (!confirm('今週のすべての変更を元に戻しますか？')) return;
      const weekDates = this._getWeekDates();
      weekDates.forEach(dateStr => {
        Object.keys(APP.weekOverrides).forEach(key => {
          if (key.startsWith(dateStr + '-')) delete APP.weekOverrides[key];
        });
        delete APP.memos[dateStr];
      });
      APP.saveWeekOverrides();
      APP.saveMemos();
      this.render();
    });
  },

  // ---- 編集モーダル ----
  _setupModal() {
    document.getElementById('week-modal-close').addEventListener('click', () => APP.closeModal('week-modal'));
    document.getElementById('wm-cancel').addEventListener('click', () => APP.closeModal('week-modal'));
    document.getElementById('week-modal').addEventListener('click', e => {
      if (e.target.id === 'week-modal') APP.closeModal('week-modal');
    });

    document.getElementById('wm-save').addEventListener('click', () => {
      if (!this.editingKey) return;
      const content = document.getElementById('wm-content').value.trim();
      const room    = document.getElementById('wm-room').value.trim();
      const type    = document.getElementById('wm-type').value;
      if (content || room) {
        APP.weekOverrides[this.editingKey] = { content, room, type };
      } else {
        delete APP.weekOverrides[this.editingKey];
      }
      APP.saveWeekOverrides();
      APP.closeModal('week-modal');
      this.render();
    });

    document.getElementById('wm-clear').addEventListener('click', () => {
      if (!this.editingKey) return;
      delete APP.weekOverrides[this.editingKey];
      APP.saveWeekOverrides();
      APP.closeModal('week-modal');
      this.render();
    });
  },

  // ---- メモモーダル ----
  _setupMemoModal() {
    document.getElementById('memo-modal-close').addEventListener('click', () => APP.closeModal('memo-modal'));
    document.getElementById('memo-cancel').addEventListener('click', () => APP.closeModal('memo-modal'));
    document.getElementById('memo-modal').addEventListener('click', e => {
      if (e.target.id === 'memo-modal') APP.closeModal('memo-modal');
    });

    document.getElementById('memo-save').addEventListener('click', () => {
      const dateStr = document.getElementById('memo-modal-date').dataset.date;
      const text = document.getElementById('memo-text').value.trim();
      if (text) {
        APP.memos[dateStr] = text;
      } else {
        delete APP.memos[dateStr];
      }
      APP.saveMemos();
      APP.closeModal('memo-modal');
      this.render();
    });
  },

  // ---- 週の日付配列を取得 (月〜日、7日分) ----
  _getWeekDates() {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(APP.currentWeekStart);
      d.setDate(d.getDate() + i);
      dates.push(APP.formatDate(d));
    }
    return dates;
  },

  // ---- レンダリング ----
  render() {
    const ws = APP.currentWeekStart;
    const weekEnd = new Date(ws);
    weekEnd.setDate(ws.getDate() + 6);
    document.getElementById('week-title').textContent =
      `${ws.getMonth()+1}/${ws.getDate()} 〜 ${weekEnd.getMonth()+1}/${weekEnd.getDate()}`;

    const grid = document.getElementById('week-grid');
    grid.innerHTML = '';

    const dates = this._getWeekDates();
    const today = APP.formatDate(new Date());
    const DAY_NAMES = ['月', '火', '水', '木', '金', '土', '日'];

    // === ヘッダー行（ラベル + 7日の曜日・日付）===
    this._addCell(grid, 'wg-cell wg-header wg-label', '');

    dates.forEach((dateStr, i) => {
      const d = new Date(dateStr);
      const dayName = DAY_NAMES[i];
      const isToday = dateStr === today;
      let cls = 'wg-cell wg-header';
      if (i === 5) cls += ' sat';
      if (i === 6) cls += ' sun';
      if (isToday) cls += ' today-col';

      const cell = this._addCell(grid, cls, '');
      cell.innerHTML = `<div>${dayName}</div><div class="wg-date-num">${d.getDate()}</div>`;
    });

    // === メモ行 ===
    const memoLabel = this._addCell(grid, 'wg-cell wg-label', '');
    memoLabel.innerHTML = '<span style="font-size:10px;color:#aaa">メモ</span>';

    dates.forEach((dateStr, i) => {
      const memo = APP.memos[dateStr] || '';
      const cell = this._addCell(grid, 'wg-cell', '');
      cell.style.cssText = 'background:#fffde7;min-height:28px;padding:3px 4px;cursor:pointer;font-size:11px;color:#666;';
      cell.textContent = memo || '';
      cell.addEventListener('click', () => this._openMemo(dateStr));
    });

    // === 時間帯行 ===
    this.ROWS.forEach(row => {
      // ラベルセル
      const labelCell = this._addCell(grid, 'wg-cell wg-label', '');
      labelCell.innerHTML = `<span>${row.label}</span><span class="wg-time">${row.time}</span>`;

      // 各日のセル
      dates.forEach((dateStr, dayIdx) => {
        const overrideKey = `${dateStr}-${row.key}`;
        const override = APP.weekOverrides[overrideKey] || null;

        let baseData = null;
        if (!row.special && row.period && dayIdx < 5) {
          baseData = TIMETABLE.getForDay(dayIdx, row.period);
        }

        const isModified = override !== null;

        let cellCls = 'wg-cell clickable';
        if (row.special) cellCls += ' special';

        const cell = this._addCell(grid, cellCls, '');

        // 表示内容
        if (override) {
          const contentDiv = document.createElement('div');
          contentDiv.className = `wg-cell-content type-${override.type}`;
          contentDiv.innerHTML = `
            <div class="wg-subj">${override.content || ''}</div>
            ${override.room ? `<div class="wg-room">${override.room}</div>` : ''}
            <div class="wg-ctype">${override.type}</div>
          `;
          cell.appendChild(contentDiv);
        } else if (baseData) {
          const GRADE_COLORS = { 1: '#E6EAF8', 2: '#E6F1FB', 3: '#FCEBEB' };
          const bg = GRADE_COLORS[baseData.grade] || '';
          if (bg) cell.style.background = bg;
          const contentDiv = document.createElement('div');
          contentDiv.className = 'wg-cell-content type-授業';
          contentDiv.innerHTML = `
            <div class="wg-subj">${baseData.subject || ''}</div>
            ${baseData.room ? `<div class="wg-room">${baseData.room}</div>` : ''}
          `;
          cell.appendChild(contentDiv);
        }

        // 変更マーク（赤丸）
        if (isModified) {
          const dot = document.createElement('div');
          dot.className = 'wg-modified';
          cell.appendChild(dot);
        }

        // クリックで編集
        cell.addEventListener('click', () => {
          this._openEdit(overrideKey, row, baseData, override);
        });
      });
    });
  },

  _addCell(grid, cls, text) {
    const el = document.createElement('div');
    el.className = cls;
    if (text) el.textContent = text;
    grid.appendChild(el);
    return el;
  },

  _openEdit(key, row, baseData, override) {
    this.editingKey = key;
    const label = row.label;
    const datePart = key.split('-').slice(0, 3).join('-');
    document.getElementById('week-modal-title').textContent = `${datePart} ${label}`;

    if (override) {
      document.getElementById('wm-content').value = override.content || '';
      document.getElementById('wm-room').value    = override.room    || '';
      document.getElementById('wm-type').value    = override.type    || '授業';
    } else if (baseData) {
      document.getElementById('wm-content').value = baseData.subject || '';
      document.getElementById('wm-room').value    = baseData.room    || '';
      document.getElementById('wm-type').value    = '授業';
    } else {
      document.getElementById('wm-content').value = '';
      document.getElementById('wm-room').value    = '';
      document.getElementById('wm-type').value    = row.special ? '校務' : '授業';
    }
    APP.openModal('week-modal');
    setTimeout(() => document.getElementById('wm-content').focus(), 50);
  },

  _openMemo(dateStr) {
    const titleEl = document.getElementById('memo-modal-date');
    titleEl.textContent = dateStr + ' のメモ';
    titleEl.dataset.date = dateStr;
    document.getElementById('memo-text').value = APP.memos[dateStr] || '';
    APP.openModal('memo-modal');
    setTimeout(() => document.getElementById('memo-text').focus(), 50);
  }
};
