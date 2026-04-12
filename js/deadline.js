// ========== DEADLINE.JS — 提出物・締切 ==========

const DEADLINE = {
  init() {
    this._setupAddBtn();
    this._setupModal();
    this._setupTodoSync();
    this.render();
  },

  // ---- 追加ボタン ----
  _setupAddBtn() {
    document.getElementById('add-dl-btn').addEventListener('click', () => {
      document.getElementById('dm-name').value    = '';
      document.getElementById('dm-subject').value = '';
      document.getElementById('dm-due').value     = APP.formatDate(new Date());
      APP.openModal('dl-modal');
      setTimeout(() => document.getElementById('dm-name').focus(), 50);
    });
  },

  // ---- モーダル ----
  _setupModal() {
    document.getElementById('dl-modal-close').addEventListener('click', () => APP.closeModal('dl-modal'));
    document.getElementById('dm-cancel').addEventListener('click', () => APP.closeModal('dl-modal'));
    document.getElementById('dl-modal').addEventListener('click', e => {
      if (e.target.id === 'dl-modal') APP.closeModal('dl-modal');
    });

    document.getElementById('dm-save').addEventListener('click', () => {
      const name    = document.getElementById('dm-name').value.trim();
      const subject = document.getElementById('dm-subject').value.trim();
      const dueDate = document.getElementById('dm-due').value;
      if (!name || !dueDate) { alert('タスク名と締切日を入力してください。'); return; }

      APP.deadlines.push({
        id: APP.generateId(),
        name,
        subject,
        dueDate,
        done: false,
        source: 'local'
      });
      APP.saveDeadlines();
      APP.closeModal('dl-modal');
      this.render();
    });
  },

  // ---- Google ToDo 同期 ----
  _setupTodoSync() {
    document.getElementById('todo-sync-btn').addEventListener('click', async () => {
      if (!GCAL.isConnected) { alert('先にGoogle Calendarへ接続してください。'); return; }

      const tasks = await GCAL.fetchTasks();
      if (!tasks.length) { alert('ToDoリストにタスクが見つかりませんでした。'); return; }

      // 既存のToDo由来エントリを削除
      APP.deadlines = APP.deadlines.filter(d => d.source !== 'todo');

      tasks.forEach(task => {
        const dueDate = task.due ? task.due.substring(0, 10) : '';
        APP.deadlines.push({
          id: APP.generateId(),
          name: task.title || '(無題)',
          subject: task.listTitle || '',
          dueDate,
          done: task.status === 'completed',
          source: 'todo',
          todoId: task.id
        });
      });
      APP.saveDeadlines();
      this.render();
      alert(`${tasks.length}件のToDoを同期しました。`);
    });
  },

  // ---- レンダリング ----
  render() {
    const list = document.getElementById('deadline-list');
    list.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ソート：未完了を先に、期日順
    const sorted = [...APP.deadlines].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });

    if (!sorted.length) {
      list.innerHTML = '<div class="dl-empty">タスクがありません。</div>';
      return;
    }

    sorted.forEach(dl => {
      const item = document.createElement('div');
      item.className = 'dl-item' + (dl.done ? ' done' : '') + (dl.source === 'todo' ? ' source-todo' : '');

      // チェックボックス
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'dl-check';
      check.checked = dl.done;
      check.addEventListener('change', () => {
        dl.done = check.checked;
        APP.saveDeadlines();
        this.render();
      });
      item.appendChild(check);

      // 情報
      const info = document.createElement('div');
      info.className = 'dl-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'dl-name' + (dl.done ? ' done' : '');
      nameEl.textContent = dl.name;
      if (dl.source === 'todo') {
        const badge = document.createElement('span');
        badge.className = 'dl-badge';
        badge.textContent = 'ToDo';
        badge.style.marginLeft = '6px';
        nameEl.appendChild(badge);
      }
      info.appendChild(nameEl);

      if (dl.subject) {
        const subj = document.createElement('div');
        subj.className = 'dl-subject';
        subj.textContent = dl.subject;
        info.appendChild(subj);
      }

      if (dl.dueDate) {
        const dueEl = document.createElement('div');
        dueEl.className = 'dl-due';
        dueEl.textContent = '締切: ' + dl.dueDate;
        info.appendChild(dueEl);
      }

      item.appendChild(info);

      // カウントダウン
      if (dl.dueDate && !dl.done) {
        const dueDate = APP.parseDate(dl.dueDate);
        const diff = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));
        const countdown = document.createElement('div');
        countdown.className = 'dl-countdown';
        if (diff < 0) {
          countdown.textContent = `${Math.abs(diff)}日超過`;
          countdown.classList.add('overdue');
        } else if (diff === 0) {
          countdown.textContent = '今日';
          countdown.classList.add('urgent');
        } else if (diff <= 3) {
          countdown.textContent = `あと${diff}日`;
          countdown.classList.add('urgent');
        } else {
          countdown.textContent = `あと${diff}日`;
        }
        item.appendChild(countdown);
      }

      // 削除ボタン
      const del = document.createElement('button');
      del.className = 'dl-delete';
      del.textContent = '✕';
      del.title = '削除';
      del.addEventListener('click', () => {
        if (confirm(`「${dl.name}」を削除しますか？`)) {
          APP.deadlines = APP.deadlines.filter(d => d.id !== dl.id);
          APP.saveDeadlines();
          this.render();
        }
      });
      item.appendChild(del);

      list.appendChild(item);
    });
  }
};
