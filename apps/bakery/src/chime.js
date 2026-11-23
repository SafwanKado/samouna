// New-order chime with the Web Audio API (no audio file to download or cache).
// Browsers only allow sound after a user gesture, so the dashboard asks staff
// to tap once per session.
import { useEffect, useState } from 'react';

let ctx = null;
const listeners = new Set();

export function audioReady() {
  return ctx?.state === 'running';
}

export async function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx ??= new AC();
  await ctx.resume().catch(() => {});
  listeners.forEach((l) => l());
  return audioReady();
}

function tone(at, freq, length = 0.6) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.6, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length);
}

export function playChime() {
  if (!audioReady()) return;
  const t = ctx.currentTime;
  tone(t, 988);
  tone(t + 0.22, 784);
  tone(t + 0.44, 1175, 0.9);
}

export function useAudioReady() {
  const [ready, setReady] = useState(audioReady);
  useEffect(() => {
    const l = () => setReady(audioReady());
    listeners.add(l);
    // Any first tap anywhere unlocks audio too.
    const onTap = () => unlockAudio();
    document.addEventListener('click', onTap, { once: true });
    return () => {
      listeners.delete(l);
      document.removeEventListener('click', onTap);
    };
  }, []);
  return ready;
}

/** Ring continuously while `active` is true. */
export function useChime(active) {
  const ready = useAudioReady();
  useEffect(() => {
    if (!active || !ready) return undefined;
    playChime();
    navigator.vibrate?.([300, 150, 300]);
    const id = setInterval(playChime, 2500);
    return () => clearInterval(id);
  }, [active, ready]);
  return ready;
}

/** Keep a counter tablet's screen awake while the dashboard is open. */
export function useWakeLock() {
  useEffect(() => {
    let lock = null;
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen');
      } catch {
        /* not supported or denied */
      }
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, []);
}
