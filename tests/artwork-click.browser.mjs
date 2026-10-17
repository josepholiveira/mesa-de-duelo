import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const session='artwork-click-check';
const run=(...args)=>execFileSync('npx',['--yes','agent-browser','--session',session,...args],{encoding:'utf8'}).trim();
const evaluate=code=>JSON.parse(execFileSync('npx',['--yes','agent-browser','--session',session,'eval','--stdin'],{input:`(() => {${code}})()`,encoding:'utf8'}).trim());
try {
  for(const [width,height] of [[1280,800],[844,390]]) {
    run('open',`${process.env.TABLE_TEST_URL??'http://127.0.0.1:5173'}/tests/fixtures/commander-table.html`);
    run('set','viewport',String(width),String(height));
    evaluate(`
      const f=window.fixture;f.attack();window.artName='Artwork click '+Date.now();window.artResolvers=[];window.artReleased=false;window.artReady=false;window.artTrace=[];
      const originalFetch=window.fetch;
      window.fetch=async(url,options)=>{
        if(String(url).includes('/cards/collection')) {
          const data=JSON.parse(options.body).identifiers.map(({name})=>({name,layout:'normal',type_line:'Creature',mana_cost:'{W}',image_status:'highres_scan',image_uris:{small:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}}));
          return new Promise(resolve=>{const release=()=>resolve(new Response(JSON.stringify({data})));if(window.artReleased)release();else window.artResolvers.push(release);});
        }
        if(String(url).includes('/cards/search')) {if(decodeURIComponent(String(url)).includes(window.artName))window.artReady=true;return new Response(JSON.stringify({data:[]}));}
        return originalFetch(url,options);
      };
      for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>window.artTrace.push([type,event.target.closest('[data-fid]')?.dataset.fid]),true);
      f.state.players.find(player=>player.id===f.state.you).battlefield.find(card=>card.id===102).name=window.artName;f.render();return true;
    `);
    run('wait','--fn','window.artResolvers.length>0');
    const point=evaluate(`window.pressedCard=document.querySelector('.field.me [data-fid="102"]');const rect=window.pressedCard.getBoundingClientRect();return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)};`);
    run('batch',`mouse move ${point.x} ${point.y}`,'mouse down');
    evaluate('window.artReleased=true;window.artResolvers.forEach(resolve=>resolve());return true;');
    run('wait','--fn','window.artReady');
    assert.ok(evaluate('return window.pressedCard.isConnected;'),`${width}: cosmetic art replaced the card during its native press`);
    run('mouse','up');
    const result=evaluate('return {trace:window.artTrace,selected:[...document.querySelectorAll(".field.me .attack-selected")].map(card=>Number(card.dataset.fid)),image:!!document.querySelector(".field.me [data-fid=\\"102\\"] img")};');
    assert.deepEqual(result.selected,[102],`${width}: art arrival swallowed the native click`);
    assert.ok(result.trace.some(([type,id])=>type==='click'&&id==='102'));
    assert.ok(result.image,`${width}: deferred artwork never appeared`);
  }
  console.log('Artwork click regression passed: delayed Scryfall response preserves native press/release selection and then updates artwork at desktop and landscape sizes.');
} finally {run('close');}
