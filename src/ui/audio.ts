import type { PresentationEvent } from './presentationTimeline';

export interface AudioSettings { muted: boolean; volume: number }
export const SOUND_FILES = {
  draw: '01-card-draw.wav', play: '02-card-play.wav', land: '03-land.wav', cast: '04-cast.wav',
  impact: '05-impact.wav', 'player-hit': '08-player-hit.wav', 'turn-self': '06-turn.wav', wing: '07-wing.wav',
  'turn-opponent': '09-opponent-turn.wav', ability: '10-ability.wav', resolved: '11-resolved.wav',
  countered: '12-countered.wav', attack: '13-attack.wav', block: '14-block.wav',
} as const;
export type SoundCue = keyof typeof SOUND_FILES;
const SETTINGS_KEY = 'mesa:audio:v1';
const MAX_VOICES = 4;
// Four simultaneous full-volume cues remain below digital full scale.
const MIX_HEADROOM = .42;

export function soundForEvent(event: PresentationEvent, you?: number): SoundCue | null {
  switch (event.type) {
    case 'draw': return 'draw';
    case 'land-played': return 'land';
    case 'spell-cast': return 'cast';
    case 'ability-activated': return 'ability';
    case 'resolved': return 'resolved';
    case 'countered': return 'countered';
    case 'entered': return event.card?.keywords?.includes('FLYING') ? 'wing' : 'play';
    case 'attackers': return 'attack';
    case 'blockers': return 'block';
    case 'damage': return event.targets?.players?.length ? 'player-hit' : 'impact';
    case 'turn': {
      const actor = event.actor ?? event.frame?.activePlayer;
      return you === undefined || actor == null ? null : actor === you ? 'turn-self' : 'turn-opponent';
    }
    default: return null;
  }
}

/** Small, repeatable variations keep a cue recognizable without sounding like a loop. */
export function soundVariation(event: PresentationEvent, matchId: string, you?: number) {
  let hash = 2166136261;
  for (const character of `${matchId}:${event.seq}:${event.type}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const actor = event.actor ?? event.card?.controller;
  const opponent = you !== undefined && actor !== undefined && actor !== you;
  const directional = you !== undefined && actor !== undefined;
  return {
    rate: 1 + ((hash & 65535) / 65535 - .5) * .06 - (opponent ? .012 : 0),
    gain: .92 + ((hash >>> 16) & 255) / 255 * .12,
    pan: (directional ? opponent ? .09 : -.09 : 0) + ((hash >>> 24) / 255 - .5) * .04,
  };
}

export function normalizeAudioSettings(value: Partial<AudioSettings> | null | undefined): AudioSettings {
  const volume = typeof value?.volume === 'number' && Number.isFinite(value.volume) ? Math.max(0, Math.min(1, value.volume)) : .35;
  return { muted: value?.muted !== false, volume };
}

/** Consume event IDs even when silent: enabling audio must never replay earlier events. */
export class AudioEventGate {
  private seen = new Set<string>();
  allow(id: string, options: AudioSettings & { unlocked: boolean; visible: boolean; audible: boolean }) {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    return !options.muted && options.volume > 0 && options.unlocked && options.visible && options.audible;
  }
}

export function createGameAudio() {
  let stored: Partial<AudioSettings> | null = null;
  try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'); } catch { /* Storage is optional. */ }
  let settings = normalizeAudioSettings(stored);
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let unlocked = false;
  const buffers = new Map<SoundCue, AudioBuffer>();
  const loading = new Map<SoundCue, Promise<void>>();
  const voices = new Set<AudioBufferSourceNode>();
  const gate = new AudioEventGate();

  function save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Storage is optional. */ }
  }
  function silence() {
    for (const source of voices) { try { source.stop(); } catch { /* Already ended. */ } }
    voices.clear();
  }
  async function preload() {
    const ctx = context;
    if (!ctx || settings.muted) return;
    await Promise.allSettled((Object.keys(SOUND_FILES) as SoundCue[]).map(cue => {
      if (buffers.has(cue)) return Promise.resolve();
      if (loading.has(cue)) return loading.get(cue)!;
      const pending = fetch(`${import.meta.env.BASE_URL}audio/${SOUND_FILES[cue]}`)
        .then(r => { if (!r.ok) throw new Error('Audio unavailable'); return r.arrayBuffer(); })
        .then(data => ctx.decodeAudioData(data))
        .then(buffer => { buffers.set(cue, buffer); })
        .catch(() => { /* A missing asset never interrupts a match. */ })
        .finally(() => loading.delete(cue));
      loading.set(cue, pending);
      return pending;
    }));
  }
  async function unlock() {
    try {
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = settings.volume * MIX_HEADROOM;
        master.connect(context.destination);
      }
      await context.resume();
      unlocked = context.state === 'running';
      void preload();
    } catch { unlocked = false; }
  }
  // Trusted user gestures only. Merely rendering the board never unlocks or starts audio.
  const gesture = (event: Event) => { if (event.isTrusted) void unlock(); };
  document.addEventListener('pointerdown', gesture, { once: true });
  document.addEventListener('keydown', gesture, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) silence(); });

  return {
    get settings() { return { ...settings }; },
    unlock,
    setMuted(muted: boolean) {
      settings = { ...settings, muted };
      if (muted) silence(); else { void unlock(); }
      save();
    },
    setVolume(volume: number) {
      settings = normalizeAudioSettings({ ...settings, volume });
      if (master && context) master.gain.setTargetAtTime(settings.volume * MIX_HEADROOM, context.currentTime, .015);
      if (settings.volume === 0) silence();
      save();
    },
    silence,
    play(event: PresentationEvent, matchId: string, audible: boolean, you?: number) {
      const allowed = gate.allow(`${matchId}:${event.seq}`, { ...settings, unlocked, visible: !document.hidden, audible });
      const cue = soundForEvent(event, you);
      if (!allowed || !cue || !context || !master) return;
      const buffer = buffers.get(cue);
      if (!buffer) { void preload(); return; }
      if (voices.size >= MAX_VOICES) {
        const oldest = voices.values().next().value!;
        oldest.stop(); voices.delete(oldest);
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      const pan = context.createStereoPanner();
      const variation = soundVariation(event, matchId, you);
      source.buffer = buffer;
      source.playbackRate.value = variation.rate;
      gain.gain.value = variation.gain;
      pan.pan.value = variation.pan;
      source.connect(gain); gain.connect(pan); pan.connect(master);
      voices.add(source);
      source.onended = () => { voices.delete(source); source.disconnect(); gain.disconnect(); pan.disconnect(); };
      source.start();
    },
  };
}
