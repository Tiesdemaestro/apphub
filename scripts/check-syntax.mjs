#!/usr/bin/env node
import { createRequire } from 'node:module';
import { readdirSync,readFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
const ts=createRequire(import.meta.url)('typescript');
let count=0,errors=0;
function scan(path){for(const entry of readdirSync(path,{withFileTypes:true})){if(['node_modules','.git','dist-pages','dist','skills'].includes(entry.name))continue;const file=join(path,entry.name);if(entry.isDirectory()){scan(file);continue;}if(!/\.tsx?$/.test(file)||/\.d\.ts$/.test(file))continue;const result=ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,isolatedModules:true}});count++;for(const d of result.diagnostics||[])if(d.category===ts.DiagnosticCategory.Error){errors++;console.error(file,ts.flattenDiagnosticMessageText(d.messageText,'\n'));}}}
scan(resolve('.'));console.log(`${count} TS/TSX-bestanden; ${errors} syntaxfouten. Dit vervangt geen volledige typecheck.`);process.exitCode=errors?1:0;
