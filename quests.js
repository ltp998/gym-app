// XP, levels, weekly quests, streaks, personal records and badges.
// Everything is computed from the saved history, so editing or deleting an entry updates it too.

const XP = { workout: 100, perSet: 5, perCardioMin: 1, perClimb10m: 1, pr: 50, quest: 150 };

const LEVEL_TITLES = ["Rookie", "Regular", "Grinder", "Iron", "Steel", "Machine", "Beast", "Titan", "Legend"];

// Level n starts at 250·n·(n−1) XP: 0, 500, 1500, 3000, 5000, ... A full week is roughly 600–900 XP.
function levelFromXp(xp) {
  let n = 1;
  while (250 * (n + 1) * n <= xp) n++;
  const start = 250 * n * (n - 1), next = 250 * (n + 1) * n;
  return { level: n, title: LEVEL_TITLES[Math.min(n - 1, LEVEL_TITLES.length - 1)], into: xp - start, span: next - start };
}

function mondayOf(iso) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Rotating quests; two are picked per week from the week's date so they change every Monday.
const QUEST_POOL = [
  { id: "cardio30", text: "Do 30 min of cardio", goal: 30, unit: "min", value: w => w.cardioMin },
  { id: "climb500", text: "Climb 500 m outdoors", goal: 500, unit: "m", value: w => w.climb },
  { id: "pr", text: "Set a personal record", goal: 1, unit: "", value: w => w.prs },
  { id: "weigh", text: "Log your body weight", goal: 1, unit: "", value: w => w.weighIns },
  { id: "sets50", text: "Finish 50 sets", goal: 50, unit: "sets", value: w => w.sets },
  { id: "outdoor", text: "Get outside: one hike, run, ride or walk", goal: 1, unit: "", value: w => w.outdoor },
];

function questsForWeek(monday, gymGoal) {
  const n = Math.floor(new Date(monday + "T12:00:00").getTime() / (7 * 86400000));
  const a = QUEST_POOL[n % QUEST_POOL.length];
  const b = QUEST_POOL[(n + 2) % QUEST_POOL.length];
  return [
    { id: "gym", text: `Train ${gymGoal} times in the gym`, goal: gymGoal, unit: "", value: w => w.gym },
    a,
    b,
  ];
}

const BADGES = [
  { id: "first", icon: "🏁", name: "First workout", test: s => s.workouts >= 1 },
  { id: "w10", icon: "💪", name: "10 workouts", test: s => s.workouts >= 10 },
  { id: "w25", icon: "🏋️", name: "25 workouts", test: s => s.workouts >= 25 },
  { id: "w50", icon: "🥈", name: "50 workouts", test: s => s.workouts >= 50 },
  { id: "w100", icon: "🥇", name: "100 workouts", test: s => s.workouts >= 100 },
  { id: "pr1", icon: "📈", name: "First personal record", test: s => s.prs >= 1 },
  { id: "pr10", icon: "🚀", name: "10 personal records", test: s => s.prs >= 10 },
  { id: "pr50", icon: "🏆", name: "50 personal records", test: s => s.prs >= 50 },
  { id: "hike1", icon: "🥾", name: "First hike", test: s => s.hikes >= 1 },
  { id: "climb1k", icon: "⛰️", name: "1,000 m climbed", test: s => s.climb >= 1000 },
  { id: "climb5k", icon: "🏔️", name: "5,000 m climbed", test: s => s.climb >= 5000 },
  { id: "km100", icon: "🧭", name: "100 km outdoors", test: s => s.outdoorKm >= 100 },
  { id: "streak4", icon: "🔥", name: "4-week streak", test: s => s.bestStreak >= 4 },
  { id: "streak12", icon: "☄️", name: "12-week streak", test: s => s.bestStreak >= 12 },
  { id: "ton", icon: "🐘", name: "10,000 kg in one workout", test: s => s.maxVolume >= 10000 },
  { id: "quests10", icon: "🎯", name: "10 quests done", test: s => s.quests >= 10 },
];

// today: ISO date. Returns everything the UI needs.
function gamify(history, weights, profile, today) {
  const gymGoal = profile.trainDays.length;
  const entries = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const best = {}; // exercise name -> heaviest kg so far
  const weeks = {}; // monday -> weekly totals
  const week = m => (weeks[m] = weeks[m] || { gym: 0, cardioMin: 0, climb: 0, prs: 0, weighIns: 0, sets: 0, outdoor: 0 });
  const s = { xp: 0, workouts: 0, prs: 0, hikes: 0, climb: 0, outdoorKm: 0, maxVolume: 0, quests: 0, bestStreak: 0, prList: [] };

  for (const e of entries) {
    const w = week(mondayOf(e.date));
    if (e.exercises.length) {
      const sets = e.exercises.reduce((n, x) => n + x.sets.length, 0);
      s.workouts++;
      s.xp += XP.workout + XP.perSet * sets;
      w.gym++;
      w.sets += sets;
      let volume = 0;
      for (const ex of e.exercises) {
        const top = Math.max(...ex.sets.map(x => x.kg || 0));
        volume += ex.sets.reduce((v, x) => v + (x.kg || 0) * (x.reps || 0), 0);
        // A PR beats an earlier best; the first time doing an exercise only sets the baseline.
        if (top > 0 && best[ex.name] !== undefined && top > best[ex.name]) {
          s.prs++;
          w.prs++;
          s.xp += XP.pr;
          s.prList.push({ date: e.date, name: ex.name, kg: top });
        }
        if (top > 0) best[ex.name] = Math.max(best[ex.name] || 0, top);
      }
      s.maxVolume = Math.max(s.maxVolume, volume);
    }
    if (e.cardio) {
      s.xp += XP.perCardioMin * e.cardio.min;
      w.cardioMin += e.cardio.min;
    }
    if (e.outdoor) {
      const o = e.outdoor;
      s.xp += XP.perCardioMin * o.min + XP.perClimb10m * Math.floor((o.elev || 0) / 10);
      w.cardioMin += o.min;
      w.climb += o.elev || 0;
      w.outdoor++;
      s.climb += o.elev || 0;
      s.outdoorKm += o.km || 0;
      if (o.type === "Hike") s.hikes++;
    }
  }
  for (const wt of weights) week(mondayOf(wt.date)).weighIns++;

  // Walk every week from the first activity to this week: quests and streaks.
  const thisMonday = mondayOf(today);
  const first = Object.keys(weeks).sort()[0] || thisMonday;
  let streak = 0;
  for (let m = first; m <= thisMonday; m = addDays(m, 7)) {
    const w = week(m);
    for (const q of questsForWeek(m, gymGoal)) {
      if (q.value(w) >= q.goal) { s.quests++; s.xp += XP.quest; }
    }
    if (w.gym >= gymGoal) streak++;
    else if (m !== thisMonday) streak = 0; // the current week can still be completed
    s.bestStreak = Math.max(s.bestStreak, streak);
  }

  const cur = week(thisMonday);
  const quests = questsForWeek(thisMonday, gymGoal).map(q => ({
    id: q.id, text: q.text, goal: q.goal, unit: q.unit,
    value: Math.min(q.value(cur), q.goal), done: q.value(cur) >= q.goal,
  }));

  return {
    xp: s.xp,
    ...levelFromXp(s.xp),
    streak,
    quests,
    stats: s,
    prList: s.prList,
    badges: BADGES.map(b => ({ id: b.id, icon: b.icon, name: b.name, earned: b.test(s) })),
  };
}

if (typeof module !== "undefined") module.exports = { gamify, levelFromXp, mondayOf, questsForWeek };
