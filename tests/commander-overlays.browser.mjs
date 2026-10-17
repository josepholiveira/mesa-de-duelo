import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const session = 'commander-overlays-check';
const run = (...args) => execFileSync('npx', ['--yes', 'agent-browser', '--session', session, ...args], {encoding:'utf8'}).trim();
const evaluate = code => JSON.parse(execFileSync('npx', ['--yes', 'agent-browser', '--session', session, 'eval', '--stdin'], {input:`(async () => {${code}})()`,encoding:'utf8'}).trim());
try {
  run('open', `${process.env.TABLE_TEST_URL ?? 'http://localhost:5174'}/tests/fixtures/commander-table.html`);
  for (const [width,height] of [[1440,900],[1280,800],[844,390]]) {
    run('set','viewport',String(width),String(height));
    const checks = evaluate(`
      const f=window.fixture,s=f.state,all=[...s.players],checks=[];
      const boxes=()=>[...document.querySelectorAll('[data-seat-player],.field .bfc,#fHand')].map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
      for(const n of [2,3,4]) {
        s.players=n===2?all.filter(p=>p.id===10||p.id===36):all.slice(0,n);
        s.stack=[{id:95,text:'Compre duas cartas.',source:s.players[0].graveyard[0],controller:10}];f.render();
        // Changing fixture seat count triggers the table's240ms card movement; measure its settled layout.
        await new Promise(resolve=>setTimeout(resolve,300));
        const before=boxes();document.querySelector('[data-ui="stack-open"]').click();
        const gallery=boxes(),galleryOpen=!document.querySelector('#fStackGallery').hidden;
        document.querySelector('[data-ui="stack-close"]').click();document.querySelector('[data-zone="damage"]').click();
        const modal=boxes(),modalOpen=!document.querySelector('#fZone').hidden;
        document.querySelector('[data-ui="zone-close"]').click();checks.push({n,before,gallery,modal,galleryOpen,modalOpen});
      } return checks;
    `);
    for(const check of checks) {
      assert.ok(check.galleryOpen&&check.modalOpen);
      assert.deepEqual(check.gallery,check.before,`${width}/${check.n}: gallery shifted battlefield`);
      assert.deepEqual(check.modal,check.before,`${width}/${check.n}: modal shifted battlefield`);
    }
  }
  console.log('Overlay geometry passed: gallery and damage dialog preserve every seat/card/hand box across2–4 seats at1440,1280,844.');
} finally {run('close');}
