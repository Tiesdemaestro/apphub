#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const required=['device-test','moderation-reporting-response','objectionable-content-filtering','abusive-user-blocking','software-index-universal-links','age-access-enforcement','privacy-consent-and-deletion','native-api-review-4-7-2','support-privacy-publisher','payments-and-export-compliance'];
try {
 const input=JSON.parse(readFileSync(new URL('../release-readiness.json',import.meta.url),'utf8'));
 if(input.schemaVersion!==1||!Array.isArray(input.checks))throw new Error('Ongeldig reviewdossier.');
 const missing=required.filter(id=>{const entries=input.checks.filter(c=>c.id===id);return entries.length!==1||entries[0].done!==true||typeof entries[0].evidence!=='string'||entries[0].evidence.trim().length<20;});
 if(missing.length){console.error('Publieke release nog geblokkeerd. Open punten:\n'+missing.map(id=>' - '+id).join('\n'));process.exitCode=1;}
 else console.log('Reviewdossier ingevuld. Dit controleert de volledigheid, niet de waarheid van bewijs of goedkeuring door Apple.');
}catch(error){console.error(error.message);process.exitCode=1;}
