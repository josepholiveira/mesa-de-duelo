import type { FState } from '../forge/client';
import type { PresentationEvent } from './presentationTimeline';

export interface StackPresentation {
  stack: FState['stack'];
  replaying: boolean;
}

/** Real pending effects always win. Recorded public frames are inspection-only playback. */
export function stackPresentation(state: FState, event?: PresentationEvent | null): StackPresentation {
  const live = { stack: state.stack, replaying: false };
  if (state.stack.length || state.gameOver || state.sideboarding || state.question) return live;
  const input = state.input;
  // A later, ordinary priority window must not erase an opponent's coalesced cast.
  // Actual choices still replace playback immediately; no frame supplies game input.
  if (input.opening || input.paying || input.targeting || input.blocking || input.suspendCast || input.selection ||
      input.selectable.length || input.selectableStacks?.length || input.selectablePlayers?.length ||
      (!input.priority && (input.ok.enabled || input.cancel.enabled || input.actionable?.length))) return live;
  const stack = event?.frame?.stack;
  return stack?.length ? { stack, replaying: true } : live;
}
