// Workout logging, rest timer and the Progress tab.
// Uses the globals from app.js (state, save, render, app, title, esc, program).

let restTicker = null;
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
  if (!entry.exercises.length) {
    if (!confirm("No sets are ticked off. End the workout without saving?")) return;
  } else {
    state.history.push(entry);
  }
  state.active = null;
  state.restEnd = null;
  save();
  render();
  if (entry.exercises.length) showSummary(entry);
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
  const thisWeek = h.filter(e => new Date(e.date + "T12:00:00") >= monday).length;

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
        <div class="stat"><b>${h.length}</b><span>workouts in total</span></div>
      </div>
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
      <h3>Recent workouts</h3>
      ${h.length ? h.slice(-10).reverse().map(e => `
        <div class="lift">
          <div><div class="name">${esc(e.name)}</div><div class="muted small">${fmtDate(e.date)} · ${e.minutes} min · ${e.exercises.reduce((n, x) => n + x.sets.length, 0)} sets</div></div>
          <b>${sessionVolume(e).toLocaleString("en")} kg</b>
        </div>`).join("") : `<p class="muted small">No workouts yet.</p>`}
    </div>`;

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
