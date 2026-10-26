import test from 'node:test';
import assert from 'node:assert/strict';
import {config} from './config.mjs';
import {validateItems,validateDocument,exportBackup,importBackup,dayKey,recentDays,toggleDay,validDay} from './domain.mjs';
const item=()=>({id:'one',title:'<img src=x onerror=alert(1)>',detail:'Een eigen notitie',status:config.states[0].value,date:'',days:[],updatedAt:'2026-10-26T12:00:00Z'});
test(config.kind+': backup round trip and wrong project rejection',()=>{
 const items=[item()];assert.deepEqual(importBackup(exportBackup(items)),items);
 const foreign=JSON.parse(exportBackup(items));foreign.project='another-app';assert.throws(()=>importBackup(JSON.stringify(foreign)));
});
test(config.kind+': reject corruption, duplicate IDs and invalid status without resetting stored data',()=>{
 assert.deepEqual(validateDocument(undefined).items,[]);
 assert.throws(()=>validateDocument({schemaVersion:1,revision:0,items:null}));
 assert.throws(()=>validateItems([item(),item()]));
 assert.throws(()=>validateItems([{...item(),status:'unknown'}]));
 assert.throws(()=>validateItems([{...item(),days:['2026-02-30']}]));
 assert.throws(()=>importBackup('x'.repeat(2000001)));
});
test(config.kind+': calendar uses local date, crosses month and supports undo',()=>{
 const date=new Date(2026,2,1,0,10);
 assert.equal(dayKey(date),'2026-03-01');assert.deepEqual(recentDays(date),['2026-02-23','2026-02-24','2026-02-25','2026-02-26','2026-02-27','2026-02-28','2026-03-01']);
 assert.equal(validDay('2026-02-30'),false);
 assert.deepEqual(toggleDay(toggleDay([],'2026-03-01'),'2026-03-01'),[]);
});
test(config.kind+': only project-specific fields accepted',()=>{
 const record=item();
 if(config.kind==='habits')assert.deepEqual(validateItems([{...record,days:['2026-10-26']}])[0].days,['2026-10-26']);
 else assert.throws(()=>validateItems([{...record,days:['2026-10-26']}]));
 if(config.kind==='tasks')assert.equal(validateItems([{...record,date:'2026-10-27'}])[0].date,'2026-10-27');
 else assert.throws(()=>validateItems([{...record,date:'2026-10-27'}]));
});
