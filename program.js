// Exercise library and program generator.
// Everything here is plain data + pure functions so it can be tested outside the UI.

const LEVELS = ["new", "returning", "experienced"];

// Each movement pattern lists options for a commercial gym. `pick` is the default per level.
const PATTERNS = {
  squat:    { main: true,  pick: { new: "Leg press", returning: "Goblet squat", experienced: "Barbell back squat" },
              options: ["Leg press", "Goblet squat", "Hack squat", "Smith machine squat", "Barbell back squat"] },
  hinge:    { main: true,  pick: { new: "Dumbbell Romanian deadlift", returning: "Dumbbell Romanian deadlift", experienced: "Barbell Romanian deadlift" },
              options: ["Dumbbell Romanian deadlift", "Barbell Romanian deadlift", "Trap bar deadlift", "Hip thrust", "45° back extension"] },
  hpush:    { main: true,  pick: { new: "Chest press machine", returning: "Dumbbell bench press", experienced: "Barbell bench press" },
              options: ["Chest press machine", "Dumbbell bench press", "Barbell bench press", "Incline dumbbell press", "Push-up"] },
  vpush:    { main: true,  pick: { new: "Shoulder press machine", returning: "Seated dumbbell shoulder press", experienced: "Standing overhead press" },
              options: ["Shoulder press machine", "Seated dumbbell shoulder press", "Standing overhead press", "Landmine press"] },
  hpull:    { main: true,  pick: { new: "Seated cable row", returning: "Chest-supported dumbbell row", experienced: "Barbell row" },
              options: ["Seated cable row", "Chest-supported dumbbell row", "Barbell row", "One-arm dumbbell row", "Row machine"] },
  vpull:    { main: true,  pick: { new: "Lat pulldown", returning: "Lat pulldown", experienced: "Pull-up" },
              options: ["Lat pulldown", "Assisted pull-up machine", "Pull-up", "Close-grip lat pulldown"] },
  lunge:    { main: false, pick: { new: "Dumbbell step-up", returning: "Dumbbell step-up", experienced: "Bulgarian split squat" },
              options: ["Dumbbell step-up", "Walking lunge", "Bulgarian split squat", "Reverse lunge"] },
  legcurl:  { main: false, pick: { new: "Seated leg curl", returning: "Seated leg curl", experienced: "Seated leg curl" },
              options: ["Seated leg curl", "Lying leg curl", "Nordic curl (assisted)"] },
  legext:   { main: false, pick: { new: "Leg extension", returning: "Leg extension", experienced: "Leg extension" },
              options: ["Leg extension", "Sissy squat (assisted)"] },
  calf:     { main: false, pick: { new: "Standing calf raise", returning: "Standing calf raise", experienced: "Standing calf raise" },
              options: ["Standing calf raise", "Seated calf raise", "Calf press on leg press"] },
  chestfly: { main: false, pick: { new: "Pec deck", returning: "Cable fly", experienced: "Cable fly" },
              options: ["Pec deck", "Cable fly", "Dumbbell fly"] },
  lateral:  { main: false, pick: { new: "Dumbbell lateral raise", returning: "Dumbbell lateral raise", experienced: "Cable lateral raise" },
              options: ["Dumbbell lateral raise", "Cable lateral raise", "Lateral raise machine"] },
  facepull: { main: false, pick: { new: "Reverse pec deck", returning: "Cable face pull", experienced: "Cable face pull" },
              options: ["Cable face pull", "Reverse pec deck", "Band pull-apart"] },
  biceps:   { main: false, pick: { new: "Cable curl", returning: "Dumbbell curl", experienced: "Dumbbell curl" },
              options: ["Dumbbell curl", "Cable curl", "Hammer curl", "EZ-bar curl"] },
  triceps:  { main: false, pick: { new: "Cable triceps pushdown", returning: "Cable triceps pushdown", experienced: "Overhead cable extension" },
              options: ["Cable triceps pushdown", "Overhead cable extension", "Dips (assisted)"] },
  core:     { main: false, pick: { new: "Dead bug", returning: "Plank", experienced: "Cable crunch" },
              options: ["Plank", "Dead bug", "Cable crunch", "Pallof press", "Hanging knee raise"] },
};

// Workout templates by training days per week. A slot can ask for a non-default option with `alt`.
const TEMPLATES = {
  2: [
    { name: "Full body A", focus: "full", slots: ["squat", "hpush", "hpull", "lunge", "lateral", "core", "calf"] },
    { name: "Full body B", focus: "full", slots: ["hinge", "vpush", "vpull", "legcurl", "biceps", "triceps", "core"] },
  ],
  3: [
    { name: "Full body A", focus: "full", slots: ["squat", "hpush", "hpull", "legcurl", "lateral", "core", "calf"] },
    { name: "Full body B", focus: "full", slots: ["hinge", "vpush", "vpull", "lunge", "biceps", "triceps", "core"] },
    { name: "Full body C", focus: "full", slots: [{ p: "squat", alt: "Leg press" }, { p: "hpush", alt: "Incline dumbbell press" }, "vpull", "legext", "facepull", "chestfly", "calf"] },
  ],
  4: [
    { name: "Upper A", focus: "upper", slots: ["hpush", "hpull", "vpush", "vpull", "lateral", "triceps", "biceps"] },
    { name: "Lower A", focus: "lower", slots: ["squat", "hinge", "legcurl", "calf", "core", "legext"] },
    { name: "Upper B", focus: "upper", slots: [{ p: "hpush", alt: "Incline dumbbell press" }, "vpull", { p: "hpull", alt: "Seated cable row" }, "vpush", "facepull", "biceps", "chestfly"] },
    { name: "Lower B", focus: "lower", slots: [{ p: "hinge", alt: "Trap bar deadlift" }, "lunge", "legext", "legcurl", "calf", "core"] },
  ],
  5: [
    { name: "Upper", focus: "upper", slots: ["hpush", "hpull", "vpush", "vpull", "lateral", "triceps", "biceps"] },
    { name: "Lower", focus: "lower", slots: ["squat", "hinge", "legcurl", "calf", "core", "legext"] },
    { name: "Push", focus: "upper", slots: [{ p: "hpush", alt: "Incline dumbbell press" }, "vpush", "chestfly", "lateral", "triceps"] },
    { name: "Pull", focus: "upper", slots: ["vpull", { p: "hpull", alt: "Seated cable row" }, "facepull", "biceps", "core"] },
    { name: "Legs", focus: "lower", slots: [{ p: "squat", alt: "Leg press" }, "lunge", "legcurl", "legext", "calf"] },
  ],
  // Push / Pull / Legs + Full body on 4 gym days.
  ppl_fb: [
    { name: "Push", focus: "upper", slots: ["hpush", "vpush", { p: "hpush", alt: "Incline dumbbell press" }, "lateral", "triceps", "chestfly", { p: "triceps", alt: "Overhead cable extension" }] },
    { name: "Pull", focus: "upper", slots: ["vpull", "hpull", "facepull", "biceps", { p: "hpull", alt: "One-arm dumbbell row" }, { p: "biceps", alt: "Hammer curl" }, "core"] },
    { name: "Legs", focus: "lower", slots: ["squat", "hinge", "lunge", "legcurl", "legext", "calf", "core"] },
    { name: "Full body", focus: "full", slots: [{ p: "squat", alt: "Leg press" }, "hpush", { p: "vpull", alt: "Close-grip lat pulldown" }, { p: "hinge", alt: "Hip thrust" }, "lateral", "core", "calf"] },
  ],
};

const SPLITS = { auto: "Auto", ppl_fb: "Push, Pull, Legs + Full body" };

// Rep ranges, sets and rest (seconds) by goal. Main = compound lifts, acc = accessories.
const DOSES = {
  strength: { main: { reps: "4–6",  rest: 180 }, acc: { reps: "8–12",  rest: 90 } },
  muscle:   { main: { reps: "6–10", rest: 120 }, acc: { reps: "10–15", rest: 75 } },
  fatloss:  { main: { reps: "8–12", rest: 90 },  acc: { reps: "12–15", rest: 60 } },
  general:  { main: { reps: "8–12", rest: 90 },  acc: { reps: "10–15", rest: 60 } },
};

const MAX_EXERCISES = { 45: 5, 60: 6, 75: 7 };
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function exerciseName(slot, level) {
  if (typeof slot === "object") return slot.alt;
  return PATTERNS[slot].pick[level];
}

function slotPattern(slot) {
  return typeof slot === "object" ? slot.p : slot;
}

function dose(pattern, profile) {
  const isMain = PATTERNS[pattern].main;
  const d = DOSES[profile.goal][isMain ? "main" : "acc"];
  let reps = d.reps;
  // Beginners and returners build technique before heavy low-rep work.
  if (profile.goal === "strength" && isMain && profile.level !== "experienced") reps = "6–8";
  if (pattern === "core") reps = "30–45 s";
  const sets = isMain && profile.level === "experienced" ? 4 : 3;
  return { sets, reps, rest: d.rest, main: isMain };
}

// Build the full program: workouts plus a weekly calendar.
function buildProgram(profile) {
  const days = Math.min(5, Math.max(2, profile.trainDays.length));
  const templates = profile.split === "ppl_fb" && days === 4 ? TEMPLATES.ppl_fb : TEMPLATES[days];
  const limit = MAX_EXERCISES[profile.sessionMin] || 6;

  const workouts = templates.map((t, i) => ({
    id: "w" + i,
    name: t.name,
    focus: t.focus,
    exercises: t.slots.slice(0, limit).map((slot, j) => {
      const pattern = slotPattern(slot);
      return { key: `w${i}-${j}`, pattern, name: exerciseName(slot, profile.level), ...dose(pattern, profile) };
    }),
  }));

  // Assign workouts to the chosen weekdays in order (0 = Monday).
  const trainDays = [...profile.trainDays].sort((a, b) => a - b).slice(0, days);
  const week = DAY_NAMES.map((name, d) => {
    const idx = trainDays.indexOf(d);
    return {
      day: d,
      name,
      workoutId: idx >= 0 ? workouts[idx].id : null,
      hike: profile.hikeDays.includes(d),
    };
  });

  return { workouts, week, notes: programNotes(profile, workouts, week) };
}

function programNotes(profile, workouts, week) {
  const notes = [];
  if (profile.level !== "experienced") {
    notes.push("Weeks 1–2 are a ramp-in: do 2 sets instead of 3 and stop each set with about 3 reps left in the tank. Use these weeks to find your working weights.");
  }
  notes.push("Add weight when you hit the top of the rep range on every set with good form. Then start again at the bottom of the range.");

  // Warn when a heavy leg day lands the day after a hike.
  const byId = Object.fromEntries(workouts.map(w => [w.id, w]));
  const lower = d => {
    const w = week[d].workoutId && byId[week[d].workoutId];
    return w && w.focus !== "upper";
  };
  for (let d = 0; d < 7; d++) {
    const next = (d + 1) % 7;
    if (week[d].hike && lower(next)) {
      notes.push(`You hike on ${week[d].name} and train legs on ${week[next].name}. If your legs feel heavy after the hike, go lighter on the leg exercises that day.`);
      break;
    }
  }
  if (profile.hikeDays.length) {
    notes.push("Flexible days: hike, do outdoor cardio, or go to the gym, depending on the chance and how you feel. Hikes count as training, and step-ups, lunges and calf raises carry over to uphill and downhill walking.");
  }
  return notes;
}

function bodyStats(profile) {
  const h = profile.heightCm / 100;
  const bmi = profile.weightKg / (h * h);
  // 1.6 g/kg/day is the point above which extra protein shows little added muscle gain (Morton et al., 2018).
  const protein = Math.round(profile.weightKg * 1.6);
  // WHO adult BMI categories.
  const bmiLabel = bmi < 18.5 ? "underweight" : bmi < 25 ? "normal" : bmi < 30 ? "overweight" : "obese";
  return { bmi: Math.round(bmi * 10) / 10, bmiLabel, protein };
}

if (typeof module !== "undefined") module.exports = { PATTERNS, TEMPLATES, SPLITS, buildProgram, bodyStats, DAY_NAMES };
