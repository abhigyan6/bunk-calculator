'use strict';

/* ==========================================================================
   Bunk calculator
   ========================================================================== */

/** Guards against floating-point error when a target is met exactly. */
const EPSILON = 1e-8;
/** The class-by-class bar never draws more blocks than this. */
const MAX_BLOCKS = 60;
/** Duration of the big number's count-up. */
const COUNT_UP_MS = 450;
/** Delay before screen readers hear a live update (avoids chatter while typing). */
const ANNOUNCE_DELAY_MS = 600;

const CAT_ENDPOINT = 'https://cataas.com/cat';

/** Everything that changes with the verdict: stamp, cat photo tags, meme lines. */
const MOODS = {
  chill: {
    stamp: 'Bunk-safe',
    tags: ['chill', 'cool', 'smug', 'happy'],
    lines: ['bunk time', 'you have my permission', 'go touch grass', 'skip it, i dare you'],
    captions: ['Approved by the committee of cats.', 'This cat has seen your numbers.'],
  },
  tight: {
    stamp: 'No slack',
    tags: ['serious', 'judging', 'grumpy', 'angry'],
    lines: ['attend everything', 'no skipping', 'i am watching you', 'sit. in. class.'],
    captions: ['This cat is not impressed.', 'Every class counts. The cat said so.'],
  },
  doomed: {
    stamp: 'Danger zone',
    tags: ['crying', 'depressed', 'disappointed', 'shocked', 'scared'],
    lines: ['it is over', 'the maths said no', 'pain', 'i have seen the numbers'],
    captions: ['The cat saw the maths too.', 'Moment of silence.'],
  },
  empty: {
    stamp: 'Waiting',
    tags: ['asleep', 'sleepy', 'sleeping'],
    lines: ['no classes yet', 'nap time', 'too early for this'],
    captions: ['Nothing to worry about yet.', 'Enjoy the quiet.'],
  },
};

const $ = (id) => document.getElementById(id);

const form = $('calculator');
const fields = {
  held: $('held'),
  attended: $('attended'),
  remaining: $('remaining'),
  target: $('target'),
};
const chips = [...document.querySelectorAll('.btn--chip')];

/** Reads the OS-level setting each time, so changing it takes effect live. */
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clampPercent = (n) => Math.min(100, Math.max(0, n));
const pluralise = (count, singular, plural) => (count === 1 ? singular : plural);

/* --------------------------------------------------------------------------
   Pure logic
   -------------------------------------------------------------------------- */

/**
 * Work out how many of the remaining classes must be attended.
 * Uses exact percentages: a rounded 75% does not count as meeting the target.
 */
function calculatePlan({ held, attended, remaining, target }) {
  const total = held + remaining;
  const needed = Math.max(0, Math.ceil((target * total - 100 * attended - EPSILON) / 100));
  const possible = needed <= remaining;

  return {
    total,
    needed,
    possible,
    bunks: possible ? remaining - needed : 0,
    best: total ? (100 * (attended + remaining)) / total : 0,
  };
}

/** Extra classes (beyond those scheduled) needed to reach the target. */
function additionalClassesNeeded({ held, attended, remaining, target }) {
  const required = Math.ceil((target * held - 100 * attended) / (100 - target) - EPSILON);
  return Math.max(0, required - remaining);
}

/** Returns an error message, or an empty string when the inputs are valid. */
function validate({ held, attended, remaining, target }) {
  const values = [held, attended, remaining, target];
  const counts = [held, attended, remaining];

  if (values.some((value) => !Number.isFinite(value))) {
    return 'Fill in all four fields with valid numbers.';
  }
  if (counts.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return 'Class counts must be non-negative whole numbers.';
  }
  if (attended > held) {
    return 'Classes attended cannot exceed classes held.';
  }
  if (target <= 0 || target > 100) {
    return 'Required attendance must be greater than 0 and at most 100%.';
  }
  if (!Number.isSafeInteger(held + remaining)) {
    return 'That class total is too large.';
  }
  return '';
}

function moodOf(plan) {
  if (plan.total === 0) return 'empty';
  if (!plan.possible) return 'doomed';
  if (plan.bunks === 0) return 'tight';
  return 'chill';
}

/* --------------------------------------------------------------------------
   Copy
   -------------------------------------------------------------------------- */

function verdictText(plan) {
  if (plan.total === 0) return 'No classes, no bunking. Yet.';
  if (!plan.possible) return 'The maths has called a parent-teacher meeting.';
  if (plan.bunks === 0) return 'Your seat needs a full-time commitment.';
  if (plan.needed === 0) return 'You’ve earned some breathing room.';
  return `Your ${plan.bunks} ${pluralise(plan.bunks, 'class', 'classes')} of freedom. Use wisely.`;
}

function detailText(plan, input) {
  const { remaining, target } = input;

  if (plan.total === 0) {
    return 'Add the classes scheduled for this term to build your plan.';
  }
  if (plan.possible) {
    return `Attend at least ${plan.needed} of the next ${remaining} classes to finish at or above ${target}%. You can miss up to ${plan.bunks}.`;
  }

  const shortfall =
    target === 100
      ? 'Reaching 100% is impossible once a class has been missed.'
      : `You would need ${additionalClassesNeeded(input)} additional classes beyond those scheduled, attending all of them, to reach ${target}%.`;

  return `Even with perfect attendance from now on, you’ll finish at ${plan.best.toFixed(2)}%, below ${target}%. ${shortfall}`;
}

/* --------------------------------------------------------------------------
   Animation helpers
   -------------------------------------------------------------------------- */

/** Restarts a one-shot CSS animation class, then removes it when it ends. */
function playOnce(element, className) {
  if (prefersReducedMotion()) return;
  element.classList.remove(className);
  void element.offsetWidth; // force reflow so the animation restarts
  element.classList.add(className);
  element.addEventListener('animationend', () => element.classList.remove(className), { once: true });
}

const tweenFrames = new WeakMap();

/** Counts a number element up (or down) to `to`. */
function tweenNumber(element, to) {
  cancelAnimationFrame(tweenFrames.get(element));

  const from = Number(element.dataset.value ?? 0);
  element.dataset.value = to;

  if (prefersReducedMotion() || from === to) {
    element.textContent = to;
    return;
  }

  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / COUNT_UP_MS);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) tweenFrames.set(element, requestAnimationFrame(step));
  };
  tweenFrames.set(element, requestAnimationFrame(step));
}

/* --------------------------------------------------------------------------
   Cat meme
   -------------------------------------------------------------------------- */

const cat = {
  frame: $('catFrame'),
  img: $('catImg'),
  status: $('catStatus'),
  caption: $('catCaption'),
  mood: null,
};

function loadCat(mood, { force = false } = {}) {
  if (!force && cat.mood === mood) return;
  cat.mood = mood;

  const { tags, lines, captions } = MOODS[mood];
  const line = pick(lines);
  // `cb` is just a cache-buster (note: `r` is a real API parameter, the red channel).
  // Ask for the exact 4:3 frame size so the meme text isn't cropped off the bottom.
  const params = new URLSearchParams({ width: 520, height: 390, fontSize: 38, fontColor: 'white', cb: Date.now() });

  cat.frame.classList.remove('is-loaded');
  cat.status.textContent = 'Fetching a cat…';
  cat.caption.textContent = pick(captions);
  cat.img.alt = `Cat meme saying: ${line}`;
  cat.img.src = `${CAT_ENDPOINT}/${pick(tags)}/says/${encodeURIComponent(line)}?${params}`;
}

cat.img.addEventListener('load', () => cat.frame.classList.add('is-loaded'));
cat.img.addEventListener('error', () => {
  cat.frame.classList.remove('is-loaded');
  cat.status.textContent = 'The cat declined to show up.';
});

$('catReroll').addEventListener('click', () => loadCat(cat.mood ?? 'chill', { force: true }));

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */

const els = {
  result: $('result'),
  badge: $('badge'),
  heroTarget: $('heroTarget'),
  planWrap: $('planWrap'),
  planBar: $('planBar'),
  planScale: $('planScale'),
  meterTrack: $('meterTrack'),
  meterFill: $('meterFill'),
  meterGhost: $('meterGhost'),
  meterTarget: $('meterTarget'),
  meterTargetLabel: $('meterTargetLabel'),
  meterText: $('meterText'),
  summary: $('summary'),
};

let currentMood = null;
let announceTimer;

function announce(text) {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    els.summary.textContent = text;
  }, ANNOUNCE_DELAY_MS);
}

function readInputs() {
  const read = (field) => (field.value.trim() === '' ? NaN : Number(field.value));

  return {
    held: read(fields.held),
    attended: read(fields.attended),
    remaining: read(fields.remaining),
    target: read(fields.target),
  };
}

/** One block per remaining class; very long terms are scaled down to MAX_BLOCKS. */
function renderPlanBar(plan, remaining, animate) {
  els.planWrap.hidden = remaining === 0;
  els.planBar.replaceChildren();
  if (remaining === 0) return;

  const attendCount = plan.possible ? plan.needed : remaining;
  const blocks = Math.min(remaining, MAX_BLOCKS);
  let attendBlocks = Math.round((attendCount / remaining) * blocks);

  // Never let a rounding step hide the only attend (or bunk) blocks.
  if (attendCount > 0) attendBlocks = Math.max(1, attendBlocks);
  if (attendCount < remaining) attendBlocks = Math.min(attendBlocks, blocks - 1);

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < blocks; i += 1) {
    const block = document.createElement('span');
    block.className = `seg ${i < attendBlocks ? 'seg--attend' : 'seg--bunk'}`;
    block.style.setProperty('--i', i);
    fragment.append(block);
  }

  els.planBar.append(fragment);
  els.planBar.classList.toggle('is-animated', animate && !prefersReducedMotion());
  els.planBar.setAttribute(
    'aria-label',
    `Attend ${attendCount} of ${remaining} classes. ${remaining - attendCount} free to bunk.`,
  );

  const perBlock = remaining / blocks;
  els.planScale.hidden = perBlock === 1;
  els.planScale.textContent = `1 block ≈ ${Number(perBlock.toFixed(1))} classes`;
}

/** Current attendance vs. target, plus what perfect attendance would reach. */
function renderMeter({ held, attended, target }, plan) {
  const current = held ? (attended / held) * 100 : 0;
  const short = current < target;

  els.meterFill.style.width = `${clampPercent(current)}%`;
  els.meterFill.classList.toggle('is-short', held > 0 && short);
  els.meterGhost.style.width = `${clampPercent(plan.best)}%`;
  els.meterTarget.style.left = `${clampPercent(target)}%`;
  els.meterTarget.classList.toggle('is-late', target > 88);
  els.meterTargetLabel.textContent = `Target ${target}%`;

  let text;
  if (!held) {
    text = 'Nothing to measure until classes start.';
  } else if (!short) {
    text = `${(current - target).toFixed(2)} points above the line right now.`;
  } else {
    text = `${(target - current).toFixed(2)} points below the line. Perfect attendance from here gets you to ${plan.best.toFixed(2)}%.`;
  }
  els.meterText.textContent = text;
  els.meterTrack.setAttribute(
    'aria-label',
    `Attendance ${current.toFixed(2)}% against a ${target}% target. Best possible ${plan.best.toFixed(2)}%.`,
  );
}

function render(input, { animate, newCat }) {
  const { held, attended, remaining, target } = input;
  const plan = calculatePlan(input);
  const mood = moodOf(plan);
  const moodChanged = mood !== currentMood;
  currentMood = mood;

  // Stamp, card colour, hero target.
  els.result.dataset.mood = mood;
  els.badge.textContent = MOODS[mood].stamp;
  els.badge.classList.remove('badge--error');
  if (animate || moodChanged) playOnce(els.badge, 'slam');
  if (animate) playOnce(els.result, 'pop');

  const heroText = `${target}%.`;
  if (els.heroTarget.textContent !== heroText) {
    els.heroTarget.textContent = heroText;
    playOnce(els.heroTarget, 'pop');
  }

  // Numbers and copy.
  $('current').textContent = held
    ? `Current attendance: ${((attended / held) * 100).toFixed(2)}% (${attended} of ${held} classes)`
    : 'No classes held yet. A clean slate.';

  const shown = plan.possible ? plan.needed : remaining;
  $('resultLabel').textContent = plan.possible ? 'Classes you need to attend' : 'Attend every remaining class';
  $('numberSr').textContent = `${shown} of ${remaining}`;
  tweenNumber($('numNeeded'), shown);
  $('numTotal').textContent = remaining;

  const verdict = verdictText(plan);
  const detail = detailText(plan, input);
  $('verdict').textContent = verdict;
  $('detail').textContent = detail;
  $('bunks').textContent = plan.bunks;
  $('final').textContent = plan.total ? `${plan.best.toFixed(2)}%` : '—';

  renderPlanBar(plan, remaining, animate);
  renderMeter(input, plan);
  loadCat(mood, { force: newCat });
  announce(`${verdict} ${detail}`);
}

/** Validates, renders, and returns true when the inputs were valid. */
function calculate({ animate = false, newCat = false } = {}) {
  const input = readInputs();
  const error = validate(input);

  $('error').textContent = error;

  if (error) {
    els.badge.textContent = 'Check inputs';
    els.badge.classList.add('badge--error');
    return false;
  }

  render(input, { animate, newCat });
  return true;
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

/** Highlights whichever preset chip matches the target field. */
function syncChips() {
  const value = Number(fields.target.value);
  chips.forEach((chip) => chip.setAttribute('aria-pressed', String(Number(chip.dataset.target) === value)));
}

// Results update live as you type.
form.addEventListener('input', () => {
  syncChips();
  calculate();
});

// The button adds the fanfare: a fresh cat, the stamp, the card pop.
form.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!calculate({ animate: true, newCat: true })) {
    form.querySelector('input:invalid')?.focus();
  }
});

form.addEventListener('reset', () => {
  // Wait for the browser to restore the default values first.
  setTimeout(() => {
    syncChips();
    calculate({ animate: true });
  }, 0);
});

chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    fields.target.value = chip.dataset.target;
    fields.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
});

calculate();
