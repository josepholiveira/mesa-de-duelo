import type { FPreferences } from '../forge/client';

export const AUTO_PASS_KEY = 'mesa:autoPassNoActions';
interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
type SendPreference = (message: { type: 'preferences'; autoPassNoActions: boolean }) => void;

/** Only synchronizes an engine preference. It never passes priority on the player's behalf. */
export class AutoPassPreference {
  value = true;
  supported = false;
  pending: boolean | null = null;
  private applied = false;
  private hasLocalChoice = false;
  private storage?: PreferenceStorage;
  private send: SendPreference;

  constructor(send: SendPreference, storage?: PreferenceStorage) {
    this.send = send;
    try {
      this.storage = storage ?? globalThis.localStorage;
      const saved = this.storage?.getItem(AUTO_PASS_KEY);
      if (saved === 'true' || saved === 'false') { this.value = saved === 'true'; this.hasLocalChoice = true; }
    } catch { /* Browser storage is optional; retain the choice for this mounted table. */ }
  }

  reset() { this.supported = false; this.pending = null; this.applied = false; }

  observe(preferences: FPreferences | undefined, connected: boolean) {
    if (!connected) { this.reset(); return; }
    if (typeof preferences?.autoPassNoActions !== 'boolean') { this.supported = false; return; }
    const confirmed = preferences.autoPassNoActions;
    this.supported = true;
    if (!this.applied) {
      // Without a browser override, keep the seat's setting when joining from another device.
      if (!this.hasLocalChoice) this.value = confirmed;
      this.applied = true;
      this.dispatch();
    } else if (this.pending !== null) {
      // A queued echo of an earlier toggle must not overwrite the newest desired value.
      if (confirmed === this.pending) {
        this.pending = null;
        if (confirmed !== this.value) this.dispatch();
      }
    } else if (confirmed !== this.value) {
      this.value = confirmed;
      this.persist();
    }
  }

  change(value: boolean) {
    if (!this.supported || typeof value !== 'boolean' || value === this.value) return;
    this.value = value;
    this.persist();
    if (this.pending === null) this.dispatch();
  }

  private dispatch() {
    // One outstanding request makes boolean echoes sufficient, even under rapid toggles.
    this.pending = this.value;
    this.send({ type: 'preferences', autoPassNoActions: this.value });
  }

  private persist() {
    this.hasLocalChoice = true;
    try { this.storage?.setItem(AUTO_PASS_KEY, String(this.value)); } catch { /* Keep the in-memory choice. */ }
  }
}
