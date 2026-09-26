(function () {
  'use strict';

  // Keep in step with the SPEED_* constants and DEFAULT_SPEED_KEY in content.js.
  const SPEED_MIN = 0.5;
  const SPEED_MAX = 2.0;
  const SPEED_STEP = 0.05;
  const SPEED_TICK = 0.25;
  const SPEED_PRESETS = [0.5, 1.0, 1.25, 1.5, 1.75, 2.0];
  const DEFAULT_SPEED_KEY = 'defaultSpeed';

  const storage = globalThis.browser?.storage?.sync ?? globalThis.chrome?.storage?.sync;
  const slider = document.getElementById('default-speed');
  const readout = document.getElementById('readout');
  const ticks = document.getElementById('ticks');
  const reset = document.getElementById('reset');
  const status = document.getElementById('status');

  function clampSpeed(rate) {
    const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, rate));
    return Math.round(clamped / SPEED_STEP) * SPEED_STEP;
  }

  function formatSpeed(rate) {
    const rounded = Math.round(rate * 100) / 100;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
    return `${text}×`;
  }

  function show(rate) {
    const clamped = clampSpeed(rate);
    slider.value = String(clamped);
    readout.textContent = formatSpeed(clamped);
  }

  let statusTimer = null;
  async function save(rate) {
    const clamped = Math.round(clampSpeed(rate) * 100) / 100;
    show(clamped);
    try {
      await storage.set({ [DEFAULT_SPEED_KEY]: clamped });
      status.textContent = 'Saved';
    } catch (err) {
      status.textContent = 'Could not save';
      console.error('[YoutubeOpenShort] save default speed failed', err);
    }
    status.classList.add('visible');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => status.classList.remove('visible'), 1200);
  }

  for (
    let value = SPEED_MIN;
    value <= SPEED_MAX + SPEED_STEP / 2;
    value = Math.round((value + SPEED_TICK) * 100) / 100
  ) {
    const tick = document.createElement('span');
    tick.className = 'tick';
    if (SPEED_PRESETS.includes(value)) tick.classList.add('tick--preset');
    if (value === 1) tick.classList.add('tick--unity');
    tick.style.left = `${((value - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100}%`;
    ticks.appendChild(tick);
  }

  slider.addEventListener('input', () => show(parseFloat(slider.value)));
  slider.addEventListener('change', () => save(parseFloat(slider.value)));
  reset.addEventListener('click', () => save(1));

  if (!storage) {
    show(1);
    status.textContent = 'Storage unavailable';
    status.classList.add('visible');
    return;
  }

  storage
    .get(DEFAULT_SPEED_KEY)
    .then((stored) => {
      const rate = Number(stored?.[DEFAULT_SPEED_KEY]);
      show(Number.isFinite(rate) ? rate : 1);
    })
    .catch(() => show(1));
})();
