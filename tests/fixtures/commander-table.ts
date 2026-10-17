import '../../src/style.css';
import { createForgeTableView } from '../../src/ui/forgeTable';
const card = (id: number, name: string, controller: number, extra = {}) => ({ id, name, controller, tapped: false, token: false, manaCost: '{2}{G}', typeLine: 'Creature', creature: true, power: 3, toughness: 3, ...extra });
const names = ['Ana', 'Bruno', 'Carla', 'Diego'];
const ids = [10, 23, 36, 49];
const players = ids.map((id, seat) => ({ id, seat, name: names[seat], ai: false, life: 40 - seat * 3, library: 80, handCount: 7,
  hand: seat === 2 ? Array.from({length: 7}, (_, i) => card(300+i, ['Llanowar Elves','Forest','Sol Ring','Cultivate','Beast Within','Rampant Growth','Lightning Greaves'][i], id)) : [card(9000+seat, 'PRIVATE OPPONENT HAND', id)],
  battlefield: [card(100+seat, 'Llanowar Elves', id), card(200+seat, 'Forest', id, {creature:false,land:true,typeLine:'Basic Land — Forest',manaCost:''})],
  graveyard: [card(400+seat, 'Cultivate', id)], exile: [], pool: {},
  commandZone: [card(500+seat, 'Ghalta, Primal Hunger', id)], commanders: [{id:500+seat, name:'Ghalta, Primal Hunger',casts:seat,tax:seat*2}],
  commanderDamage: ids.map((_, index) => ({commanderId:500+index, damage:index===seat?0:index*4})), eliminated: false
}));
const state = { type:'state', config:{format:'commander', matchLength:'bo1',playerCount:4}, you:36, players, turn:5,phase:'MAIN1',activePlayer:36,gameOver:false,log:[],decks:[],stack:[],combat:[],castable:[502],input:{gen:91,priority:true,message:'',ok:{label:'OK',enabled:true},cancel:{label:'',enabled:false},selectable:[],actionable:[502]},events:[] };
const messages: unknown[] = [];
const client = { state, connected:true, send:(message:unknown)=>messages.push(message) };
const view = createForgeTableView(document.querySelector('#table')!, {onExit(){},onRematch(){}});
view.attach(client as any, []);view.render();
Object.assign(window, {fixture:{state,client,view,messages,render:()=>view.render(),attack(){state.phase='COMBAT_DECLARE_ATTACKERS';Object.assign(state.input,{priority:false,attacking:{attackers:[102],defenders:[{id:10,kind:'player'},{id:23,kind:'player'},{id:49,kind:'player'}],legalAssignments:[{attacker:102,defenders:[{id:10,kind:'player'},{id:23,kind:'player'},{id:49,kind:'player'}]}]}});view.render();}}});

Object.assign((window as any).fixture, {
  opening() { Object.assign(state.input, {opening:'starting-player',priority:false,selectablePlayers:ids,actionable:[],ok:{label:'',enabled:false},cancel:{label:'',enabled:false}}); view.render(); },
  stress() {
    const names = ['Llanowar Elves','Elvish Mystic','Fyndhorn Elves','Birds of Paradise','Elvish Visionary','Sakura-Tribe Elder','Wood Elves','Reclamation Sage','Eternal Witness','Solemn Simulacrum','Beast Whisperer','Llanowar Visionary','Ghalta, Primal Hunger','Garruk’s Packleader','Terastodon','Acidic Slime','Avenger of Zendikar','Rampaging Baloths','Scavenging Ooze','Tireless Tracker','Courser of Kruphix','Lotus Cobra'];
    state.players.filter(p=>p.id!==state.you).forEach(p=>{p.battlefield=[...names.map((name,i)=>card(10000+p.id*100+i,name,p.id)),...Array.from({length:12},(_,i)=>card(20000+p.id*100+i,'Saproling',p.id,{token:true,power:1,toughness:1})),...Array.from({length:8},(_,i)=>card(30000+p.id*100+i,'Forest',p.id,{land:true,creature:false,typeLine:'Basic Land — Forest',manaCost:''}))];}); view.render();
  }
});
