import test from 'node:test';
import assert from 'node:assert/strict';
import { addWebProject, readWebLibrary, recoverWebLibrary, WEB_LIBRARY_KEY, WEB_RECOVERY_KEY } from '../src/web/registry.ts';
const manifest = {schemaVersion:3 as const,kind:'web' as const,id:'test-app',name:'Test',description:'Testproject',version:'1.0.0',startUrl:'https://test.example.org/app/',storage:'local' as const,allowedOrigins:['https://test.example.org'],privacyUrl:'https://test.example.org/app/privacy.html',supportUrl:'https://test.example.org/app/support.html',ageRating:'4+' as const,dataCollected:[],permissions:[] as []};
test('web registry preserves consent-relevant metadata and flags on restart',()=>{
  const entries=addWebProject([],manifest);entries[0].blocked=true;entries[0].favorite=true;
  assert.deepEqual(readWebLibrary(JSON.stringify(entries)),entries);
  assert.throws(()=>addWebProject(entries,manifest),/al toegevoegd/);
});
test('corrupt web registry fails closed instead of becoming an empty list',()=>{
  assert.throws(()=>readWebLibrary('{broken'));assert.throws(()=>readWebLibrary('{}'));
  assert.throws(()=>readWebLibrary(JSON.stringify([{manifest,addedAt:'now',favorite:false,blocked:false}])));
});
test('recovery preserves raw data before starting a fresh library',async()=>{
  const map=new Map([[WEB_LIBRARY_KEY,'{broken']]);const backend={async getItem(k:string){return map.get(k)??null;},async setItem(k:string,v:string){map.set(k,v);}};
  await recoverWebLibrary(backend);assert.equal(map.get(WEB_RECOVERY_KEY),'{broken');assert.equal(map.get(WEB_LIBRARY_KEY),'[]');
});
test('failed recovery backup cannot overwrite the original library',async()=>{
  let changed=false;await assert.rejects(recoverWebLibrary({async getItem(){return '{broken';},async setItem(k){if(k===WEB_RECOVERY_KEY)throw new Error('full');changed=true;}}));assert.equal(changed,false);
});
