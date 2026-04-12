// ========== TIMETABLE.JS — 基本時間割 ==========

const TIMETABLE = {
  DAYS: ['月', '火', '水', '木', '金'],
  PERIODS: [1, 2, 3, 4, 5, 6],
  GRADE_COLORS: { 0: '', 1: 'grade-1', 2: 'grade-2', 3: 'grade-3' },

  editingKey: null,  // "dayIndex-period"

  init() {
    this._setupModal();
    this.render();
  },

  // ---- モーダル ----
  _setupModal() {
    document.getElementById('tt-modal-close').addEventListener('click', () => APP.closeModal('tt-modal'));
    document.getElementById('tm-cancel').addEventListener('click', () => APP.closeModal('tt-modal'));
    document.getElementById('tt-modal').addEventListener('click', e => {
      if (e.target.id === 'tt-modal') APP.closeModal('tt-modal');
    });

    document.getElementById('tm-save').addEventListener('click', () => {
      if (!this.editingKey) return;
      const subject = document.getElementById('tm-subject').value.trim();
      const room    = document.getElementById('tm-room').value.trim();
      const grade   = parseInt(document.getElementById('tm-grade').value);

      if (subject || room) {
        APP.timetable[this.editingKey] = { subject, room, grade };
      } else {
        delete APP.timetable[this.editingKey];
      }
      APP.saveTimetable();
      APP.closeModal('tt-modal');
      this.render();
      // 週間スケジュールも更新
      WEEK.render();
    });
  },

  // ---- レンダリング ----
  render() {
    const wrap = document.getElementById('timetable-grid');
    wrap.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'tt-table';

    // ヘッダー行
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th class="tt-period-label">校時</th>';
    this.DAYS.forEach(d => {
      headerRow.innerHTML += `<th>${d}</th>`;
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // データ行
    const tbody = document.createElement('tbody');
    this.PERIODS.forEach(period => {
      const tr = document.createElement('tr');
      // 校時ラベル
      const tdLabel = document.createElement('td');
      tdLabel.className = 'tt-period-label';
      tdLabel.textContent = `${period}校時`;
      tr.appendChild(tdLabel);

      this.DAYS.forEach((_, dayIdx) => {
        const key = `${dayIdx}-${period}`;
        const data = APP.timetable[key] || {};
        const td = document.createElement('td');
        td.className = 'tt-cell ' + (this.GRADE_COLORS[data.grade] || '');

        if (data.subject || data.room) {
          td.innerHTML = `
            <div class="tt-subject">${data.subject || ''}</div>
            <div class="tt-room">${data.room || ''}</div>
          `;
        }

        td.addEventListener('click', () => this._openEdit(dayIdx, period, data));
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  },

  _openEdit(dayIdx, period, data) {
    this.editingKey = `${dayIdx}-${period}`;
    const dayName = this.DAYS[dayIdx];
    document.getElementById('tt-modal-title').textContent = `${dayName}曜 ${period}校時`;
    document.getElementById('tm-subject').value = data.subject || '';
    document.getElementById('tm-room').value    = data.room    || '';
    document.getElementById('tm-grade').value   = String(data.grade || 0);
    APP.openModal('tt-modal');
    setTimeout(() => document.getElementById('tm-subject').focus(), 50);
  },

  // 基本時間割から指定日の授業データを取得
  getForDay(dayIdx, period) {
    return APP.timetable[`${dayIdx}-${period}`] || null;
  }
};
