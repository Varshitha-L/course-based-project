// --- Storage helpers
const STORAGE_KEYS = {
  sessions: 'tw_sessions',
  habits: 'tw_habits',
  mood: 'tw_moods',
  points: 'tw_points',
  streak: 'tw_streak',
  lastActiveDate: 'tw_last_date'
};

const get = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
  catch { return fallback; }
};
const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// --- Date helpers
const todayISO = () => new Date().toISOString().slice(0, 10);
const isoToDisplay = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
const sameDay = (a, b) => a === b;

// --- Data init
let sessions = get(STORAGE_KEYS.sessions, []); // {dateISO, minutes, title, tags:[]}
let habits = get(STORAGE_KEYS.habits, {});     // {dateISO: {habitKey: true/false}}
let moods = get(STORAGE_KEYS.mood, []);        // {dateISO, mood, reflection}
let points = get(STORAGE_KEYS.points, 0);
let streak = get(STORAGE_KEYS.streak, 0);
let lastDate = get(STORAGE_KEYS.lastActiveDate, todayISO());

// Maintain streak daily boundary
(function maintainStreak() {
  const today = todayISO();
  if (!sameDay(lastDate, today)) {
    // If there was any session or habit yesterday, streak continues
    const hadActivityYesterday = sessions.some(s => s.dateISO === lastDate) ||
      (habits[lastDate] && Object.values(habits[lastDate]).some(Boolean)) ||
      moods.some(m => m.dateISO === lastDate);

    streak = hadActivityYesterday ? streak + 1 : 0;
    set(STORAGE_KEYS.streak, streak);
    lastDate = today;
    set(STORAGE_KEYS.lastActiveDate, lastDate);
  }
})();

// --- DOM
const el = {
  todayDate: document.getElementById('today-date'),
  exportCsv: document.getElementById('export-csv'),
  timerMinDisplay: document.getElementById('timer-min'),
  timerSecDisplay: document.getElementById('timer-sec'),
  timerMinutesInput: document.getElementById('timer-minutes'),
  startTimer: document.getElementById('start-timer'),
  pauseTimer: document.getElementById('pause-timer'),
  resetTimer: document.getElementById('reset-timer'),
  logSession: document.getElementById('log-session'),
  sessionTitle: document.getElementById('session-title'),
  sessionTags: document.getElementById('session-tags'),
  todayMins: document.getElementById('today-mins'),
  weekMins: document.getElementById('week-mins'),
  streakDays: document.getElementById('streak-days'),
  points: document.getElementById('points'),
  level: document.getElementById('level'),
  sessionsTbody: document.getElementById('sessions-tbody'),
  habits: document.querySelectorAll('.habit'),
  resetHabits: document.getElementById('reset-habits'),
  moodSelect: document.getElementById('mood-select'),
  reflection: document.getElementById('reflection'),
  saveMood: document.getElementById('save-mood'),
  moodList: document.getElementById('mood-list')
};

// --- UI init
el.todayDate.textContent = new Date().toLocaleString(undefined, {
  weekday: 'short', day: 'numeric', month: 'short'
});

// --- Timer
let timer = { remainingSec: 25 * 60, running: false, intervalId: null };

function updateTimerDisplay() {
  const m = Math.floor(timer.remainingSec / 60);
  const s = timer.remainingSec % 60;
  el.timerMinDisplay.textContent = String(m).padStart(2, '0');
  el.timerSecDisplay.textContent = String(s).padStart(2, '0');
}

function startTimer() {
  if (timer.running) return;
  timer.running = true;
  timer.intervalId = setInterval(() => {
    timer.remainingSec = Math.max(0, timer.remainingSec - 1);
    updateTimerDisplay();
    if (timer.remainingSec === 0) {
      pauseTimer();
      awardPoints(5); // completion bonus
      toast('Timer done! +5 pts');
    }
  }, 1000);
}

function pauseTimer() {
  timer.running = false;
  if (timer.intervalId) clearInterval(timer.intervalId);
}

function resetTimer() {
  pauseTimer();
  const mins = Math.max(1, parseInt(el.timerMinutesInput.value || '25', 10));
  timer.remainingSec = mins * 60;
  updateTimerDisplay();
}

function logSession() {
  const totalSec = Math.max(0, parseInt(el.timerMinutesInput.value || '25', 10)) * 60 - timer.remainingSec;
  const minutes = Math.round(totalSec / 60);
  const title = (el.sessionTitle.value || 'Focus block').trim();
  const tags = (el.sessionTags.value || '').split(',').map(t => t.trim()).filter(Boolean);
  const dateISO = todayISO();

  if (minutes <= 0) {
    toast('Log some minutes before saving.');
    return;
  }

  sessions.push({ dateISO, minutes, title, tags });
  set(STORAGE_KEYS.sessions, sessions);
  awardPoints(Math.min(10, Math.max(1, Math.floor(minutes / 5)))); // 1–10 pts based on time
  toast(`Logged "${title}" (${minutes}m)`);

  renderSessions();
  renderStats();
  renderCharts();
}

// --- Points & Level
function awardPoints(n) {
  points += n;
  set(STORAGE_KEYS.points, points);
  renderStats();
}

function levelFromPoints(p) {
  if (p < 50) return 'Novice';
  if (p < 150) return 'Builder';
  if (p < 300) return 'Navigator';
  if (p < 600) return 'Architect';
  return 'Master';
}

// --- Habits
function initHabitsForToday() {
  const t = todayISO();
  habits[t] = habits[t] || {};
  set(STORAGE_KEYS.habits, habits);
  el.habits.forEach(h => {
    const key = h.dataset.key;
    h.checked = !!habits[t][key];
  });
}
function toggleHabit(e) {
  const key = e.target.dataset.key;
  const t = todayISO();
  habits[t] = habits[t] || {};
  habits[t][key] = e.target.checked;
  set(STORAGE_KEYS.habits, habits);
  if (e.target.checked) awardPoints(2);
}
function resetTodayHabits() {
  const t = todayISO();
  habits[t] = {};
  set(STORAGE_KEYS.habits, habits);
  initHabitsForToday();
}

// --- Mood
function saveMood() {
  const mood = el.moodSelect.value;
  const reflection = el.reflection.value.trim();
  if (!mood && !reflection) return toast('Pick a mood or write a reflection.');
  const entry = { dateISO: todayISO(), mood, reflection };
  // Replace existing for today
  const idx = moods.findIndex(m => m.dateISO === entry.dateISO);
  if (idx >= 0) moods[idx] = entry; else moods.push(entry);
  set(STORAGE_KEYS.mood, moods);
  awardPoints(1);
  renderMoods();
  el.reflection.value = '';
  toast('Saved.');
}

// --- Rendering
function renderSessions() {
  el.sessionsTbody.innerHTML = '';
  const sorted = [...sessions].sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
  for (const s of sorted.slice(0, 100)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${isoToDisplay(s.dateISO)}</td>
      <td>${escapeHTML(s.title)}</td>
      <td>${s.minutes}</td>
      <td>${s.tags.join(', ')}</td>
    `;
    el.sessionsTbody.appendChild(tr);
  }
}

function renderStats() {
  const t = todayISO();
  const todayTotal = sessions.filter(s => s.dateISO === t).reduce((acc, s) => acc + s.minutes, 0);
  const weekStart = startOfWeekISO();
  const weekTotal = sessions.filter(s => s.dateISO >= weekStart).reduce((acc, s) => acc + s.minutes, 0);

  el.todayMins.textContent = todayTotal;
  el.weekMins.textContent = weekTotal;
  el.streakDays.textContent = streak;
  el.points.textContent = points;
  el.level.textContent = levelFromPoints(points);
}

function renderMoods() {
  el.moodList.innerHTML = '';
  const sorted = [...moods].sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
  for (const m of sorted.slice(0, 30)) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${isoToDisplay(m.dateISO)}:</strong> ${escapeHTML(m.mood || '—')} — ${escapeHTML(m.reflection || '')}`;
    el.moodList.appendChild(li);
  }
}

// --- Charts
let dailyChart, tagChart;

function renderCharts() {
  const mapDay = aggregateDailyMinutes(14); // last 14 days
  const labels = Object.keys(mapDay);
  const data = Object.values(mapDay);

  if (dailyChart) dailyChart.destroy();
  dailyChart = new Chart(document.getElementById('dailyChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Minutes per day', data, backgroundColor: '#6ee7b7' }]
    },
    options: { scales: { y: { beginAtZero: true } } }
  });

  const tagAgg = aggregateTags(10); // top 10 tags
  const tagLabels = Object.keys(tagAgg);
  const tagData = Object.values(tagAgg);

  if (tagChart) tagChart.destroy();
  tagChart = new Chart(document.getElementById('tagChart'), {
    type: 'doughnut',
    data: {
      labels: tagLabels,
      datasets: [{ data: tagData, backgroundColor: ['#93c5fd','#86efac','#fca5a5','#fde68a','#c4b5fd','#67e8f9','#f9a8d4'] }]
    },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
}

// --- CSV export
function exportCSV() {
  const rows = [
    ['date', 'title', 'minutes', 'tags'],
    ...sessions.map(s => [s.dateISO, s.title, String(s.minutes), s.tags.join('|')])
  ];
  const csv = rows.map(r => r.map(escapeCSV).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tech-life-sessions-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Utilities
function startOfWeekISO() {
  const d = new Date();
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday-start
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}
function aggregateDailyMinutes(daysBack = 7) {
  const out = {};
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out[isoToDisplay(iso)] = sessions.filter(s => s.dateISO === iso).reduce((a, s) => a + s.minutes, 0);
  }
  return out;
}
function aggregateTags(limit = 8) {
  const map = {};
  for (const s of sessions) {
    for (const t of s.tags) {
      map[t] = (map[t] || 0) + s.minutes;
    }
  }
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit);
  return Object.fromEntries(sorted);
}
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function escapeCSV(str) {
  const s = String(str);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toast(msg) {
  console.log('[toast]', msg);
}

// --- Events
el.startTimer.addEventListener('click', startTimer);
el.pauseTimer.addEventListener('click', pauseTimer);
el.resetTimer.addEventListener('click', resetTimer);
el.logSession.addEventListener('click', logSession);
el.exportCsv.addEventListener('click', exportCSV);
el.habits.forEach(h => h.addEventListener('change', toggleHabit));
el.resetHabits.addEventListener('click', resetTodayHabits);
el.saveMood.addEventListener('click', saveMood);

// --- Boot
resetTimer();
initHabitsForToday();
renderSessions();
renderStats();
renderMoods();
renderCharts();
