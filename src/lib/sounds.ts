let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return audioCtx;
  } catch {
    return null;
  }
}

export function playDeleteSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") ctx.resume();

  const now = ctx.currentTime;

  // Note 1: E5 (659 Hz) — descending start
  const gain1 = ctx.createGain();
  gain1.connect(ctx.destination);
  gain1.gain.setValueAtTime(0.12, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = 659;
  osc1.connect(gain1);
  osc1.start(now);
  osc1.stop(now + 0.1);

  // Note 2: C5 (523 Hz) — descending end
  const gain2 = ctx.createGain();
  gain2.connect(ctx.destination);
  gain2.gain.setValueAtTime(0.1, now + 0.08);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = 523;
  osc2.connect(gain2);
  osc2.start(now + 0.08);
  osc2.stop(now + 0.2);
}

export function playSuccessSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume if suspended (browsers require user gesture)
  if (ctx.state === "suspended") ctx.resume();

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  // Note 1: C5 (523 Hz)
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = 523;
  osc1.connect(gain);
  osc1.start(now);
  osc1.stop(now + 0.1);

  // Note 2: E5 (659 Hz)
  const gain2 = ctx.createGain();
  gain2.connect(ctx.destination);
  gain2.gain.setValueAtTime(0.15, now + 0.1);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = 659;
  osc2.connect(gain2);
  osc2.start(now + 0.1);
  osc2.stop(now + 0.25);
}
