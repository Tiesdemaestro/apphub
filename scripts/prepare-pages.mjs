#!/usr/bin/env node
import { readFile, writeFile, mkdir, cp, access } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePublicUrl, validateWebManifest } from '../src/web/contracts.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [baseInput, outputInput='dist-pages']=process.argv.slice(2);
if(!baseInput||baseInput==='--help'){console.log('node scripts/prepare-pages.mjs https://owner.github.io/repo/ [nieuwe-uitvoermap]');process.exit(baseInput?0:1);}
const base=normalizePublicUrl(baseInput.endsWith('/')?baseInput:baseInput+'/');
if(!base)throw new Error('Gebruik een publieke HTTPS-basis-URL zonder query of fragment.');
const output=resolve(outputInput);
let exists=false;try{await access(output);exists=true;}catch{}
if(exists)throw new Error('Uitvoermap bestaat al. Kies een nieuwe map; bestaande bestanden worden niet overschreven.');
await mkdir(output,{recursive:true});
for(const name of ['wardrobe','template']){
 const destination=join(output,name);
 await cp(join(root,'web-projects',name),destination,{recursive:true,filter:source=>!source.includes('/tests')&&!source.endsWith('.test.mjs')&&!source.endsWith('README.md')});
 const manifest=JSON.parse(await readFile(join(destination,'apphub.json'),'utf8'));
 const projectUrl=new URL(name+'/',base).href;
 Object.assign(manifest,{startUrl:projectUrl,allowedOrigins:[new URL(base).origin],privacyUrl:new URL('privacy.html',projectUrl).href,supportUrl:new URL('support.html',projectUrl).href});
 const result=validateWebManifest(manifest);if(!result.ok)throw new Error(result.errors.join('\n'));
 await writeFile(join(destination,'apphub.json'),JSON.stringify(result.value,null,2)+'\n');
}
await writeFile(join(output,'.nojekyll'),'');
await writeFile(join(output,'index.html'),`<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; object-src 'none'"><title>AppHub projecten</title><style>body{font:17px system-ui;background:#f7f6fa;color:#242232;max-width:760px;margin:64px auto;padding:24px;line-height:1.6}h1{font-size:42px;line-height:1.1}a{color:#6358d7}article{background:white;padding:24px;border:1px solid #e5dfef;border-radius:20px;margin:20px 0}small{color:#716b80}</style><p>APPHUB · PROJECTEN</p><h1>Jouw software.<br>Op je eigen manier.</h1><p>Open een voorbeeld in je browser of voeg de projectlink toe in AppHub.</p><article><h2>Kledingkast</h2><p>Kledingfoto’s, outfits en lokale opslag.</p><a href="wardrobe/">Open kledingkast</a> · <a href="wardrobe/apphub.json">Projectbestand</a></article><article><h2>Notities</h2><p>Een basis voor je eigen software.</p><a href="template/">Open notities</a> · <a href="template/apphub.json">Projectbestand</a></article><small>Voorbeelden met lokale browseropslag. Maak regelmatig een export. Technische compatibiliteit is geen App Store-goedkeuring.</small></html>`);
console.log(`Pages-bestanden gereed: ${output}\nKledingproject: ${new URL('wardrobe/',base).href}\nPubliceer deze map voordat je de URL in AppHub gebruikt.`);
