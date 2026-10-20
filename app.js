// UI for the gym app. State lives in localStorage on the phone.

const STORE_KEY = "gymapp.v1";
const app = document.getElementById("app");
const tabbar = document.getElementById("tabbar");
const title = document.getElementById("screen-title");

const GOALS = [
  ["muscle", "Build muscle"],
  ["strength", "Get stronger"],
  ["fatloss", "Lose fat"],
  ["general", "General fitness"],
];
const LEVEL_LABELS = [
  ["new", "New to the gym"],
  ["returning", "Getting back into it"],
  ["experienced", "Training regularly"],
];

let state = load();
let tab = "today";
let draft = null; // profile being edited during setup
let setupStep = 0;
let selectedDay = todayIndex(); // weekday shown under the week strip
const DAY_NAMES_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function emptyState() {
  return { profile: null, swaps: {}, history: [], weights: [], active: null, restEnd: null };
}

function load() {
  try {
    return { ...emptyState(), ...JSON.parse(localStorage.getItem(STORE_KEY)) };
  } catch {
    return emptyState();
  }
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Monday = 0 ... Sunday = 6
function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

function program() {
  const p = buildProgram(state.profile);
  for (const w of p.workouts) {
    for (const ex of w.exercises) {
      if (state.swaps[ex.key]) ex.name = state.swaps[ex.key];
    }
  }
  return p;
}

function render() {
  if (!state.profile || draft) {
    tabbar.hidden = true;
    renderSetup();
    return;
  }
  tabbar.hidden = false;
  for (const b of tabbar.querySelectorAll(".tab")) b.classList.toggle("active", b.dataset.tab === tab);
  if (tab === "today") state.active ? renderSession() : renderToday();
  if (tab === "program") renderProgram();
  if (tab === "progress") renderProgress();
  if (tab === "profile") renderProfile();
  updateRestBar();
  window.scrollTo(0, 0);
}

// ---------- Setup ----------

function startSetup(fromProfile) {
  draft = fromProfile
    ? { split: "auto", ...structuredClone(fromProfile) }
    : { name: "", age: "", heightCm: "", weightKg: "", goal: "muscle", level: "returning", split: "auto", trainDays: [0, 2, 4], sessionMin: 60, hikeDays: [6] };
  setupStep = 0;
  render();
}

function chips(name, options, selected, multi) {
  return `<div class="chips" data-chips="${name}" data-multi="${multi ? 1 : 0}">` +
    options.map(([v, label]) => {
      const on = multi ? selected.includes(v) : selected === v;
      return `<button type="button" class="chip" data-value="${v}" aria-pressed="${on}">${esc(label)}</button>`;
    }).join("") + `</div>`;
}

function renderSetup() {
  const d = draft;
  title.textContent = state.profile ? "Edit profile" : "Welcome";
  const bar = `<div class="steps">${[0, 1, 2].map(i => `<i class="${i <= setupStep ? "on" : ""}"></i>`).join("")}</div>`;
  const dayOpts = DAY_NAMES.map((n, i) => [i, n]);
  let body = "";

  if (setupStep === 0) {
    body = `
      <div class="card">
        <h2>About you</h2>
        <p class="muted small">Used to set up your program. It stays on this phone.</p>
        <label for="f-name">Name</label>
        <input id="f-name" value="${esc(d.name)}" autocomplete="given-name">
        <div class="row">
          <div><label for="f-age">Age</label><input id="f-age" type="number" inputmode="numeric" value="${esc(d.age)}"></div>
          <div><label for="f-h">Height (cm)</label><input id="f-h" type="number" inputmode="decimal" value="${esc(d.heightCm)}"></div>
        </div>
        <label for="f-w">Weight (kg)</label>
        <input id="f-w" type="number" inputmode="decimal" value="${esc(d.weightKg)}">
      </div>`;
  } else if (setupStep === 1) {
    body = `
      <div class="card">
        <h2>Your goal</h2>
        <label>Main goal</label>
        ${chips("goal", GOALS, d.goal)}
        <label>Experience</label>
        ${chips("level", LEVEL_LABELS, d.level)}
      </div>`;
  } else {
    body = `
      <div class="card">
        <h2>Your week</h2>
        <label>Split</label>
        ${chips("split", Object.entries(SPLITS), d.split)}
        <label>Gym days (${d.split === "ppl_fb" ? "pick 4" : "pick 2 to 5"})</label>
        ${chips("trainDays", dayOpts, d.trainDays, true)}
        <label>Time per session</label>
        ${chips("sessionMin", [[45, "45 min"], [60, "60 min"], [75, "75 min"]], d.sessionMin)}
        <label>Flexible days: hike, cardio or gym (optional)</label>
        ${chips("hikeDays", dayOpts, d.hikeDays, true)}
      </div>`;
  }

  const back = setupStep > 0 || state.profile
    ? `<button class="btn secondary" id="back">${setupStep === 0 ? "Cancel" : "Back"}</button>` : "";
  app.innerHTML = `${bar}${body}<p class="muted small" id="err"></p>
    <button class="btn" id="next">${setupStep === 2 ? "Build my program" : "Next"}</button>${back}`;

  app.querySelectorAll("[data-chips]").forEach(group => {
    group.addEventListener("click", e => {
      const b = e.target.closest(".chip");
      if (!b) return;
      const key = group.dataset.chips;
      const raw = b.dataset.value;
      const v = isNaN(raw) ? raw : Number(raw);
      if (group.dataset.multi === "1") {
        const set = new Set(d[key]);
        set.has(v) ? set.delete(v) : set.add(v);
        d[key] = [...set].sort((a, b) => a - b);
      } else {
        d[key] = v;
      }
      if (key === "split") {
        // Push, Pull, Legs, rest, Full body, flexible Saturday, rest Sunday.
        if (v === "ppl_fb") { d.trainDays = [0, 1, 2, 4]; d.hikeDays = [5]; }
        return render();
      }
      group.querySelectorAll(".chip").forEach(c => {
        const cv = isNaN(c.dataset.value) ? c.dataset.value : Number(c.dataset.value);
        c.setAttribute("aria-pressed", group.dataset.multi === "1" ? d[key].includes(cv) : d[key] === cv);
      });
    });
  });

  document.getElementById("next").onclick = () => {
    const err = document.getElementById("err");
    if (setupStep === 0) {
      d.name = document.getElementById("f-name").value.trim();
      d.age = Number(document.getElementById("f-age").value);
      d.heightCm = Number(document.getElementById("f-h").value);
      d.weightKg = Number(document.getElementById("f-w").value);
      if (!(d.age >= 13 && d.age <= 99)) return (err.textContent = "Enter an age between 13 and 99.");
      if (!(d.heightCm >= 120 && d.heightCm <= 230)) return (err.textContent = "Enter your height in cm, for example 180.");
      if (!(d.weightKg >= 35 && d.weightKg <= 250)) return (err.textContent = "Enter your weight in kg, for example 80.");
    }
    if (setupStep === 2) {
      if (d.trainDays.length < 2 || d.trainDays.length > 5) return (err.textContent = "Pick between 2 and 5 gym days.");
      if (d.split === "ppl_fb" && d.trainDays.length !== 4) return (err.textContent = "Push, Pull, Legs + Full body needs 4 gym days.");
      const changedPlan = state.profile && (state.profile.trainDays.length !== d.trainDays.length || state.profile.level !== d.level || state.profile.sessionMin !== d.sessionMin || (state.profile.split || "auto") !== d.split);
      if (changedPlan) state.swaps = {}; // workouts were rebuilt, so old swaps no longer line up
      state.profile = d;
      draft = null;
      tab = "program";
      save();
      render();
      return;
    }
    setupStep++;
    render();
  };
  const backBtn = document.getElementById("back");
  if (backBtn) backBtn.onclick = () => {
    if (setupStep === 0) { draft = null; } else { setupStep--; }
    render();
  };
}

// ---------- Tabs ----------

function weekStrip(p, selected) {
  const t = todayIndex();
  const byId = Object.fromEntries(p.workouts.map(w => [w.id, w]));
  return `<div class="week">` + p.week.map(d => {
    const w = d.workoutId && byId[d.workoutId];
    const cls = ["day", w ? "train" : d.hike ? "hike" : "", d.day === selected ? "today" : ""].join(" ");
    const label = w ? w.name.replace("Full body", "FB").replace("Upper", "Up").replace("Lower", "Low") : d.hike ? "Flex" : "Rest";
    return `<button class="${cls}" data-day="${d.day}">${d.day === t ? "Today" : d.name}<b>${esc(label)}</b></button>`;
  }).join("") + `</div>`;
}

function workoutCard(w, withSwap) {
  return `<div class="card">
    <div class="eyebrow">${w.exercises.length} exercises</div>
    <h2>${esc(w.name)}</h2>
    ${w.exercises.map(ex => `
      <div class="exercise">
        <div>
          <div class="name">${esc(ex.name)}</div>
          <div class="muted small">Rest ${ex.rest >= 120 ? ex.rest / 60 + " min" : ex.rest + " s"}</div>
          ${withSwap ? `<button class="swap" data-key="${ex.key}" data-pattern="${ex.pattern}">Swap exercise</button>` : ""}
        </div>
        <div class="dose"><b>${ex.sets} × ${esc(ex.reps)}</b><span class="muted small">${ex.main ? "main lift" : "accessory"}</span></div>
      </div>`).join("")}
  </div>`;
}

// The plan for one weekday: its workout, or the flexible / rest day card.
function dayPlan(p, d, withSwap) {
  const t = todayIndex();
  const day = p.week[d];
  const byId = Object.fromEntries(p.workouts.map(w => [w.id, w]));
  const when = d === t ? `Today · ${day.name}` : DAY_NAMES_LONG[d];

  // On the Today tab each workout gets a start button; the Program tab is for planning and swaps.
  const start = (id, label) => withSwap ? "" : `<button class="btn" data-start="${id}">${label}</button>`;
  const doneToday = d === t && state.history.some(e => e.date === todayISO());

  if (day.workoutId) {
    return `<div class="eyebrow">${when}${doneToday ? " · done ✓" : ""}</div>` + workoutCard(byId[day.workoutId], withSwap) +
      start(day.workoutId, doneToday ? "Start again" : "Start workout");
  }

  if (day.hike) {
    // Optional gym session is the full-body workout, or the first one if there is none.
    const optional = p.workouts.find(w => w.focus === "full") || p.workouts[0];
    return `<div class="card">
        <div class="eyebrow">${when}</div>
        <h2>Flexible day</h2>
        <p class="muted">Pick what fits the chance and how you feel:</p>
        <p><b>Hike</b><br><span class="muted small">Bring water and eat some protein afterwards.</span></p>
        <p><b>Outdoor cardio</b><br><span class="muted small">30–60 min of easy running, cycling or brisk walking. You should still be able to talk.</span></p>
        <p><b>Gym</b><br><span class="muted small">The optional session below. Go lighter if you are tired from the week.</span></p>
      </div>
      <div class="eyebrow">Optional gym${doneToday ? " · done ✓" : ""}</div>` + workoutCard(optional, withSwap) +
      start(optional.id, "Start gym session");
  }

  let next = null;
  for (let i = 1; i <= 7 && !next; i++) {
    const nd = p.week[(d + i) % 7];
    if (nd.workoutId) next = nd;
  }
  return `<div class="card">
      <div class="eyebrow">${when}</div>
      <h2>Rest day</h2>
      <p class="muted">Recovery is when you get stronger. A walk is a good idea.</p>
      <p class="muted small">Next workout: ${esc(byId[next.workoutId].name)} on ${DAY_NAMES_LONG[next.day]}.</p>
    </div>`;
}

function bindDayTaps() {
  app.querySelectorAll(".week .day").forEach(b => b.onclick = () => {
    selectedDay = Number(b.dataset.day);
    render();
  });
  app.querySelectorAll(".swap").forEach(b => b.onclick = () => openSwap(b.dataset.key, b.dataset.pattern));
  app.querySelectorAll("[data-start]").forEach(b => b.onclick = () => startWorkout(b.dataset.start));
}

function statsCard() {
  const pr = state.profile;
  const s = bodyStats(pr);
  const hours = Math.round(pr.trainDays.length * pr.sessionMin / 6) / 10;
  return `<div class="card">
      <h3>Your numbers</h3>
      <div class="stats">
        <div class="stat"><b>${s.bmi}</b><span>BMI · ${s.bmiLabel}</span></div>
        <div class="stat"><b>${s.protein} g</b><span>protein a day</span></div>
        <div class="stat"><b>${pr.trainDays.length}× · ${hours} h</b><span>gym a week</span></div>
        <div class="stat"><b>7–9 h</b><span>sleep a night</span></div>
      </div>
      <p class="muted small">Protein: 1.6 g per kg of body weight (${pr.weightKg} kg), for example about ${Math.round(s.protein / 4)} g in each of 4 meals. BMI does not account for muscle, so treat it as a rough guide. Sleep is when muscles recover.</p>
    </div>`;
}

function renderToday() {
  const p = program();
  const t = todayIndex();
  title.textContent = state.profile.name ? `Hi, ${state.profile.name}` : "Today";
  const back = selectedDay !== t ? `<button class="btn secondary" id="to-today">Back to today</button>` : "";
  app.innerHTML = `<div class="card">${weekStrip(p, selectedDay)}${back}</div>${dayPlan(p, selectedDay, false)}${statsCard()}`;
  bindDayTaps();
  const b = document.getElementById("to-today");
  if (b) b.onclick = () => { selectedDay = t; render(); };
}

function renderProgram() {
  const p = program();
  const goal = GOALS.find(g => g[0] === state.profile.goal)[1];
  title.textContent = "Program";
  app.innerHTML = `
    <div class="card">
      <div class="eyebrow">Your plan</div>
      <h2>${esc(goal)} · ${p.workouts.length} days a week</h2>
      <p class="muted small">Tap a day to see its plan.</p>
      ${weekStrip(p, selectedDay)}
    </div>
    ${dayPlan(p, selectedDay, true)}
    <div class="card">
      <h3>Tips</h3>
      ${p.notes.map(n => `<p class="note">${esc(n)}</p>`).join("")}
    </div>
    ${statsCard()}`;
  bindDayTaps();
}

function openSwap(key, pattern) {
  const wrap = document.createElement("div");
  wrap.className = "sheet-backdrop";
  wrap.innerHTML = `<div class="sheet">
    <h3>Swap exercise</h3>
    <p class="muted small">Pick a machine or variation that is free at your gym, or one that feels better.</p>
    ${PATTERNS[pattern].options.map(o => `<button class="option" data-name="${esc(o)}">${esc(o)}</button>`).join("")}
    <button class="btn secondary" data-close>Cancel</button>
  </div>`;
  wrap.addEventListener("click", e => {
    if (e.target === wrap || e.target.hasAttribute("data-close")) return wrap.remove();
    const o = e.target.closest(".option");
    if (!o) return;
    state.swaps[key] = o.dataset.name;
    save();
    wrap.remove();
    render();
  });
  document.body.appendChild(wrap);
}

function renderProfile() {
  const pr = state.profile;
  const goal = GOALS.find(g => g[0] === pr.goal)[1];
  const level = LEVEL_LABELS.find(l => l[0] === pr.level)[1];
  title.textContent = "Profile";
  app.innerHTML = `
    <div class="card">
      <h2>${esc(pr.name || "You")}</h2>
      <p class="muted">${pr.age} years · ${pr.heightCm} cm · ${pr.weightKg} kg</p>
      <p class="muted">${esc(goal)} · ${esc(level)}</p>
      <p class="muted">Gym: ${pr.trainDays.map(d => DAY_NAMES[d]).join(", ")} · ${pr.sessionMin} min</p>
      <p class="muted">Split: ${esc(SPLITS[pr.split || "auto"])}</p>
      <p class="muted">Flexible days: ${pr.hikeDays.length ? pr.hikeDays.map(d => DAY_NAMES[d]).join(", ") : "none"}</p>
      <button class="btn" id="edit">Edit profile</button>
    </div>
    <div class="card">
      <h3>Backup</h3>
      <p class="muted small">Your data lives only on this phone. Save a backup file now and then so you do not lose it.</p>
      <button class="btn secondary" id="export">Save backup</button>
      <button class="btn secondary" id="import">Restore backup</button>
      <input type="file" id="file" accept="application/json,.json" hidden>
    </div>
    <button class="btn danger" id="reset">Delete all data</button>`;

  document.getElementById("edit").onclick = () => startSetup(pr);
  document.getElementById("export").onclick = exportData;
  document.getElementById("import").onclick = () => document.getElementById("file").click();
  document.getElementById("file").onchange = importData;
  document.getElementById("reset").onclick = () => {
    if (!confirm("Delete your profile and all data on this phone?")) return;
    state = emptyState();
    save();
    startSetup(null);
  };
}

async function exportData() {
  const name = `gym-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(state, null, 2)], name, { type: "application/json" });
  // iOS: the share sheet lets you save to Files or send it to yourself.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Gym backup" }); } catch {}
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(e) {
  const f = e.target.files[0];
  if (!f) return;
  f.text().then(txt => {
    try {
      const data = JSON.parse(txt);
      if (!data.profile) throw new Error("no profile");
      state = { ...emptyState(), ...data };
      save();
      tab = "today";
      render();
    } catch {
      alert("That file is not a gym backup.");
    }
  });
}

tabbar.addEventListener("click", e => {
  const b = e.target.closest(".tab");
  if (!b) return;
  tab = b.dataset.tab;
  selectedDay = todayIndex();
  render();
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js");
}

if (state.profile) render(); else startSetup(null);
