'use strict';

/* ==========================================================================
   UI sound effects

   Tiny sounds synthesised with the Web Audio API: no audio files and no
   dependencies. Rules:
   - Nothing plays on page load or while scrolling. The audio context is only
     created after the first click, tap or key press.
   - Every sound is short and quiet.
   - The mute choice is remembered in localStorage.
   ========================================================================== */
(() => {
  const STORAGE_KEY = 'bunk-sfx-muted';
  /** Scales every sound. Individual gains below are already low. */
  const MASTER_VOLUME = 0.5;

  const toggle = document.getElementById('sfxToggle');
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');

  let audio = null;
  let muted = readMuted();

  /* ------------------------------------------------------------------------
     Remembered mute choice (storage can throw in private windows)
     ------------------------------------------------------------------------ */

  function readMuted() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function saveMuted(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // Not remembered this time; the button still works for this visit.
    }
  }

  /* ------------------------------------------------------------------------
     Synthesis
     ------------------------------------------------------------------------ */

  /** Browsers only allow audio after a user gesture, so create it lazily. */
  function unlock() {
    if (!audio) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio = new Context();
    }
    if (audio.state === 'suspended') audio.resume();
  }

  /** One short note with a fast attack and an exponential fade-out. */
  function tone({ freq, endFreq = freq, type = 'sine', start = 0, duration = 0.05, gain = 0.04 }) {
    const t0 = audio.currentTime + start;
    const oscillator = audio.createOscillator();
    const amp = audio.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, t0);
    if (endFreq !== freq) oscillator.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);

    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain * MASTER_VOLUME, t0 + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    oscillator.connect(amp).connect(audio.destination);
    oscillator.start(t0);
    oscillator.stop(t0 + duration + 0.02);
  }

  const SOUNDS = {
    // A short, soft "tick" for presses.
    click: () => tone({ freq: 900, endFreq: 420, type: 'square', duration: 0.045, gain: 0.05 }),
    // A barely-there blip for hovering the main button.
    hover: () => tone({ freq: 1500, duration: 0.03, gain: 0.025 }),
    // Two quick rising notes for "on", falling for "off".
    on: () => {
      tone({ freq: 520, type: 'triangle', duration: 0.07, gain: 0.06 });
      tone({ freq: 780, type: 'triangle', start: 0.06, duration: 0.09, gain: 0.06 });
    },
    off: () => {
      tone({ freq: 780, type: 'triangle', duration: 0.07, gain: 0.06 });
      tone({ freq: 520, type: 'triangle', start: 0.06, duration: 0.09, gain: 0.06 });
    },
  };

  /** `requireRunning` keeps hover sounds silent until audio is really live. */
  function play(name, { requireRunning = false } = {}) {
    if (muted || !audio) return;
    if (requireRunning && audio.state !== 'running') return;
    SOUNDS[name]();
  }

  /* ------------------------------------------------------------------------
     Events
     ------------------------------------------------------------------------ */

  // The first gesture unlocks audio. Nothing is created before that.
  ['pointerdown', 'keydown'].forEach((type) => document.addEventListener(type, unlock, { capture: true }));

  // Click sound for every button or link; preset chips behave like toggles.
  document.addEventListener('click', (event) => {
    const control = event.target.closest('button, a[href]');
    if (!control || control === toggle || control.disabled) return;
    play(control.matches('.btn--chip') ? 'on' : 'click');
  });

  // Hover sound on the main button only, and only with a mouse.
  document.addEventListener('mouseover', (event) => {
    if (!canHover.matches) return;
    const button = event.target.closest('.btn--primary');
    if (!button || button.contains(event.relatedTarget)) return;
    play('hover', { requireRunning: true });
  });

  /* ------------------------------------------------------------------------
     Mute button
     ------------------------------------------------------------------------ */

  function renderToggle() {
    toggle.textContent = muted ? 'Sound: off' : 'Sound: on';
  }

  if (toggle) {
    renderToggle();
    toggle.addEventListener('click', () => {
      unlock();
      if (muted) {
        muted = false;
        play('on');
      } else {
        play('off'); // the last sound you hear, before it goes quiet
        muted = true;
      }
      saveMuted(muted);
      renderToggle();
    });
  }
})();
