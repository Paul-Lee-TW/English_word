'use strict';

/* ================= data & state ================= */

const STORE_KEY = 'tango3000-v1';
const LEVEL_SIZE = 500;               // 6 levels x 500 words
const INTERVALS = [0, 1, 2, 4, 7, 15, 30]; // days until next review, by box
const MASTER_BOX = 6;

let WORDS = [];                       // [{w, ja}] words in frequency order, then built-in phrases
let PHRASE_START = Infinity;          // index of first built-in phrase in WORDS
let DICT = null;                      // lazy-loaded lookup dict for custom words
let state = loadState();

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.cards) {
      s.custom = s.custom || {};
      s.nextCustomId = s.nextCustomId || 1;
      s.learnOrder = s.learnOrder || 'seq';
      s.learnLevel = s.learnLevel || 0;
      return s;
    }
  } catch (e) { /* fall through */ }
  return { cards: {}, custom: {}, nextCustomId: 1, streak: 0, lastDay: 0,
           newPerSession: 10, learnedToday: 0, todayDay: 0, learnOrder: 'seq', learnLevel: 0 };
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

// card key: number = index into WORDS, 'c<id>' = custom word
function isCustomKey(k) { return typeof k === 'string' && k[0] === 'c'; }
function normKey(k) { return k[0] === 'c' ? k : Number(k); }
function wordOf(k) { return isCustomKey(k) ? state.custom[k] : WORDS[k]; }

// card = [box, dueDay]
function getCard(k) { return state.cards[k]; }
function setCard(k, box, due) { state.cards[k] = [box, due]; }
function gradeCard(k, ok) {
  const c = getCard(k) || [0, 0];
  let box = ok ? Math.min(c[0] + 1, MASTER_BOX) : 1;
  setCard(k, box, dayNum() + INTERVALS[box]);
  touchStreak();
  saveState();
}

function dueKeys() {
  const today = dayNum();
  return Object.keys(state.cards)
    .map(normKey)
    .filter(k => wordOf(k) && state.cards[k][0] < MASTER_BOX && state.cards[k][1] <= today);
}
function newPhraseIndices(limit) {
  const out = [];
  for (let i = PHRASE_START; i < WORDS.length && out.length < limit; i++) {
    if (!state.cards[i]) out.push(i);
  }
  return out;
}
function newCustomKeys() {
  return Object.keys(state.custom).filter(k => !state.cards[k]);
}
function isPhraseKey(k) { return typeof k === 'number' && k >= PHRASE_START; }
function counts() {
  let master = 0, learning = 0, cMaster = 0, cLearning = 0;
  for (const k in state.cards) {
    if (k[0] === 'c') {
      if (!state.custom[k]) continue;
      if (state.cards[k][0] >= MASTER_BOX) cMaster++; else cLearning++;
    } else {
      if (state.cards[k][0] >= MASTER_BOX) master++; else learning++;
    }
  }
  return { master, learning, unseen: WORDS.length - master - learning, cMaster, cLearning };
}

async function loadDict() {
  if (!DICT) {
    try {
      const r = await fetch('data/dict.json');
      DICT = r.ok ? await r.json() : {};
    } catch (e) { DICT = {}; }
  }
  return DICT;
}
// auto-lookup a Japanese definition: base 3000 list first, then the big dict
function lookupJa(word) {
  const w = word.toLowerCase();
  const base = WORDS.find(v => v.w === w);
  if (base) return base.ja;
  return (DICT && DICT[w]) || null;
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
  // strip placeholder marks used in phrase entries ("too ... to ~" etc.)
  const u = new SpeechSynthesisUtterance(word.replace(/\.{3}|[~…]/g, ' ').replace(/\s+/g, ' ').trim());
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
  const due = dueKeys().length;
  const customTotal = Object.keys(state.custom).length;
  let phraseNew = 0;
  for (let i = PHRASE_START; i < WORDS.length; i++) if (!state.cards[i]) phraseNew++;
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
      <span>📖 新しい単語<span class="sub">レベルを選んで ${state.newPerSession} 語ずつ学ぶ</span></span>
    </button>
    <button class="menu-btn" data-act="phrases">
      <span>📗 熟語・連語<span class="sub">get up, be good at など 中学の重要熟語</span></span>
      <span class="badge ${phraseNew ? '' : 'zero'}">${phraseNew}</span>
    </button>
    <button class="menu-btn" data-act="review">
      <span>🔁 復習テスト<span class="sub">期限が来た単語を4択でチェック</span></span>
      <span class="badge ${due ? '' : 'zero'}">${due}</span>
    </button>
    <button class="menu-btn" data-act="spell">
      <span>⌨️ スペル練習<span class="sub">意味と音声を聞いて英語を入力</span></span>
    </button>
    <button class="menu-btn" data-act="mywords">
      <span>📕 マイ単語<span class="sub">教科書の単語を自分で追加（${customTotal} 語）</span></span>
    </button>
    <button class="menu-btn" data-act="list">
      <span>📋 単語リスト<span class="sub">3000語＋熟語を検索・レベル別に確認</span></span>
    </button>`;
  $app().onclick = e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    ({ learn: startLearn, phrases: startLearnPhrases, review: startReview,
       spell: startSpell, mywords: showMyWords, list: showList })[btn.dataset.act]();
  };
}

/* ---- learn: pick a level, then flashcards for new words ---- */
function startLearn() {
  const wordEnd = Math.min(WORDS.length, PHRASE_START);
  const remain = lv => {
    const lo = lv ? (lv - 1) * LEVEL_SIZE : 0;
    const hi = lv ? Math.min(lv * LEVEL_SIZE, wordEnd) : wordEnd;
    let n = 0;
    for (let i = lo; i < hi; i++) if (!state.cards[i]) n++;
    return n;
  };
  const order = state.learnOrder;
  $app().innerHTML = `
    <div class="panel">
      <h3>📖 どこから学ぶ？</h3>
      <div class="level-tabs">
        <button class="level-tab ${order === 'seq' ? 'active' : ''}" data-order="seq">順番どおり</button>
        <button class="level-tab ${order === 'random' ? 'active' : ''}" data-order="random">ランダム</button>
      </div>
      <div class="lv-grid">
        ${[0, 1, 2, 3, 4, 5, 6].map(lv => `
          <button class="lv-btn ${remain(lv) ? '' : 'done'}" data-lv="${lv}">
            ${lv ? `レベル${lv}` : '全レベル'}
            <span class="cnt">残り ${remain(lv)}</span>
          </button>`).join('')}
      </div>
      <p class="note">レベル＝頻度順 500 語ずつ（レベル1がいちばんよく使う単語）。「ランダム」を選ぶと選んだ範囲から無作為に出題されます。</p>
    </div>`;
  $app().onclick = e => {
    const ob = e.target.closest('[data-order]');
    if (ob) { state.learnOrder = ob.dataset.order; saveState(); startLearn(); return; }
    const lb = e.target.closest('[data-lv]');
    if (lb) beginLearnSession(Number(lb.dataset.lv));
  };
}
function beginLearnSession(lv) {
  state.learnLevel = lv;
  saveState();
  const wordEnd = Math.min(WORDS.length, PHRASE_START);
  const lo = lv ? (lv - 1) * LEVEL_SIZE : 0;
  const hi = lv ? Math.min(lv * LEVEL_SIZE, wordEnd) : wordEnd;
  const pool = [];
  for (let i = lo; i < hi; i++) if (!state.cards[i]) pool.push(i);
  if (state.learnOrder === 'random') shuffle(pool);
  startLearnQueue(pool.slice(0, state.newPerSession),
    lv ? `新しい単語 Lv${lv}` : '新しい単語',
    () => showResult('🎉', 'このレベルは学習済みです！', '別のレベルか復習を続けましょう。'));
}
function startLearnCustom() {
  startLearnQueue(newCustomKeys(), 'マイ単語',
    () => showResult('📕', '未学習のマイ単語はありません', '単語を追加するか、復習を続けましょう。'));
}
function startLearnPhrases() {
  const pool = newPhraseIndices(Infinity);
  if (state.learnOrder === 'random') shuffle(pool);
  startLearnQueue(pool.slice(0, state.newPerSession), '熟語・連語',
    () => showResult('🎉', '全部の熟語を学習済みです！', 'すごい！復習で定着させましょう。'));
}
function startLearnQueue(queue, label, onEmpty) {
  if (!queue.length) return onEmpty();
  let pos = 0;
  render();

  function render(flipped, expanded) {
    const i = queue[pos];
    const w = wordOf(i);
    const rankLine = isCustomKey(i) ? '📕 マイ単語'
      : isPhraseKey(i) ? `📗 熟語 ${i - PHRASE_START + 1} / ${WORDS.length - PHRASE_START}`
      : `#${i + 1}　レベル${Math.floor(i / LEVEL_SIZE) + 1}`;
    $app().innerHTML = `
      <div class="session-head"><span>${label}</span><span>${pos + 1} / ${queue.length}</span></div>
      <div class="flashcard" data-act="${flipped ? '' : 'flip'}">
        <div class="rank">${rankLine}</div>
        <div class="word">${esc(w.w)}</div>
        <button class="speak-btn" data-act="speak">🔊</button>
        ${flipped ? meaningHtml(w.ja, expanded) : '<div class="hint">タップして意味を表示</div>'}
        <div class="swipe-tag tag-know">もう知ってる</div>
        <div class="swipe-tag tag-learned">学習した</div>
      </div>
      ${flipped ? `
        <div class="btn-row">
          <button class="big-btn green" data-act="know">もう知ってる</button>
          <button class="big-btn blue" data-act="learned">学習した</button>
        </div>` : ''}
      <p class="swipe-hint">スワイプでもOK　← もう知ってる｜学習した →</p>`;
    function finish(act) {
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
    $app().onclick = e => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'speak') { speak(w.w); return; }
      if (act === 'flip') { speak(w.w); render(true, false); return; }
      if (act === 'more') { render(true, true); return; }
      if (act === 'know' || act === 'learned') finish(act);
    };
    attachSwipe(document.querySelector('.flashcard'),
      () => finish('know'), () => finish('learned'));
    if (!flipped) speak(w.w);
  }
}

// swipe left -> onLeft, swipe right -> onRight; vertical moves keep scrolling
function attachSwipe(card, onLeft, onRight) {
  if (!card) return;
  let x0 = 0, y0 = 0, dragging = false, horizontal = false, done = false;
  card.addEventListener('touchstart', e => {
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY;
    dragging = true; horizontal = false;
    card.style.transition = 'none';
  }, { passive: true });
  card.addEventListener('touchmove', e => {
    if (!dragging || done) return;
    const t = e.touches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (!horizontal && Math.abs(dx) < 12) return;
    if (!horizontal && Math.abs(dy) > Math.abs(dx)) { dragging = false; return; }
    horizontal = true;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
    card.classList.toggle('swiping-left', dx < -50);
    card.classList.toggle('swiping-right', dx > 50);
  }, { passive: true });
  card.addEventListener('touchend', e => {
    if (!dragging || done) return;
    dragging = false;
    const dx = e.changedTouches[0].clientX - x0;
    if (horizontal && dx < -90) fly(-1, onLeft);
    else if (horizontal && dx > 90) fly(1, onRight);
    else {
      card.style.transition = 'transform .18s';
      card.style.transform = '';
      card.classList.remove('swiping-left', 'swiping-right');
    }
  });
  // a real swipe must not fire the tap actions underneath the finger
  card.addEventListener('click', e => {
    if (horizontal) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  function fly(dir, cb) {
    done = true;
    card.style.transition = 'transform .22s ease-out, opacity .22s';
    card.style.transform = `translateX(${dir * 120}%) rotate(${dir * 14}deg)`;
    card.style.opacity = '0';
    setTimeout(cb, 200);
  }
}

/* ---- review: 4-choice quiz (en -> ja) for due cards ---- */
function startReview() {
  const queue = shuffle(dueKeys()).slice(0, 30);
  if (!queue.length) return showResult('☕', '今日の復習はありません', '「新しい単語」を進めましょう。');
  let pos = 0, correct = 0;
  render();

  function choicesFor(key) {
    const w = wordOf(key);
    const texts = new Set([shortJa(w.ja)]);
    const out = [{ txt: shortJa(w.ja), ok: true }];
    // phrases get phrase distractors; words get distractors from nearby
    // frequency ranks, which feel fairer than fully random ones
    let lo, hi;
    if (isPhraseKey(key)) {
      lo = PHRASE_START; hi = WORDS.length;
    } else {
      const span = Math.min(PHRASE_START, WORDS.length, 600);
      const center = isCustomKey(key) ? Math.floor(Math.random() * span) : key;
      lo = Math.max(0, Math.min(Math.min(PHRASE_START, WORDS.length) - span, center - span / 2));
      hi = lo + span;
    }
    let guard = 0;
    while (out.length < 4 && guard++ < 200) {
      const j = lo + Math.floor(Math.random() * (hi - lo));
      const txt = shortJa(WORDS[j].ja);
      if (WORDS[j].w === w.w || texts.has(txt)) continue;
      texts.add(txt);
      out.push({ txt, ok: false });
    }
    return shuffle(out);
  }

  function render() {
    const key = queue[pos];
    const w = wordOf(key);
    const choices = choicesFor(key);
    $app().innerHTML = `
      <div class="session-head"><span>復習テスト</span><span>${pos + 1} / ${queue.length}</span></div>
      <div class="quiz-q">
        <div class="word">${esc(w.w)}</div>
        <button class="speak-btn" data-act="speak">🔊</button>
      </div>
      ${choices.map((c, n) => `<button class="choice" data-n="${n}">${esc(c.txt)}</button>`).join('')}`;
    speak(w.w);
    let answered = false;
    $app().onclick = e => {
      const sp = e.target.closest('[data-act="speak"]');
      if (sp) { speak(w.w); return; }
      const btn = e.target.closest('.choice');
      if (!btn || answered) return;
      answered = true;
      const ok = choices[Number(btn.dataset.n)].ok;
      if (ok) correct++; else btn.classList.add('wrong');
      document.querySelectorAll('.choice').forEach(b => {
        if (choices[Number(b.dataset.n)].ok) b.classList.add('correct');
      });
      gradeCard(key, ok);
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
  // phrases and multi-word entries are awkward to type — single words only
  const pool = Object.keys(state.cards).map(normKey)
    .filter(k => wordOf(k) && !wordOf(k).w.includes(' '));
  if (pool.length < 4) return showResult('📖', 'まず単語を学習しよう', 'スペル練習は学習済みの単語から出題されます。');
  const queue = shuffle(pool).slice(0, 10);
  let pos = 0, correct = 0;
  render();

  function render() {
    const i = queue[pos];
    const w = wordOf(i);
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

/* ---- my words: user-added textbook vocabulary ---- */
function showMyWords(msg) {
  const keys = Object.keys(state.custom).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
  const toLearn = newCustomKeys().length;
  function status(k) {
    const c = getCard(k);
    if (!c) return '⬜';
    return c[0] >= MASTER_BOX ? '✅' : '🟡';
  }
  $app().innerHTML = `
    <div class="panel">
      <h3>📕 マイ単語（${keys.length} 語）</h3>
      <p class="note">教科書に出てきた単語を追加できます。追加した単語は復習テスト・スペル練習にも出題されます。</p>
      ${toLearn ? `<button class="small-btn" id="learn-custom">未学習の ${toLearn} 語を学ぶ</button>` : ''}
    </div>
    <div class="panel">
      <h3>＋ 1語ずつ追加</h3>
      <input class="search-box" id="add-w" type="text" placeholder="英単語（例: festival）"
             autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">
      <input class="search-box" id="add-ja" type="text" placeholder="意味（空のままなら自動で調べます）">
      <button class="small-btn" id="add-one">追加</button>
      <div class="feedback" id="add-msg">${msg ? esc(msg) : ''}</div>
    </div>
    <div class="panel">
      <h3>📄 まとめて追加（教科書の1課分など）</h3>
      <p class="note">1行に1語。意味も指定する場合は「単語,意味」のように書きます。意味を書かない単語は辞書から自動で入ります。</p>
      <textarea id="bulk" placeholder="festival
shrine,神社
vacuum cleaner,掃除機"></textarea>
      <button class="small-btn" id="add-bulk">まとめて追加</button>
    </div>
    <div id="custom-rows">${keys.map(k => `
      <div class="word-row" data-k="${k}">
        <span class="st">${status(k)}</span>
        <span class="w">${esc(state.custom[k].w)}</span>
        <span class="ja">${esc(shortJa(state.custom[k].ja))}</span>
        <button class="icon-btn del-btn" data-del="${k}">🗑</button>
      </div>`).join('')}</div>`;

  const msgEl = document.getElementById('add-msg');
  function say(text, ok) { msgEl.textContent = text; msgEl.className = 'feedback ' + (ok ? 'ok' : 'ng'); }

  // returns 'added' | 'queued' (already in base list) | null
  function addWord(raw, ja) {
    const w = raw.trim().toLowerCase();
    if (!w) return null;
    const baseIdx = WORDS.findIndex(v => v.w === w);
    if (baseIdx >= 0) {
      // already in the 3000 — schedule it for today's review instead of duplicating
      if (!getCard(baseIdx)) setCard(baseIdx, 1, dayNum());
      return 'queued';
    }
    if (Object.values(state.custom).some(v => v.w === w)) return null;
    ja = (ja || '').trim() || (DICT && DICT[w]) || '';
    if (!ja) return 'noja';
    state.custom['c' + state.nextCustomId++] = { w, ja };
    return 'added';
  }

  document.getElementById('add-one').onclick = async () => {
    const w = document.getElementById('add-w').value;
    const ja = document.getElementById('add-ja').value;
    if (!w.trim()) { say('単語を入力してください', false); return; }
    await loadDict();
    const r = addWord(w, ja);
    saveState();
    if (r === 'added') showMyWords(`「${w.trim().toLowerCase()}」を追加しました`);
    else if (r === 'queued') showMyWords(`「${w.trim().toLowerCase()}」は内蔵リスト（3000語・熟語）にあります。今日の復習に追加しました`);
    else if (r === 'noja') say('辞書に見つかりません。意味を入力してから追加してください', false);
    else say('すでに追加されています', false);
  };

  document.getElementById('add-bulk').onclick = async () => {
    const lines = document.getElementById('bulk').value.split('\n');
    await loadDict();
    let added = 0, queued = 0;
    const failed = [];
    for (const line of lines) {
      const m = line.split(/[,，\t]/);
      const w = (m[0] || '').trim();
      if (!w) continue;
      const r = addWord(w, m.slice(1).join(','));
      if (r === 'added') added++;
      else if (r === 'queued') queued++;
      else if (r === 'noja') failed.push(w);
    }
    saveState();
    let text = `追加 ${added} 語`;
    if (queued) text += `／内蔵リストから今日の復習へ ${queued} 語`;
    if (failed.length) text += `／意味が見つからず追加できず: ${failed.join(', ')}（意味を付けて再入力してください）`;
    showMyWords(text);
  };

  if (toLearn) document.getElementById('learn-custom').onclick = startLearnCustom;

  document.getElementById('custom-rows').onclick = e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      const k = del.dataset.del;
      if (confirm(`「${state.custom[k].w}」を削除しますか？`)) {
        delete state.custom[k];
        delete state.cards[k];
        saveState();
        showMyWords();
      }
      return;
    }
    const row = e.target.closest('.word-row');
    if (row) speak(state.custom[row.dataset.k].w);
  };
}

/* ---- word list ---- */
function showList() {
  let level = 0;      // 0 = all
  let query = '';
  let limit = 50;
  render();

  function levelOf(i) { return i >= PHRASE_START ? 7 : Math.floor(i / LEVEL_SIZE) + 1; }
  function rows() {
    let idx = [...WORDS.keys()];
    if (level) idx = idx.filter(i => levelOf(i) === level);
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
    const tabs = ['全部', 'Lv1', 'Lv2', 'Lv3', 'Lv4', 'Lv5', 'Lv6', '熟語'];
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
    if (confirm('本当に学習進捗をすべて消しますか？（マイ単語の単語自体は残ります）')) {
      state = { cards: {}, custom: state.custom, nextCustomId: state.nextCustomId,
                streak: 0, lastDay: 0, newPerSession: state.newPerSession, learnedToday: 0, todayDay: 0 };
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

Promise.all([
  fetch('data/words.json').then(r => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }),
  fetch('data/phrases.json').then(r => r.ok ? r.json() : []),
])
  .then(([words, phrases]) => {
    PHRASE_START = words.length;
    WORDS = words.concat(phrases);
    showHome();
  })
  .catch(err => {
    $app().innerHTML = `<div class="loading">単語データを読み込めませんでした (${esc(String(err))})。<br>
      ローカルで開く場合は <code>python3 -m http.server</code> などのサーバー経由で開いてください。</div>`;
  });
