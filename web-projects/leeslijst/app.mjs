import { config } from './config.mjs';
import { dayKey, recentDays, toggleDay, exportBackup, importBackup } from './domain.mjs';
import { loadDocument, saveDocument } from './storage.mjs';
const $ = id => document.getElementById(id);
let data = {revision:0,items:[]}, ready=false, busy=false, editingId=null;
function node(tag,text,className) { const el=document.createElement(tag); el.textContent=text; if(className)el.className=className; return el; }
function showError(error) {$('error').textContent=error instanceof Error?error.message:'Er ging iets mis.'; $('error').hidden=false;}
function lock(value) {
  busy=value; $('editor').disabled=value||!ready;
  document.querySelectorAll('button').forEach(button=>button.disabled=value||!ready);
  $('retry').disabled=value;
}
function reset() {editingId=null; $('item-form').reset(); $('editor-title').textContent=config.newLabel; $('cancel').hidden=true;}
function dirty() {
  const original=data.items.find(i=>i.id===editingId);
  return $('title').value!==(original?.title??'') || $('detail').value!==(original?.detail??'')
    || $('item-state').value!==(original?.status??config.states[0].value) || $('date').value!==(original?.date??'');
}
function edit(item) {
  if(dirty()&&!confirm('Niet-opgeslagen invoer weggooien?'))return;
  editingId=item.id; $('title').value=item.title; $('detail').value=item.detail; $('item-state').value=item.status; $('date').value=item.date;
  $('editor-title').textContent='Bewerken'; $('cancel').hidden=false; $('title').focus(); window.scrollTo({top:0,behavior:'smooth'});
}
function action(label,handler,className='secondary') {
  const button=node('button',label,className); button.type='button'; button.addEventListener('click',handler); return button;
}
function render() {
  const today=dayKey(), days=recentDays(), query=$('search').value.toLocaleLowerCase('nl'), filter=$('filter').value;
  const filtered=data.items.filter(item=>(item.title+' '+item.detail).toLocaleLowerCase('nl').includes(query)
    && (filter==='all'||(config.kind==='habits'?((filter==='done')===item.days.includes(today)):item.status===filter)));
  $('items').replaceChildren(); $('count').textContent=String(filtered.length);
  $('empty').hidden=!ready||filtered.length!==0;
  $('empty').textContent=data.items.length?'Geen resultaten voor deze selectie.':config.empty;
  const done=data.items.filter(i=>config.kind==='habits'?i.days.includes(today):i.status==='done').length;
  $('summary').textContent=config.kind==='habits'?done+' van '+data.items.length+' vandaag gedaan':done+' afgerond · '+data.items.length+' totaal';
  for(const item of filtered) {
    const card=node('article','','note'); card.append(node('h3',item.title));
    if(item.detail)card.append(node('p',item.detail));
    if(config.kind==='habits') {
      const week=node('div','','week'); week.setAttribute('aria-label','Laatste zeven dagen');
      for(const day of days){const checked=item.days.includes(day);const stamp=node('span',day.slice(8)+(checked?' ✓':' ·'),checked?'checked':'');stamp.title=day;week.append(stamp);}
      card.append(week,node('p',days.filter(d=>item.days.includes(d)).length+' / 7 dagen gedaan','hint'));
    } else {
      const status=config.states.find(s=>s.value===item.status).label;
      card.append(node('p',status+(item.date?' · '+item.date.split('-').reverse().join('-'):''),'badge'));
      if(item.date && item.date<today && item.status!=='done')card.append(node('p','Datum verstreken','overdue'));
    }
    const buttons=node('div','','actions');
    if(config.kind==='habits')buttons.append(action(item.days.includes(today)?'Vandaag ongedaan':'Vandaag gedaan',()=>void run(async()=>{
      const day=dayKey();
      await commit(data.items.map(i=>i.id===item.id?{...i,days:toggleDay(i.days,day),updatedAt:new Date().toISOString()}:i));
    })));
    else buttons.append(action(config.kind==='books'?(item.status==='want'?'Begin met lezen':item.status==='reading'?'Uitgelezen':'Opnieuw lezen'):(item.status==='done'?'Heropenen':'Afronden'),()=>void run(async()=>{
      const status=config.kind==='books'?(item.status==='want'?'reading':item.status==='reading'?'done':'reading'):(item.status==='done'?'open':'done');
      await commit(data.items.map(i=>i.id===item.id?{...i,status,updatedAt:new Date().toISOString()}:i));
      if(editingId===item.id)$('item-state').value=status;
    })));
    buttons.append(action('Bewerken',()=>edit(item)),action('Verwijderen',()=>void run(async()=>{
      if(!confirm('“'+item.title+'” verwijderen?'))return;
      await commit(data.items.filter(i=>i.id!==item.id)); if(editingId===item.id)reset();
    }),'danger')); card.append(buttons); $('items').append(card);
  }
  lock(busy);
}
async function commit(items) {data=await saveDocument(items,data.revision); render(); $('status').textContent='Bewaard op dit apparaat';}
async function run(fn) {
  if(busy||!ready)return; lock(true); $('error').hidden=true;
  try{await fn();}catch(error){showError(error);$('retry').hidden=false;}finally{lock(false);}
}
async function load() {
  if(busy)return;
  if(ready && dirty() && !confirm('Opnieuw laden en niet-opgeslagen invoer weggooien?'))return;
  ready=false;lock(true);$('retry').hidden=true;$('error').hidden=true;
  try{data=await loadDocument();ready=true;reset();render();$('status').textContent='Lokaal bewaard · geen account nodig';}
  catch(error){showError(error);$('retry').hidden=false;$('status').textContent='Je eerdere gegevens zijn niet overschreven.';}
  finally{lock(false);}
}
document.title=config.name; document.body.dataset.kind=config.kind;
$('name').textContent=config.name; $('intro').textContent=config.intro;
$('title-label').textContent=config.titleLabel; $('title').placeholder=config.placeholder;
$('detail-label').textContent=config.detailLabel; $('date-field').hidden=config.kind!=='tasks';
$('state-field').hidden=config.kind==='habits';
for(const state of config.states){const option=node('option',state.label);option.value=state.value;$('item-state').append(option);}
$('filter').append(Object.assign(node('option','Alles'),{value:'all'}));
for(const state of config.kind==='habits'?[{value:'open',label:'Vandaag nog doen'},{value:'done',label:'Vandaag gedaan'}]:config.states){
  $('filter').append(Object.assign(node('option',state.label),{value:state.value}));
}
reset();
$('item-form').addEventListener('submit',event=>{event.preventDefault();void run(async()=>{
  const existing=data.items.find(i=>i.id===editingId);
  const item={id:editingId??'item-'+Date.now()+'-'+Math.random().toString(36).slice(2,10),title:$('title').value.trim(),detail:$('detail').value,
    status:$('item-state').value,date:$('date').value,days:existing?.days??[],updatedAt:new Date().toISOString()};
  await commit([item,...data.items.filter(i=>i.id!==item.id)]);reset();
});});
$('cancel').addEventListener('click',()=>{if(!dirty()||confirm('Niet-opgeslagen invoer weggooien?'))reset();});
$('retry').addEventListener('click',()=>void load());
$('search').addEventListener('input',render);$('filter').addEventListener('change',render);
$('export').addEventListener('click',()=>{
  try{$('backup-text').value=exportBackup(data.items);$('backup-text').readOnly=true;$('backup').hidden=false;$('copy').hidden=false;$('restore').hidden=true;}
  catch(error){showError(error);}
});
$('import').addEventListener('click',()=>{$('backup-text').value='';$('backup-text').readOnly=false;$('backup').hidden=false;$('copy').hidden=true;$('restore').hidden=false;$('backup-text').focus();});
$('restore').addEventListener('click',()=>void run(async()=>{
  const items=importBackup($('backup-text').value);
  if(!confirm('Je huidige '+data.items.length+' items vervangen door '+items.length+' items? Niet-opgeslagen invoer gaat verloren.'))return;
  await commit(items);reset();$('backup-text').value='';$('backup').hidden=true;
}));
$('copy').addEventListener('click',async()=>{
  const field=$('backup-text');field.focus();field.select();field.setSelectionRange(0,field.value.length);
  try{await navigator.clipboard.writeText(field.value);$('status').textContent='Back-up gekopieerd. Bewaar hem buiten deze app.';}
  catch{$('status').textContent='Selecteer de tekst en kies Kopieer in het tekstmenu.';}
});
$('clear').addEventListener('click',()=>void run(async()=>{
  if(!confirm('Alle items verwijderen? Maak eerst een back-up als je ze wilt bewaren.'))return;
  await commit([]);reset();$('backup-text').value='';$('backup').hidden=true;
}));
window.addEventListener('beforeunload',event=>{if(busy||dirty()){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ready)render();});
void load();
