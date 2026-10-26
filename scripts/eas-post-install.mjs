import { spawnSync } from 'node:child_process';
if(process.env.EAS_BUILD_PROFILE==='production'){
 const result=spawnSync(process.execPath,['scripts/check-store-readiness.mjs'],{stdio:'inherit'});
 process.exit(result.status??1);
}
