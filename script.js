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
/** If the cat photo hasn't arrived by now, show the hand-drawn cat instead. */
const CAT_FALLBACK_AFTER_MS = 6000;
/** How long "Copied!" stays on the share button. */
const COPIED_MS = 1500;

const CAT_ENDPOINT = 'https://cataas.com/cat';
const STORAGE_KEY = 'bunk-inputs';
const FIELD_KEYS = ['held', 'attended', 'remaining', 'target'];
const DEFAULTS = { held: 0, attended: 0, remaining: 0, target: 75 };

/** Everything that changes with the verdict: stamp, cat photo tags, meme lines. */
const MOODS = {
  chill: {
    stamp: 'Bunk-safe',
    tags: ['chill', 'cool', 'smug', 'happy'],
    lines: ['bunk time', 'you have my permission', 'go touch grass', 'skip it, i dare you'],
    captions: ['Cat says you’re fine.', 'The cat did the maths. You’re fine.'],
    fallback: { src: 'cats/chill.svg', alt: 'Hand-drawn cat in sunglasses saying: bunk time' },
  },
  tight: {
    stamp: 'No slack',
    tags: ['serious', 'judging', 'grumpy', 'angry'],
    lines: ['attend everything', 'no skipping', 'i am watching you', 'sit. in. class.'],
    captions: ['Cat says no.', 'This cat is not impressed.'],
    fallback: { src: 'cats/tight.svg', alt: 'Hand-drawn cat glaring, saying: attend everything' },
  },
  doomed: {
    stamp: 'Danger zone',
    tags: ['crying', 'depressed', 'disappointed', 'shocked', 'scared'],
    lines: ['it is over', 'the maths said no', 'pain', 'i have seen the numbers'],
    captions: ['Even the cat is worried.', 'A moment of silence.'],
    fallback: { src: 'cats/doomed.svg', alt: 'Hand-drawn crying cat saying: it is over' },
  },
  empty: {
    stamp: 'Waiting',
    tags: ['asleep', 'sleepy', 'sleeping'],
    lines: ['no classes yet', 'nap time', 'too early for this'],
    captions: ['Nothing to do yet.', 'Cat is asleep. Be like cat.'],
    fallback: { src: 'cats/empty.svg', alt: 'Hand-drawn sleeping cat saying: no classes yet' },
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

/**
 * Checks the inputs. Returns the message to show and which fields caused it;
 * `error` is an empty string when everything is valid.
 */
function validate(input) {
  const { held, attended, remaining, target } = input;
  const keys = Object.keys(input);
  const counts = ['held', 'attended', 'remaining'];

  const missing = keys.filter((key) => !Number.isFinite(input[key]));
  if (missing.length) {
    return { error: 'Fill in all four fields with valid numbers.', fields: missing };
  }

  const badCounts = counts.filter((key) => !Number.isSafeInteger(input[key]) || input[key] < 0);
  if (badCounts.length) {
    return { error: 'Class counts must be non-negative whole numbers.', fields: badCounts };
  }
  if (attended > held) {
    return { error: 'Classes attended cannot exceed classes held.', fields: ['attended', 'held'] };
  }
  if (target <= 0 || target > 100) {
    return { error: 'Required attendance must be greater than 0 and at most 100%.', fields: ['target'] };
  }
  if (!Number.isSafeInteger(held + remaining)) {
    return { error: 'That class total is too large.', fields: ['held', 'remaining'] };
  }
  return { error: '', fields: [] };
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
  if (plan.bunks === 0) return 'No room to skip. Every class from here.';
  if (plan.needed === 0) return 'Zero needed. You’re already safe.';
  return `You can skip ${plan.bunks} ${pluralise(plan.bunks, 'class', 'classes')}. Don’t be greedy.`;
}

function detailText(plan, input) {
  const { remaining, target } = input;

  if (plan.total === 0) {
    return 'Add the classes scheduled for this term to build your plan.';
  }
  if (plan.possible) {
    return `Go to at least ${plan.needed} of the next ${remaining} classes to finish on ${target}% or more. You can miss up to ${plan.bunks}.`;
  }

  const shortfall =
    target === 100
      ? 'Once you’ve missed a class, 100% is gone.'
      : `You’d need ${additionalClassesNeeded(input)} more classes than are scheduled, and you’d have to attend every one.`;

  return `Even if you go to every class from here, you’ll finish on ${plan.best.toFixed(2)}%, which is below ${target}%. ${shortfall}`;
}

/* --------------------------------------------------------------------------
   Saved inputs and shareable links
   -------------------------------------------------------------------------- */

const toInput = (raw) =>
  Object.fromEntries(FIELD_KEYS.map((key) => [key, raw[key] === '' || raw[key] == null ? NaN : Number(raw[key])]));

/** Only inputs that pass validation are ever loaded from a link or from storage. */
const isUsable = (raw) => Boolean(raw) && validate(toInput(raw)).error === '';

const isDefault = (input) => FIELD_KEYS.every((key) => input[key] === DEFAULTS[key]);

function readFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (!FIELD_KEYS.every((key) => params.has(key))) return null;
  const raw = Object.fromEntries(FIELD_KEYS.map((key) => [key, params.get(key)]));
  return isUsable(raw) ? raw : null;
}

function readFromStorage() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return isUsable(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Keeps the address bar and localStorage in step with the current inputs. */
function persist(input) {
  const clean = isDefault(input);
  try {
    if (clean) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
  } catch {
    // Storage can be blocked; the link below still works.
  }
  try {
    const query = clean ? '' : `?${new URLSearchParams(input)}`;
    window.history.replaceState(null, '', `${window.location.pathname}${query}`);
  } catch {
    // Some contexts (like file://) don't allow this; sharing still works.
  }
}

function shareUrl(input) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams(input).toString();
  url.hash = '';
  return url.href;
}

/** A link beats saved data, which beats the defaults. */
function applyInitialValues() {
  const start = readFromUrl() ?? readFromStorage();
  if (!start) return;
  FIELD_KEYS.forEach((key) => {
    fields[key].value = start[key];
  });
  syncChips();
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
   Cat meme (with a hand-drawn fallback)
   -------------------------------------------------------------------------- */

const cat = {
  frame: $('catFrame'),
  img: $('catImg'),
  status: $('catStatus'),
  caption: $('catCaption'),
  mood: null,
  usingFallback: false,
  timer: null,
};

/** Swaps in the drawing that ships with the site. */
function showFallbackCat() {
  clearTimeout(cat.timer);
  const { src, alt } = MOODS[cat.mood ?? 'chill'].fallback;
  cat.usingFallback = true;
  cat.img.alt = alt;
  cat.img.src = src;
}

function loadCat(mood, { force = false } = {}) {
  if (!force && cat.mood === mood) return;
  cat.mood = mood;
  cat.usingFallback = false;
  clearTimeout(cat.timer);

  const { tags, lines, captions } = MOODS[mood];
  const line = pick(lines);
  // Ask for the exact 4:3 frame size so the meme text isn't cropped off the bottom.
  // `cb` is just a cache-buster (note: `r` is a real API parameter, the red channel).
  const params = new URLSearchParams({ width: 520, height: 390, fontSize: 38, fontColor: 'white', cb: Date.now() });

  cat.frame.classList.remove('is-loaded', 'is-broken');
  cat.status.textContent = 'Fetching a cat…';
  cat.caption.textContent = pick(captions);
  cat.img.alt = `Cat meme saying: ${line}`;
  cat.img.src = `${CAT_ENDPOINT}/${pick(tags)}/says/${encodeURIComponent(line)}?${params}`;
  cat.timer = setTimeout(showFallbackCat, CAT_FALLBACK_AFTER_MS);
}

cat.img.addEventListener('load', () => {
  clearTimeout(cat.timer);
  cat.frame.classList.add('is-loaded');
});

cat.img.addEventListener('error', () => {
  if (!cat.usingFallback) {
    showFallbackCat(); // the photo site is down or blocked
    return;
  }
  cat.frame.classList.remove('is-loaded');
  cat.frame.classList.add('is-broken');
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
  meterSkip: $('meterSkip'),
  meterText: $('meterText'),
  skip: $('skip'),
  skipText: $('skipText'),
  summary: $('summary'),
};

let currentMood = null;
let announceTimer;
/** The latest valid inputs and plan, so the slider and share link can use them. */
let last = null;
/** Until the slider is touched it follows the "safe to skip" number. */
let skipTouched = false;

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

/** "What if I skip N classes?" slider and the matching marker on the meter. */
function renderWhatIf() {
  if (!last) return;
  const { input, plan } = last;
  const { attended, remaining } = input;
  const canSkip = plan.total > 0 && remaining > 0;

  els.skip.max = remaining;
  els.skip.disabled = !canSkip;
  if (!skipTouched) els.skip.value = plan.possible ? plan.bunks : 0;

  const skip = Math.min(Number(els.skip.value), remaining);
  els.skip.value = skip;
  els.meterSkip.hidden = !canSkip;

  if (!canSkip) {
    els.skipText.textContent = 'No classes left to skip.';
    els.skipText.removeAttribute('data-safe');
    els.skip.setAttribute('aria-valuetext', els.skipText.textContent);
    return;
  }

  const final = (100 * (attended + remaining - skip)) / plan.total;
  const safe = plan.possible && skip <= plan.bunks;

  els.skipText.textContent = `Skip ${skip} ${pluralise(skip, 'class', 'classes')} and you finish on ${final.toFixed(2)}%. ${
    safe ? 'Still safe.' : 'Below the line.'
  }`;
  els.skipText.dataset.safe = String(safe);
  els.skip.setAttribute('aria-valuetext', els.skipText.textContent);
  els.meterSkip.style.left = `${clampPercent(final)}%`;
}

function render(input, { animate, newCat }) {
  const { held, attended, remaining, target } = input;
  const plan = calculatePlan(input);
  const mood = moodOf(plan);
  const moodChanged = mood !== currentMood;
  currentMood = mood;
  last = { input, plan };

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
  renderWhatIf();
  loadCat(mood, { force: newCat });
  persist(input);
  announce(`${verdict} ${detail}`);
}

/** Validates, renders, and returns true when the inputs were valid. */
function calculate({ animate = false, newCat = false } = {}) {
  const input = readInputs();
  const { error, fields: badFields } = validate(input);

  $('error').textContent = error;
  Object.entries(fields).forEach(([key, field]) => {
    if (badFields.includes(key)) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  });

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

// Select a field's contents on focus so typing replaces the starting 0.
form.addEventListener('focusin', (event) => {
  if (event.target.matches('input')) event.target.select();
});

// Results update live as you type.
form.addEventListener('input', () => {
  syncChips();
  calculate();
});

/** The fanfare: a fresh cat, the stamp slam, the card pop. */
function celebrate() {
  if (!calculate({ animate: true, newCat: true })) {
    form.querySelector('[aria-invalid="true"]')?.focus();
  }
}

// There is no submit button (results are live), so Enter in a field is what triggers the fanfare.
form.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing || !event.target.matches('input')) return;
  event.preventDefault();
  celebrate();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  celebrate();
});

form.addEventListener('reset', () => {
  skipTouched = false;
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

els.skip.addEventListener('input', () => {
  skipTouched = true;
  renderWhatIf();
});

const copyButton = $('copyLink');
const copyLabel = copyButton.textContent;
let copyTimer;

copyButton.addEventListener('click', async () => {
  if (!last) return;
  const url = shareUrl(last.input);

  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt('Copy this link:', url); // clipboard blocked: let them copy by hand
    return;
  }

  copyButton.textContent = 'Copied!';
  $('copyStatus').textContent = 'Link copied.';
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyButton.textContent = copyLabel;
    $('copyStatus').textContent = '';
  }, COPIED_MS);
});

applyInitialValues();
calculate();
