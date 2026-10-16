import type { FState } from '../forge/client';
import { esc } from './cardtext';

const PHASES = [
  ['untap', 'Desvirar'], ['upkeep', 'Manutenção'], ['draw', 'Compra'],
  ['main1', 'Principal 1'], ['combat', 'Combate'], ['main2', 'Principal 2'], ['end', 'Final'],
] as const;
const STEPS: Record<string, { group: string; detail: string }> = {
  UNTAP: { group: 'untap', detail: 'Etapa de desvirar' },
  UPKEEP: { group: 'upkeep', detail: 'Etapa de manutenção' },
  DRAW: { group: 'draw', detail: 'Etapa de compra' },
  MAIN1: { group: 'main1', detail: 'Fase principal antes do combate' },
  COMBAT_BEGIN: { group: 'combat', detail: 'Início do combate' },
  COMBAT_DECLARE_ATTACKERS: { group: 'combat', detail: 'Declaração de atacantes' },
  COMBAT_DECLARE_BLOCKERS: { group: 'combat', detail: 'Declaração de bloqueadores' },
  COMBAT_FIRST_STRIKE_DAMAGE: { group: 'combat', detail: 'Dano de iniciativa' },
  COMBAT_DAMAGE: { group: 'combat', detail: 'Dano de combate' },
  COMBAT_END: { group: 'combat', detail: 'Fim do combate' },
  MAIN2: { group: 'main2', detail: 'Fase principal depois do combate' },
  END_OF_TURN: { group: 'end', detail: 'Etapa final' },
  CLEANUP: { group: 'end', detail: 'Limpeza' },
};

/** An informational track, never a shortcut that advances the engine. */
export function phaseHudHTML(state: Pick<FState, 'turn' | 'phase' | 'activePlayer' | 'you' | 'players' | 'gameOver'>): string {
  const step = STEPS[state.phase ?? ''];
  const activeIndex = PHASES.findIndex(([key]) => key === step?.group);
  const mine = state.activePlayer === state.you;
  const activeName = state.players.find(player => player.id === state.activePlayer)?.name;
  const owner = state.gameOver ? 'Jogo encerrado' : mine ? 'Seu turno' : activeName === 'Oponente' ? 'Turno do oponente' : activeName ? `Turno de ${activeName}` : 'Preparando o jogo';
  return `<div class="phase-heading"><span class="phase-turn">Turno <b>${state.turn}</b></span><strong class="phase-owner ${mine ? 'mine' : 'theirs'}">${esc(owner)}</strong></div>
    <ol class="phase-track">${PHASES.map(([key, label], index) => `<li class="phase-step${step?.group === key && !state.gameOver ? ' current' : ''}${index < activeIndex ? ' passed' : ''}"${step?.group === key && !state.gameOver ? ' aria-current="step"' : ''}><span class="phase-dot" aria-hidden="true"></span><span>${label}</span></li>`).join('')}</ol>
    <div class="phase-detail">${esc(state.gameOver ? 'Jogo concluído' : step?.detail ?? 'Aguardando o início do turno')}</div>`;
}
