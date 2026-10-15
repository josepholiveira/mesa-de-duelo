import { esc, manaHTML } from './cardtext';

export interface FaceInfo {
  name: string;
  manaCost: string;
  typeLine: string;
  power?: number;
  toughness?: number;
  creature: boolean;
  /** 'W' | 'U' | 'B' | 'R' | 'G' | 'M' (multicolor) | 'L' (terreno) | 'C' (incolor) */
  color: string;
  image?: string;
}

/** Carta desenhada: imagem do Scryfall por cima de uma moldura em CSS que aparece se a imagem faltar. */
export function faceHTML(f: FaceInfo) {
  return `<div class="face col-${f.color}">
    <div class="fb">
      <div class="fb-head"><span class="fb-name">${esc(f.name)}</span><span class="fb-cost">${manaHTML(f.manaCost)}</span></div>
      <div class="fb-type">${esc(f.typeLine)}</div>
      ${f.creature ? `<div class="fb-pt">${f.power ?? 0}/${f.toughness ?? 0}</div>` : ''}
    </div>
    ${f.image ? `<img src="${f.image}" alt="${esc(f.name)}" draggable="false" loading="lazy" onerror="this.remove()">` : ''}
  </div>`;
}

export function colorFromCost(manaCost: string, land: boolean): string {
  const cols = new Set((manaCost.match(/[WUBRG]/g) ?? []));
  if (cols.size > 1) return 'M';
  if (cols.size === 1) return [...cols][0];
  return land ? 'L' : 'C';
}
