import changelog from '../../CHANGELOG.md?raw';
import { esc } from './cardtext';

interface Release { version: string; date: string; html: string }

/** Negrito e código, o pouco de Markdown inline que o CHANGELOG usa. */
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');

/** Lê as seções `## [X.Y.Z] - AAAA-MM-DD` do CHANGELOG.md; o texto antes da primeira fica de fora. */
function parse(md: string): Release[] {
  const out: Release[] = [];
  let cur: Release | null = null;
  let list = false;
  const close = () => { if (cur && list) cur.html += '</ul>'; list = false; };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const head = /^## \[(.+?)\](?:\s*-\s*(\d{4})-(\d{2})-(\d{2}))?/.exec(line);
    if (head) {
      close();
      cur = { version: head[1], date: head[2] ? `${head[4]}/${head[3]}/${head[2]}` : '', html: '' };
      out.push(cur);
      continue;
    }
    if (!cur || !line) continue;
    if (line.startsWith('### ')) { close(); cur.html += `<h4>${inline(line.slice(4))}</h4>`; continue; }
    if (line.startsWith('- ')) {
      if (!list) { cur.html += '<ul>'; list = true; }
      cur.html += `<li>${inline(line.slice(2))}</li>`;
      continue;
    }
    close();
    cur.html += `<p>${inline(line)}</p>`;
  }
  close();
  return out;
}

const RELEASES = parse(changelog);
export const VERSION = RELEASES[0]?.version ?? '';

const SEEN_KEY = 'mesa:novidades';
function seen() {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, VERSION); } catch { /* sem armazenamento */ }
}

/** Botão "Novidades" com a versão atual; abre um painel com o histórico. Um ponto marca versão ainda não vista. */
export function mountChangelog(host: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'news';
  el.innerHTML = `
    <button class="news-btn" aria-expanded="false" aria-controls="newsPanel">
      Novidades <span class="news-ver">v${esc(VERSION)}</span><span class="news-dot" ${seen() === VERSION ? 'hidden' : ''}></span>
    </button>
    <div class="news-panel" id="newsPanel" role="dialog" aria-label="Novidades" hidden>
      ${RELEASES.map(r => `<section class="news-rel">
        <h3>Versão ${esc(r.version)}${r.date ? ` <small>${r.date}</small>` : ''}</h3>${r.html}
      </section>`).join('')}
    </div>`;
  host.append(el);

  const btn = el.querySelector<HTMLButtonElement>('.news-btn')!;
  const panel = el.querySelector<HTMLElement>('.news-panel')!;
  const toggle = (open: boolean) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) { markSeen(); el.querySelector<HTMLElement>('.news-dot')!.hidden = true; }
  };
  btn.addEventListener('click', () => toggle(panel.hidden));
  document.addEventListener('click', e => { if (!panel.hidden && !el.contains(e.target as Node)) toggle(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); btn.focus(); } });
}
