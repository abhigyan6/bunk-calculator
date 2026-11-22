'use strict';

/* ==========================================================================
   Bunk calculator
   ========================================================================== */

/** Guards against floating-point error when a target is met exactly. */
const EPSILON = 1e-8;
/** How long the result card stays highlighted after a successful submit. */
const FEEDBACK_MS = 320;

const $ = (id) => document.getElementById(id);

const form = $('calculator');
const resultCard = document.querySelector('.result');
const fields = {
  held: $('held'),
  attended: $('attended'),
  remaining: $('remaining'),
  target: $('target'),
};

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

/* --------------------------------------------------------------------------
   Copy
   -------------------------------------------------------------------------- */

const pluralise = (count, singular, plural) => (count === 1 ? singular : plural);

function badgeText(plan) {
  if (plan.total === 0) return 'Ready when classes start';
  return plan.possible ? 'Target is within reach' : 'Target out of reach this term';
}

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
   DOM
   -------------------------------------------------------------------------- */

function readInputs() {
  const read = (field) => (field.value.trim() === '' ? NaN : Number(field.value));

  return {
    held: read(fields.held),
    attended: read(fields.attended),
    remaining: read(fields.remaining),
    target: read(fields.target),
  };
}

function render(input) {
  const { held, attended, remaining } = input;
  const plan = calculatePlan(input);

  $('current').textContent = held
    ? `Current attendance: ${((attended / held) * 100).toFixed(2)}% (${attended} of ${held} classes)`
    : 'No classes held yet. A clean slate.';

  $('badge').textContent = badgeText(plan);
  $('resultLabel').textContent = plan.possible ? 'Classes you need to attend' : 'Attend every remaining class';
  $('number').textContent = `${plan.possible ? plan.needed : remaining} / ${remaining}`;
  $('verdict').textContent = verdictText(plan);
  $('detail').textContent = detailText(plan, input);
  $('bunks').textContent = plan.bunks;
  $('final').textContent = plan.total ? `${plan.best.toFixed(2)}%` : '—';
}

/** Validates, renders, and returns true when the inputs were valid. */
function calculate() {
  const input = readInputs();
  const error = validate(input);

  $('error').textContent = error;

  if (error) {
    $('badge').textContent = 'Check your inputs';
    return false;
  }

  render(input);
  return true;
}

let feedbackTimer;

function flashResult() {
  clearTimeout(feedbackTimer);
  resultCard.classList.add('confirmed');
  feedbackTimer = setTimeout(() => resultCard.classList.remove('confirmed'), FEEDBACK_MS);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!calculate()) {
    form.querySelector('input:invalid')?.focus();
    return;
  }
  flashResult();
});

calculate();
