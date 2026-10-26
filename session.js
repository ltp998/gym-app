// Workout logging, rest timer and the Progress tab.
// Uses the globals from app.js (state, save, render, app, title, esc, program).

let restTicker = null;
const CARDIO_TYPES = ["Treadmill", "Bike", "Stairs", "Rowing", "Elliptical", "Other"];
let audioCtx = null;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return `${DAY_NAMES[(d.getDay() + 6) % 7]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}

function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

// ---------- Start / finish ----------

function startWorkout(workoutId) {
  const w = program().workouts.find(x => x.id === workoutId);
  state.active = {
    workoutId: w.id,
    name: w.name,
    started: Date.now(),
    exercises: w.exercises.map(ex => {
      const sug = suggestion(ex, state.history);
      return {
        ...ex,
        tip: sug.text,
        last: sug.last ? sug.last.sets.map(s => s.kg ? `${s.kg}×${s.reps}` : `${s.reps}`).join(", ") : "",
        log: Array.from({ length: ex.sets }, () => ({ kg: sug.kg ?? "", reps: "", done: false })),
      };
    }),
  };
  state.restEnd = null;
  save();
  render();
}

function finishWorkout() {
  const a = state.active;
  const entry = {
    date: todayISO(),
    workoutId: a.workoutId,
    name: a.name,
    minutes: Math.max(1, Math.round((Date.now() - a.started) / 60000)),
    exercises: a.exercises.map(ex => ({
      name: ex.name,
      pattern: ex.pattern,
      sets: ex.log.filter(s => s.done).map(s => ({ kg: Number(s.kg) || 0, reps: Number(s.reps) || 0 })),
    })).filter(ex => ex.sets.length),
  };
  const c = a.cardio || {};
  if (Number(c.min) > 0) entry.cardio = { type: c.type || "Cardio", min: Number(c.min), km: Number(c.km) || 0 };
  const hasData = entry.exercises.length || entry.cardio;
  if (!hasData) {
    if (!confirm("No sets are ticked off. End the workout without saving?")) return;
  } else {
    state.history.push(entry);
  }
  state.active = null;
  state.restEnd = null;
  save();
  render();
  if (hasData) showSummary(entry);
}

function showSummary(entry) {
  const sets = entry.exercises.reduce((n, e) => n + e.sets.length, 0);
  const wrap = document.createElement("div");
  wrap.className = "sheet-backdrop";
  wrap.innerHTML = `<div class="sheet">
    <div class="eyebrow">Workout saved</div>
    <h2>${esc(entry.name)} done</h2>
    <div class="stats">
      <div class="stat"><b>${sets}</b><span>sets</span></div>
      <div class="stat"><b>${entry.minutes} min</b><span>time</span></div>
      <div class="stat"><b>${sessionVolume(entry).toLocaleString("en")} kg</b><span>total lifted</span></div>
      ${entry.cardio ? `<div class="stat"><b>${entry.cardio.min} min</b><span>${esc(entry.cardio.type.toLowerCase())}${entry.cardio.km ? ` · ${entry.cardio.km} km` : ""}</span></div>` : ""}
      <div class="stat"><b>${state.history.length}</b><span>workouts so far</span></div>
    </div>
    <button class="btn" data-close>Nice</button>
  </div>`;
  wrap.addEventListener("click", e => {
    if (e.target === wrap || e.target.hasAttribute("data-close")) wrap.remove();
  });
  document.body.appendChild(wrap);
}

// ---------- Session screen ----------

function renderSession() {
  const a = state.active;
  title.textContent = a.name;
  app.innerHTML = `
    <div class="eyebrow">In progress · <span id="elapsed">${fmtClock((Date.now() - a.started) / 1000)}</span></div>
    ${a.exercises.map((ex, i) => `
      <div class="card">
        <div class="ex-head">
          <h3>${esc(ex.name)}</h3>
          <span class="muted small">${ex.sets} × ${esc(ex.reps)}</span>
        </div>
        <button class="link swap-now" data-swap="${i}">Machine busy? Swap for today</button>
        ${ex.last ? `<div class="muted small">Last time: ${esc(ex.last)}</div>` : ""}
        <div class="tip small">${esc(ex.tip)}</div>
        <div class="set-row set-head"><span>Set</span><span>kg</span><span>${ex.pattern === "core" ? "sec" : "reps"}</span><span></span></div>
        ${ex.log.map((s, j) => `
          <div class="set-row ${s.done ? "done" : ""}">
            <span class="set-n">${j + 1}</span>
            <input type="number" inputmode="decimal" step="0.5" value="${esc(s.kg)}" data-ex="${i}" data-set="${j}" data-field="kg" placeholder="–">
            <input type="number" inputmode="numeric" value="${esc(s.reps)}" data-ex="${i}" data-set="${j}" data-field="reps" placeholder="${topReps(ex.reps)}">
            <button class="check" data-ex="${i}" data-set="${j}" aria-label="Set done">✓</button>
          </div>`).join("")}
        <button class="link" data-add="${i}">+ Add set</button>
      </div>`).join("")}
    <div class="card">
      <h3>Cardio</h3>
      <p class="muted small">Did any cardio before or after lifting? Leave empty if not.</p>
      ${chips("cardioType", CARDIO_TYPES.map(t => [t, t]), (a.cardio || {}).type || "")}
      <div class="row">
        <div><label for="c-min">Minutes</label><input id="c-min" type="number" inputmode="numeric" value="${esc((a.cardio || {}).min || "")}" placeholder="0"></div>
        <div><label for="c-km">Distance (km, optional)</label><input id="c-km" type="number" inputmode="decimal" step="0.1" value="${esc((a.cardio || {}).km || "")}" placeholder="–"></div>
      </div>
    </div>
    <button class="btn" id="finish">Finish workout</button>
    <button class="btn danger" id="discard">Cancel workout</button>
    <div style="height:70px"></div>`;

  app.querySelectorAll("input[data-field]").forEach(inp => inp.oninput = () => {
    const s = a.exercises[inp.dataset.ex].log[inp.dataset.set];
    s[inp.dataset.field] = inp.value;
    // A new weight on set 1 carries over to the empty sets below it.
    if (inp.dataset.field === "kg") {
      a.exercises[inp.dataset.ex].log.slice(Number(inp.dataset.set) + 1).forEach((next, k) => {
        if (!next.done) {
          next.kg = inp.value;
          const el = app.querySelector(`input[data-ex="${inp.dataset.ex}"][data-set="${Number(inp.dataset.set) + 1 + k}"][data-field="kg"]`);
          if (el) el.value = inp.value;
        }
      });
    }
    save();
  });

  app.querySelectorAll(".check").forEach(b => b.onclick = () => {
    const ex = a.exercises[b.dataset.ex];
    const s = ex.log[b.dataset.set];
    s.done = !s.done;
    if (s.done && s.reps === "") s.reps = String(topReps(ex.reps));
    if (s.done) startRest(ex.rest);
    save();
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });

  app.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
    const log = a.exercises[b.dataset.add].log;
    const prev = log[log.length - 1];
    log.push({ kg: prev ? prev.kg : "", reps: "", done: false });
    save();
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });

  app.querySelectorAll("[data-swap]").forEach(b => b.onclick = () => openSessionSwap(Number(b.dataset.swap)));
  const cardio = () => (a.cardio = a.cardio || {});
  app.querySelector('[data-chips="cardioType"]').addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (!b) return;
    cardio().type = b.dataset.value;
    app.querySelectorAll('[data-chips="cardioType"] .chip').forEach(c => c.setAttribute("aria-pressed", c === b));
    save();
  });
  document.getElementById("c-min").oninput = e => { cardio().min = e.target.value; save(); };
  document.getElementById("c-km").oninput = e => { cardio().km = e.target.value; save(); };
  document.getElementById("finish").onclick = finishWorkout;
  document.getElementById("discard").onclick = () => {
    if (!confirm("Cancel this workout? Nothing from it will be saved.")) return;
    state.active = null;
    state.restEnd = null;
    save();
    render();
  };
  updateRestBar();
}

// ---------- Rest timer ----------

function startRest(seconds) {
  // iOS only plays sound from an AudioContext created during a tap.
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  state.restEnd = Date.now() + seconds * 1000;
  save();
}

function beep() {
  if (!audioCtx) return;
  for (const t of [0, 0.25]) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.2;
    o.connect(g).connect(audioCtx.destination);
    o.start(audioCtx.currentTime + t);
    o.stop(audioCtx.currentTime + t + 0.15);
  }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function updateRestBar() {
  let bar = document.getElementById("restbar");
  const show = state.active && tab === "today";
  if (!show) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "restbar";
    bar.className = "restbar";
    bar.innerHTML = `<span id="rest-label"></span><span class="rest-actions"><button id="rest-add">+30 s</button><button id="rest-skip">Skip</button></span>`;
    document.body.appendChild(bar);
    bar.querySelector("#rest-add").onclick = () => { state.restEnd = Math.max(Date.now(), state.restEnd || 0) + 30000; save(); updateRestBar(); };
    bar.querySelector("#rest-skip").onclick = () => { state.restEnd = null; save(); updateRestBar(); };
  }
  const left = state.restEnd ? (state.restEnd - Date.now()) / 1000 : null;
  const label = bar.querySelector("#rest-label");
  if (left !== null && left > 0) {
    bar.classList.add("resting");
    label.textContent = `Rest ${fmtClock(left)}`;
  } else {
    if (left !== null) { // just ran out
      state.restEnd = null;
      save();
      beep();
    }
    bar.classList.remove("resting");
    label.textContent = "Tick ✓ after each set to start the rest timer";
  }
  const el = document.getElementById("elapsed");
  if (el) el.textContent = fmtClock((Date.now() - state.active.started) / 1000);
}

restTicker = setInterval(updateRestBar, 500);

// ---------- Progress tab ----------

function sparkline(values) {
  if (values.length < 2) return "";
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`).join(" ");
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function renderProgress() {
  title.textContent = "Progress";
  const h = state.history;

  // Monday of this week, for the weekly count.
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIndex());
  const weekEntries = h.filter(e => new Date(e.date + "T12:00:00") >= monday);
  const thisWeek = weekEntries.filter(e => e.exercises.length).length;
  const cardioWeek = weekEntries.reduce((m, e) => m + (e.cardio ? e.cardio.min : 0), 0);
  const outdoorWeek = weekEntries.filter(e => e.outdoor);
  const kmWeek = Math.round(outdoorWeek.reduce((m, e) => m + (e.outdoor.km || 0), 0) * 10) / 10;
  const elevWeek = outdoorWeek.reduce((m, e) => m + (e.outdoor.elev || 0), 0);

  // Heaviest set per session for each exercise, oldest first.
  const byName = {};
  for (const e of h) {
    for (const ex of e.exercises) {
      const top = Math.max(...ex.sets.map(s => s.kg || 0));
      const best = ex.sets.reduce((b, s) => (s.kg > b.kg || (s.kg === b.kg && s.reps > b.reps) ? s : b), { kg: 0, reps: 0 });
      (byName[ex.name] = byName[ex.name] || { points: [], best: { kg: 0, reps: 0 } }).points.push(top);
      const b = byName[ex.name].best;
      if (best.kg > b.kg || (best.kg === b.kg && best.reps > b.reps)) byName[ex.name].best = best;
    }
  }
  const weights = state.weights;

  app.innerHTML = `
    <div class="card">
      <div class="stats">
        <div class="stat"><b>${thisWeek} / ${state.profile.trainDays.length}</b><span>workouts this week</span></div>
        <div class="stat"><b>${cardioWeek} min</b><span>gym cardio this week</span></div>
        <div class="stat"><b>${kmWeek} km</b><span>outdoors this week</span></div>
        <div class="stat"><b>${elevWeek} m</b><span>climbed this week</span></div>
      </div>
      <button class="btn secondary" id="log-outdoor">+ Log hike or outdoor cardio</button>
    </div>
    <div class="card">
      <h3>Body weight</h3>
      <div class="inline-form">
        <input id="bw" type="number" inputmode="decimal" step="0.1" placeholder="${state.profile.weightKg}">
        <button class="btn small-btn" id="bw-save">Log kg</button>
      </div>
      ${weights.length ? `<p class="muted small">Latest ${weights[weights.length - 1].kg} kg on ${fmtDate(weights[weights.length - 1].date)}${weights.length > 1 ? ` · ${(weights[weights.length - 1].kg - weights[0].kg >= 0 ? "+" : "")}${(weights[weights.length - 1].kg - weights[0].kg).toFixed(1)} kg since ${fmtDate(weights[0].date)}` : ""}</p>` : `<p class="muted small">Weigh yourself in the morning, once a week, for a fair comparison.</p>`}
      ${sparkline(weights.map(w => w.kg))}
    </div>
    <div class="card">
      <h3>Lifts</h3>
      ${Object.keys(byName).length ? Object.entries(byName).map(([name, d]) => `
        <div class="lift">
          <div><div class="name">${esc(name)}</div><div class="muted small">Best ${d.best.kg ? `${d.best.kg} kg × ${d.best.reps}` : `${d.best.reps}`} · ${d.points.length} ${d.points.length === 1 ? "session" : "sessions"}</div></div>
          ${sparkline(d.points)}
        </div>`).join("") : `<p class="muted small">Finish your first workout and your lifts show up here.</p>`}
    </div>
    <div class="card">
      <h3>Recent activity</h3>
      ${h.length ? `<p class="muted small">Tap an entry to fix a typo or delete it.</p>` + h.map((e, i) => ({ e, i })).slice(-20).reverse().map(({ e, i }) => `
        <button class="lift entry" data-entry="${i}">
          <div><div class="name">${esc(e.name)}</div><div class="muted small">${fmtDate(e.date)} · ${entrySummary(e)}</div></div>
          <b>${e.outdoor ? `${e.outdoor.km || 0} km` : `${sessionVolume(e).toLocaleString("en")} kg`}</b>
        </button>`).join("") : `<p class="muted small">No workouts yet.</p>`}
    </div>`;

  document.getElementById("log-outdoor").onclick = () => openOutdoor();
  app.querySelectorAll("[data-entry]").forEach(b => b.onclick = () => openEntryEditor(Number(b.dataset.entry)));

  document.getElementById("bw-save").onclick = () => {
    const kg = Number(document.getElementById("bw").value);
    if (!(kg >= 35 && kg <= 250)) return;
    const date = todayISO();
    state.weights = state.weights.filter(w => w.date !== date);
    state.weights.push({ date, kg });
    state.profile.weightKg = kg; // keeps BMI and protein up to date
    save();
    render();
  };
}

// ---------- History entries: summary, outdoor log, editing ----------

const OUTDOOR_TYPES = ["Hike", "Run", "Bike", "Walk"];

function entrySummary(e) {
  if (e.outdoor) {
    const o = e.outdoor;
    return [`${o.min} min`, o.elev ? `${o.elev} m up` : ""].filter(Boolean).join(" · ");
  }
  const sets = e.exercises.reduce((n, x) => n + x.sets.length, 0);
  return `${e.minutes} min · ${sets} sets${e.cardio ? ` · ${e.cardio.min} min ${esc(e.cardio.type.toLowerCase())}` : ""}`;
}

function openSheet(html, bind) {
  const wrap = document.createElement("div");
  wrap.className = "sheet-backdrop";
  wrap.innerHTML = `<div class="sheet">${html}</div>`;
  wrap.addEventListener("click", e => {
    if (e.target === wrap || e.target.hasAttribute("data-close")) wrap.remove();
  });
  document.body.appendChild(wrap);
  bind(wrap);
  return wrap;
}

function bindChipGroup(root, name, onPick) {
  const g = root.querySelector(`[data-chips="${name}"]`);
  g.addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (!b) return;
    g.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === b));
    onPick(b.dataset.value);
  });
}

// Swap one exercise in the running session only (for example when the machine is taken).
function openSessionSwap(i) {
  const ex = state.active.exercises[i];
  openSheet(`
    <h3>Swap ${esc(ex.name)}</h3>
    <p class="muted small">Only for this workout. To change it for good, use Swap exercise in the Program tab.</p>
    ${PATTERNS[ex.pattern].options.filter(o => o !== ex.name).map(o => `<button class="option" data-name="${esc(o)}">${esc(o)}</button>`).join("")}
    <button class="btn secondary" data-close>Cancel</button>`, wrap => {
    wrap.querySelectorAll("[data-name]").forEach(b => b.onclick = () => {
      ex.name = b.dataset.name;
      const sug = suggestion(ex, state.history);
      ex.tip = sug.text;
      ex.last = sug.last ? sug.last.sets.map(s => s.kg ? `${s.kg}×${s.reps}` : `${s.reps}`).join(", ") : "";
      ex.log.forEach(s => { if (!s.done) s.kg = sug.kg ?? ""; });
      save();
      wrap.remove();
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    });
  });
}

// Log a hike or other outdoor cardio as its own history entry.
function openOutdoor() {
  const o = { type: "Hike" };
  openSheet(`
    <h3>Log outdoor activity</h3>
    ${chips("outType", OUTDOOR_TYPES.map(t => [t, t]), o.type)}
    <div class="row">
      <div><label for="o-min">Minutes</label><input id="o-min" type="number" inputmode="numeric" placeholder="120"></div>
      <div><label for="o-km">Distance (km)</label><input id="o-km" type="number" inputmode="decimal" step="0.1" placeholder="8"></div>
    </div>
    <div class="row">
      <div><label for="o-elev">Climbed (m)</label><input id="o-elev" type="number" inputmode="numeric" placeholder="600"></div>
      <div><label for="o-date">Date</label><input id="o-date" type="date" value="${todayISO()}"></div>
    </div>
    <p class="muted small" id="o-err"></p>
    <button class="btn" id="o-save">Save</button>
    <button class="btn secondary" data-close>Cancel</button>`, wrap => {
    bindChipGroup(wrap, "outType", v => (o.type = v));
    wrap.querySelector("#o-save").onclick = () => {
      const min = Number(wrap.querySelector("#o-min").value);
      if (!(min > 0)) return (wrap.querySelector("#o-err").textContent = "Enter how many minutes it took.");
      const entry = {
        date: wrap.querySelector("#o-date").value || todayISO(),
        name: o.type,
        minutes: min,
        exercises: [],
        outdoor: { type: o.type, min, km: Number(wrap.querySelector("#o-km").value) || 0, elev: Number(wrap.querySelector("#o-elev").value) || 0 },
      };
      state.history.push(entry);
      state.history.sort((x, y) => x.date.localeCompare(y.date)); // keep history in date order
      save();
      wrap.remove();
      render();
    };
  });
}

// Fix or delete a past entry.
function openEntryEditor(idx) {
  const e = structuredClone(state.history[idx]);
  const num = (v) => (v === 0 || v ? v : "");
  let body;
  if (e.outdoor) {
    body = `
      <div class="row">
        <div><label>Minutes</label><input data-f="min" type="number" inputmode="numeric" value="${num(e.outdoor.min)}"></div>
        <div><label>Distance (km)</label><input data-f="km" type="number" inputmode="decimal" step="0.1" value="${num(e.outdoor.km)}"></div>
      </div>
      <label>Climbed (m)</label><input data-f="elev" type="number" inputmode="numeric" value="${num(e.outdoor.elev)}">`;
  } else {
    body = e.exercises.map((ex, i) => `
      <div class="edit-ex">
        <div class="name">${esc(ex.name)}</div>
        ${ex.sets.map((s, j) => `
          <div class="set-row">
            <span class="set-n">${j + 1}</span>
            <input type="number" inputmode="decimal" step="0.5" value="${num(s.kg)}" data-ex="${i}" data-set="${j}" data-k="kg" placeholder="kg">
            <input type="number" inputmode="numeric" value="${num(s.reps)}" data-ex="${i}" data-set="${j}" data-k="reps" placeholder="reps">
            <button class="check del" data-del="${i}-${j}" aria-label="Remove set">✕</button>
          </div>`).join("")}
      </div>`).join("") + (e.cardio ? `
      <div class="row">
        <div><label>${esc(e.cardio.type)} (min)</label><input data-c="min" type="number" inputmode="numeric" value="${num(e.cardio.min)}"></div>
        <div><label>Distance (km)</label><input data-c="km" type="number" inputmode="decimal" step="0.1" value="${num(e.cardio.km)}"></div>
      </div>` : "");
  }
  openSheet(`
    <div class="eyebrow">${fmtDate(e.date)}</div>
    <h3>Edit ${esc(e.name)}</h3>
    <label>Date</label><input id="e-date" type="date" value="${e.date}">
    ${body}
    <button class="btn" id="e-save">Save changes</button>
    <button class="btn danger" id="e-delete">Delete this entry</button>
    <button class="btn secondary" data-close>Cancel</button>`, wrap => {
    const removed = new Set();
    wrap.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      removed.add(b.dataset.del);
      b.closest(".set-row").remove();
    });
    wrap.querySelector("#e-save").onclick = () => {
      e.date = wrap.querySelector("#e-date").value || e.date;
      if (e.outdoor) {
        wrap.querySelectorAll("[data-f]").forEach(inp => (e.outdoor[inp.dataset.f] = Number(inp.value) || 0));
        e.minutes = e.outdoor.min;
      } else {
        wrap.querySelectorAll("[data-k]").forEach(inp => (e.exercises[inp.dataset.ex].sets[inp.dataset.set][inp.dataset.k] = Number(inp.value) || 0));
        e.exercises.forEach((ex, i) => (ex.sets = ex.sets.filter((_, j) => !removed.has(`${i}-${j}`))));
        e.exercises = e.exercises.filter(ex => ex.sets.length);
        if (e.cardio) {
          wrap.querySelectorAll("[data-c]").forEach(inp => (e.cardio[inp.dataset.c] = Number(inp.value) || 0));
          if (!e.cardio.min) delete e.cardio;
        }
      }
      state.history[idx] = e;
      if (!e.outdoor && !e.exercises.length && !e.cardio) state.history.splice(idx, 1); // nothing left
      state.history.sort((x, y) => x.date.localeCompare(y.date));
      save();
      wrap.remove();
      render();
    };
    wrap.querySelector("#e-delete").onclick = () => {
      if (!confirm(`Delete ${e.name} from ${fmtDate(e.date)}?`)) return;
      state.history.splice(idx, 1);
      save();
      wrap.remove();
      render();
    };
  });
}
