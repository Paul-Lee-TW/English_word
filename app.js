'use strict';

/* ================= data & state ================= */

const STORE_KEY = 'tango3000-v1';
const LEVEL_SIZE = 500;               // 6 levels x 500 words
const INTERVALS = [0, 1, 2, 4, 7, 15, 30]; // days until next review, by box
const MASTER_BOX = 6;

let WORDS = [];                       // [{w, ja}] frequency order
let state = loadState();

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.cards) return s;
  } catch (e) { /* fall through */ }
  return { cards: {}, streak: 0, lastDay: 0, newPerSession: 10, learnedToday: 0, todayDay: 0 };
}
function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

function dayNum() {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}
function touchStreak() {
  const today = dayNum();
  if (state.lastDay === today) return;
  state.streak = (state.lastDay === today - 1) ? state.streak + 1 : 1;
  state.lastDay = today;
}
function todayCount() {
  const today = dayNum();
  if (state.todayDay !== today) { state.todayDay = today; state.learnedToday = 0; }
  return state.learnedToday;
}

// card = [box, dueDay]
function getCard(i) { return state.cards[i]; }
function setCard(i, box, due) { state.cards[i] = [box, due]; }
function gradeCard(i, ok) {
  const c = getCard(i) || [0, 0];
  let box = ok ? Math.min(c[0] + 1, MASTER_BOX) : 1;
  setCard(i, box, dayNum() + INTERVALS[box]);
  touchStreak();
  saveState();
}

function dueIndices() {
  const today = dayNum();
  return Object.keys(state.cards)
    .map(Number)
    .filter(i => state.cards[i][0] < MASTER_BOX && state.cards[i][1] <= today)
    .sort((a, b) => a - b);
}
function newIndices(limit) {
  const out = [];
  for (let i = 0; i < WORDS.length && out.length < limit; i++) {
    if (!state.cards[i]) out.push(i);
  }
  return out;
}
function counts() {
  let master = 0, learning = 0;
  for (const k in state.cards) {
    if (state.cards[k][0] >= MASTER_BOX) master++; else learning++;
  }
  return { master, learning, unseen: WORDS.length - master - learning };
}

/* ================= helpers ================= */

const $app = () => document.getElementById('app');
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
function esc(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ejdict definitions are " / "-separated sense segments
function senses(ja) { return ja.split(' / ').filter(s => s.trim()); }

// short gloss for quiz choices / list rows: first informative segment, markers stripped
function shortJa(ja) {
  for (const seg of senses(ja)) {
    const clean = seg
      .replace(/《[^》]*》/g, '')
      .replace(/〈[^〉]*〉/g, '')
      .replace(/[『』]/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/（[^）]*）/g, '')
      .trim().replace(/^[,，;；]+|[,，;；]+$/g, '');
    if (clean) return clean.length > 28 ? clean.slice(0, 28) + '…' : clean;
  }
  return ja.slice(0, 28);
}

function speak(word) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  u.rate = 0.9;
  const v = speechSynthesis.getVoices().find(v => v.lang.startsWith('en'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function meaningHtml(ja, expanded) {
  const ss = senses(ja);
  const shown = expanded ? ss : ss.slice(0, 4);
  let html = '<ul class="meaning">' + shown.map(s => `<li>${esc(s)}</li>`).join('') + '</ul>';
  if (!expanded && ss.length > 4) html += `<button class="more-btn" data-act="more">すべて表示（${ss.length}件）</button>`;
  return html;
}

/* ================= screens ================= */

function showHome() {
  const c = counts();
  const due = dueIndices().length;
  const pctM = (c.master / WORDS.length * 100).toFixed(1);
  const pctL = (c.learning / WORDS.length * 100).toFixed(1);
  const today = todayCount();
  saveState();
  $app().innerHTML = `
    <div class="stats-card">
      <div class="streak">🔥 連続 <b>${state.streak}</b> 日　｜　今日の新出単語：${today} 語</div>
      <div class="progress-bar">
        <div class="seg-master" style="width:${pctM}%"></div>
        <div class="seg-learn" style="width:${pctL}%"></div>
      </div>
      <div class="legend">
        <span><i style="background:var(--green)"></i>習得 ${c.master}</span>
        <span><i style="background:var(--amber)"></i>学習中 ${c.learning}</span>
        <span><i style="background:#e7eaf3"></i>未学習 ${c.unseen}</span>
      </div>
    </div>
    <button class="menu-btn" data-act="learn">
      <span>📖 新しい単語<span class="sub">頻度順に ${state.newPerSession} 語ずつ学ぶ</span></span>
    </button>
    <button class="menu-btn" data-act="review">
      <span>🔁 復習テスト<span class="sub">期限が来た単語を4択でチェック</span></span>
      <span class="badge ${due ? '' : 'zero'}">${due}</span>
    </button>
    <button class="menu-btn" data-act="spell">
      <span>⌨️ スペル練習<span class="sub">意味と音声を聞いて英語を入力</span></span>
    </button>
    <button class="menu-btn" data-act="list">
      <span>📋 単語リスト<span class="sub">3000語を検索・レベル別に確認</span></span>
    </button>`;
  $app().onclick = e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    ({ learn: startLearn, review: startReview, spell: startSpell, list: showList })[btn.dataset.act]();
  };
}

/* ---- learn: flashcards for new words ---- */
function startLearn() {
  const queue = newIndices(state.newPerSession);
  if (!queue.length) return showResult('🎉', '全部の単語を学習済みです！', 'すごい！復習を続けましょう。');
  let pos = 0;
  render();

  function render(flipped, expanded) {
    const i = queue[pos];
    const w = WORDS[i];
    $app().innerHTML = `
      <div class="session-head"><span>新しい単語</span><span>${pos + 1} / ${queue.length}</span></div>
      <div class="flashcard" data-act="${flipped ? '' : 'flip'}">
        <div class="rank">#${i + 1}　レベル${Math.floor(i / LEVEL_SIZE) + 1}</div>
        <div class="word">${esc(w.w)}</div>
        <button class="speak-btn" data-act="speak">🔊</button>
        ${flipped ? meaningHtml(w.ja, expanded) : '<div class="hint">タップして意味を表示</div>'}
      </div>
      ${flipped ? `
        <div class="btn-row">
          <button class="big-btn green" data-act="know">もう知ってる</button>
          <button class="big-btn blue" data-act="learned">学習した</button>
        </div>` : ''}`;
    $app().onclick = e => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'speak') { speak(w.w); return; }
      if (act === 'flip') { speak(w.w); render(true, false); return; }
      if (act === 'more') { render(true, true); return; }
      if (act === 'know' || act === 'learned') {
        const box = act === 'know' ? 4 : 1;
        setCard(i, box, dayNum() + INTERVALS[box]);
        touchStreak();
        todayCount();
        state.learnedToday++;
        saveState();
        pos++;
        if (pos < queue.length) render(false, false);
        else showResult('✅', `${queue.length} 語を学習しました`, '明日の復習テストで定着させよう！');
      }
    };
    if (!flipped) speak(w.w);
  }
}

/* ---- review: 4-choice quiz (en -> ja) for due cards ---- */
function startReview() {
  const queue = shuffle(dueIndices()).slice(0, 30);
  if (!queue.length) return showResult('☕', '今日の復習はありません', '「新しい単語」を進めましょう。');
  let pos = 0, correct = 0;
  render();

  function choicesFor(i) {
    const picks = new Set([i]);
    while (picks.size < 4) {
      // distractors from nearby frequency ranks feel fairer than random ones
      const span = Math.min(WORDS.length, 600);
      const base = Math.max(0, Math.min(WORDS.length - span, i - span / 2));
      picks.add(base + Math.floor(Math.random() * span));
    }
    return shuffle([...picks]);
  }

  function render() {
    const i = queue[pos];
    const w = WORDS[i];
    const choices = choicesFor(i);
    $app().innerHTML = `
      <div class="session-head"><span>復習テスト</span><span>${pos + 1} / ${queue.length}</span></div>
      <div class="quiz-q">
        <div class="word">${esc(w.w)}</div>
        <button class="speak-btn" data-act="speak">🔊</button>
      </div>
      ${choices.map(c => `<button class="choice" data-i="${c}">${esc(shortJa(WORDS[c].ja))}</button>`).join('')}`;
    speak(w.w);
    let answered = false;
    $app().onclick = e => {
      const sp = e.target.closest('[data-act="speak"]');
      if (sp) { speak(w.w); return; }
      const btn = e.target.closest('.choice');
      if (!btn || answered) return;
      answered = true;
      const picked = Number(btn.dataset.i);
      const ok = picked === i;
      if (ok) correct++; else btn.classList.add('wrong');
      document.querySelectorAll('.choice').forEach(b => {
        if (Number(b.dataset.i) === i) b.classList.add('correct');
      });
      gradeCard(i, ok);
      setTimeout(next, ok ? 700 : 1800);
    };
    function next() {
      pos++;
      if (pos < queue.length) render();
      else showResult(correct === queue.length ? '🏆' : '💪',
        `${queue.length} 問中 ${correct} 問正解`,
        '間違えた単語は明日もう一度出題されます。');
    }
  }
}

/* ---- spelling: ja + audio -> type the word ---- */
function startSpell() {
  const pool = Object.keys(state.cards).map(Number);
  if (pool.length < 4) return showResult('📖', 'まず単語を学習しよう', 'スペル練習は学習済みの単語から出題されます。');
  const queue = shuffle(pool).slice(0, 10);
  let pos = 0, correct = 0;
  render();

  function render() {
    const i = queue[pos];
    const w = WORDS[i];
    $app().innerHTML = `
      <div class="session-head"><span>スペル練習</span><span>${pos + 1} / ${queue.length}</span></div>
      <div class="quiz-q">
        <div class="ja-prompt">${esc(shortJa(w.ja))}</div>
        <button class="speak-btn" data-act="speak">🔊</button>
      </div>
      <input class="spell-input" type="text" autocomplete="off" autocapitalize="none"
             autocorrect="off" spellcheck="false" placeholder="英語で入力">
      <div class="feedback"></div>
      <div class="btn-row"><button class="big-btn blue" data-act="check">答え合わせ</button></div>`;
    const input = document.querySelector('.spell-input');
    const fb = document.querySelector('.feedback');
    input.focus();
    speak(w.w);
    let answered = false;
    function check() {
      if (answered) return;
      answered = true;
      const ok = input.value.trim().toLowerCase() === w.w;
      if (ok) { correct++; fb.textContent = '⭕ 正解！'; fb.className = 'feedback ok'; }
      else { fb.textContent = `❌ 正解は「${w.w}」`; fb.className = 'feedback ng'; }
      gradeCard(i, ok);
      setTimeout(() => {
        pos++;
        if (pos < queue.length) render();
        else showResult(correct >= queue.length * 0.8 ? '🏆' : '💪',
          `${queue.length} 問中 ${correct} 問正解`, 'スペルは書けてこそ本物！');
      }, ok ? 800 : 2000);
    }
    input.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
    $app().onclick = e => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      if (t.dataset.act === 'speak') speak(w.w);
      if (t.dataset.act === 'check') check();
    };
  }
}

/* ---- word list ---- */
function showList() {
  let level = 0;      // 0 = all
  let query = '';
  let limit = 50;
  render();

  function rows() {
    let idx = [...WORDS.keys()];
    if (level) idx = idx.filter(i => Math.floor(i / LEVEL_SIZE) + 1 === level);
    if (query) idx = idx.filter(i => WORDS[i].w.includes(query) || WORDS[i].ja.includes(query));
    return idx;
  }
  function status(i) {
    const c = getCard(i);
    if (!c) return '⬜';
    return c[0] >= MASTER_BOX ? '✅' : '🟡';
  }
  function render() {
    const idx = rows();
    const tabs = ['全部', 'Lv1', 'Lv2', 'Lv3', 'Lv4', 'Lv5', 'Lv6'];
    $app().innerHTML = `
      <input class="search-box" type="search" placeholder="🔍 単語・意味で検索" value="${esc(query)}">
      <div class="level-tabs">${tabs.map((t, n) =>
        `<button class="level-tab ${n === level ? 'active' : ''}" data-lv="${n}">${t}</button>`).join('')}</div>
      <div id="rows">${idx.slice(0, limit).map(i => `
        <div class="word-row" data-i="${i}">
          <span class="st">${status(i)}</span>
          <span class="w">${esc(WORDS[i].w)}</span>
          <span class="ja">${esc(shortJa(WORDS[i].ja))}</span>
        </div>`).join('')}</div>
      ${idx.length > limit ? `<button class="list-more">さらに表示（残り ${idx.length - limit} 語）</button>` : ''}`;
    const sb = document.querySelector('.search-box');
    sb.addEventListener('input', () => { query = sb.value.trim().toLowerCase(); limit = 50; renderKeepFocus(); });
    $app().onclick = e => {
      const tab = e.target.closest('.level-tab');
      if (tab) { level = Number(tab.dataset.lv); limit = 50; render(); return; }
      if (e.target.closest('.list-more')) { limit += 100; render(); return; }
      const row = e.target.closest('.word-row');
      if (row) speak(WORDS[Number(row.dataset.i)].w);
    };
    function renderKeepFocus() {
      const pos = sb.selectionStart;
      render();
      const nb = document.querySelector('.search-box');
      nb.focus();
      nb.setSelectionRange(pos, pos);
    }
  }
}

/* ---- settings ---- */
function showSettings() {
  $app().innerHTML = `
    <div class="panel">
      <h3>⚙️ 設定</h3>
      <label>1回に学ぶ新出単語の数</label>
      <select id="nps">${[5, 10, 15, 20, 30].map(n =>
        `<option value="${n}" ${n === state.newPerSession ? 'selected' : ''}>${n} 語</option>`).join('')}</select>
    </div>
    <div class="panel">
      <h3>💾 学習データのバックアップ</h3>
      <p class="note">進みぐあいはこの端末のブラウザにだけ保存されます。機種変更やブラウザのデータ削除に備えて、ときどきバックアップしてください。</p>
      <button class="small-btn" id="exp">エクスポート</button>
      <button class="small-btn" id="imp">インポート</button>
      <button class="small-btn danger" id="reset">進捗をリセット</button>
      <textarea id="io" placeholder="エクスポートを押すとここにデータが出ます。インポートはここに貼り付けてから押してください。"></textarea>
    </div>
    <div class="panel">
      <h3>ℹ️ このアプリについて</h3>
      <p class="note">単語リスト: NGSL (New General Service List, CC BY 3.0) ＋ 頻度順上位語<br>
      日本語訳: ejdict-hand（パブリックドメイン）<br>
      間隔反復（ライトナー方式）で復習日を自動管理します。</p>
    </div>`;
  const io = document.getElementById('io');
  document.getElementById('nps').onchange = e => { state.newPerSession = Number(e.target.value); saveState(); };
  document.getElementById('exp').onclick = () => { io.value = JSON.stringify(state); io.select(); };
  document.getElementById('imp').onclick = () => {
    try {
      const s = JSON.parse(io.value);
      if (!s.cards) throw new Error('bad');
      state = s; saveState(); alert('インポートしました！'); showHome();
    } catch (e) { alert('データの形式が正しくありません'); }
  };
  document.getElementById('reset').onclick = () => {
    if (confirm('本当に学習進捗をすべて消しますか？')) {
      state = { cards: {}, streak: 0, lastDay: 0, newPerSession: state.newPerSession, learnedToday: 0, todayDay: 0 };
      saveState(); showHome();
    }
  };
}

function showResult(emoji, title, sub) {
  $app().innerHTML = `
    <div class="result">
      <div class="big">${emoji}</div>
      <h2>${esc(title)}</h2>
      <p>${esc(sub)}</p>
      <div class="btn-row"><button class="big-btn blue" id="back">ホームへ戻る</button></div>
    </div>`;
  document.getElementById('back').onclick = showHome;
}

/* ================= boot ================= */

document.getElementById('btn-home').onclick = showHome;
document.getElementById('btn-settings').onclick = showSettings;
if ('speechSynthesis' in window) speechSynthesis.getVoices(); // warm up voice list

fetch('data/words.json')
  .then(r => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  })
  .then(data => { WORDS = data; showHome(); })
  .catch(err => {
    $app().innerHTML = `<div class="loading">単語データを読み込めませんでした (${esc(String(err))})。<br>
      ローカルで開く場合は <code>python3 -m http.server</code> などのサーバー経由で開いてください。</div>`;
  });
