#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROJECT_ID = '38e28ae4-0169-4b3e-a2bb-5e5d70bb73e3';
export const REPOSITORY = 'Tiesdemaestro/apphub';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function validatePublishPath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') ||
      path.split('/').some(part => !part || part === '..' || part === '.')) return false;
  return !path.split('/').some(part => /^\.env(?:\.|$)|^\.git$|^\.expo$|^node_modules$|^credentials\.json$|\.(?:p12|p8|pem|key|mobileprovision)$/i.test(part));
}

function command(bin, args, { capture = false, optional = false } = {}) {
  const result = spawnSync(bin, args, { cwd: root, encoding: 'utf8', stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit', maxBuffer: 8 * 1024 * 1024 });
  if (!optional && result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${bin} ${args[0] || ''} is niet geslaagd. Los de bovenstaande melding op en start hetzelfde commando opnieuw.`);
  }
  return result;
}
const git = (...args) => command('git', args, { capture: true }).stdout.trim();
const eas = (...args) => command('npx', ['--yes', 'eas-cli@latest', ...args]);
const readJSON = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

function prerequisites() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Installeer Node.js 24 via https://nodejs.org/en/download.');
  for (const tool of ['git', 'gh', 'npm']) {
    if (command(tool, ['--version'], { capture: true, optional: true }).status !== 0) {
      throw new Error(`${tool} ontbreekt. Git: xcode-select --install. GitHub CLI: https://cli.github.com. Node/npm: https://nodejs.org/en/download.`);
    }
  }
}

function ensureGitHubLogin() {
  if (command('gh', ['auth', 'status', '-h', 'github.com'], { capture: true, optional: true }).status !== 0) {
    command('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--scopes', 'repo,workflow']);
  }
  const user = JSON.parse(command('gh', ['api', 'user'], { capture: true }).stdout);
  if (user.login.toLowerCase() !== 'tiesdemaestro') throw new Error('Meld je bij GitHub aan als Tiesdemaestro; er is niets gepubliceerd.');
  command('gh', ['auth', 'setup-git', '--hostname', 'github.com']);
  return user;
}

function ensureExpoLogin() {
  if (command('npx', ['--yes', 'eas-cli@latest', 'whoami'], { capture: true, optional: true }).status !== 0) eas('login');
  const status = JSON.parse(command('npx', ['--yes', 'eas-cli@latest', 'project:status', '--json', '--non-interactive', '--limit', '1'], { capture: true }).stdout);
  const app = readJSON('app.json');
  if (app.expo?.extra?.eas?.projectId !== PROJECT_ID || status.project?.id !== PROJECT_ID || status.project.slug !== app.expo.slug || typeof status.project.account !== 'string' || !status.project.account) {
    throw new Error('Onverwachte Expo-projectkoppeling. Stop vóór een build; stuur de melding terug.');
  }
  app.expo.owner = status.project.account;
  writeFileSync(resolve(root, 'app.json'), JSON.stringify(app, null, 2) + '\n');
  console.log(`Expo-project geverifieerd: ${status.project.fullName} (${PROJECT_ID}).`);
  // Only persist the account returned by the authenticated EAS project query.
}

function checkBuild() {
  console.log('Afhankelijkheden installeren en de app controleren.');
  command('npm', [existsSync(resolve(root, 'package-lock.json')) ? 'ci' : 'install']);
  command('npx', ['expo', 'install', '--fix']);
  command('npm', ['run', 'check']);
  command('npx', ['--yes', 'expo-doctor@latest']);
  command('npm', ['run', 'bundle:ios']);
}

function stageProject(user) {
  const listed = readJSON('setup-files.json');
  const files = [...new Set([...listed, 'setup-files.json', 'package-lock.json'])];
  for (const path of files) {
    if (!validatePublishPath(path)) throw new Error(`Bestand niet toegestaan voor publiceren: ${path}`);
    const file = resolve(root, path);
    if (!existsSync(file) || !lstatSync(file).isFile() || realpathSync(file) !== file) throw new Error(`Bestand ontbreekt of is een symlink: ${path}`);
  }
  if (!existsSync(resolve(root, '.git'))) command('git', ['init', '-b', 'main']);
  if (realpathSync(git('rev-parse', '--show-toplevel')) !== realpathSync(root)) throw new Error('De projectmap moet een eigen Git-repository zijn.');
  const allowed = new Set(files);
  for (const file of git('ls-files', '-z').split('\0').filter(Boolean)) {
    if (!allowed.has(file)) throw new Error(`Onverwacht gevolgd bestand: ${file}. Controleer dit vóór openbaar publiceren.`);
  }
  command('git', ['add', '--', ...files]);
  const changed = command('git', ['diff', '--cached', '--quiet'], { capture: true, optional: true });
  if (changed.status === 1) {
    command('git', ['-c', `user.name=${user.login}`, '-c', `user.email=${user.id}+${user.login}@users.noreply.github.com`, 'commit', '-m', 'Prepare AppHub and link Expo project']);
  } else if (changed.status !== 0) throw new Error('Git kon de wijzigingen niet controleren.');
}

function publishRepository() {
  const expected = `https://github.com/${REPOSITORY}.git`;
  const remote = command('git', ['remote', 'get-url', 'origin'], { capture: true, optional: true });
  if (remote.status === 0 && ![expected, expected.slice(0, -4), `git@github.com:${REPOSITORY}.git`].includes(remote.stdout.trim())) {
    throw new Error('Deze map heeft al een andere origin. Er is niets naar die repository gepusht.');
  }
  const existing = command('gh', ['api', `repos/${REPOSITORY}`], { capture: true, optional: true });
  if (existing.status !== 0) {
    if (!/HTTP 404/.test(existing.stderr || '')) throw new Error('GitHub is niet bereikbaar of toegang ontbreekt. Repository niet aangemaakt.');
    command('gh', ['repo', 'create', REPOSITORY, '--public', '--description', 'AppHub: iPhone-host en bouwskill voor eigen mini-apps']);
  } else {
    if (JSON.parse(existing.stdout).private) throw new Error('De bestaande repository is privé. De zichtbaarheid wordt niet automatisch gewijzigd.');
    // An unrelated existing repository is never adopted by name alone.
    if (remote.status !== 0) {
      const refs = command('gh', ['api', `repos/${REPOSITORY}/git/matching-refs/heads/`], { capture: true });
      if (JSON.parse(refs.stdout).length) throw new Error('Er bestaat al een gevulde apphub-repository. Laat eerst de inhoud vergelijken; er is niets overschreven.');
    }
  }
  if (remote.status !== 0) command('git', ['remote', 'add', 'origin', expected]);
  command('git', ['push', '--set-upstream', 'origin', 'HEAD:main']);
}

function publishPages() {
  const endpoint = `repos/${REPOSITORY}/pages`;
  const current = command('gh', ['api', endpoint], { capture: true, optional: true });
  if (current.status !== 0) {
    if (!/HTTP 404/.test(current.stderr || '')) throw new Error('GitHub Pages-instellingen konden niet worden gelezen.');
    command('gh', ['api', '--method', 'POST', endpoint, '-f', 'build_type=workflow']);
  } else if (JSON.parse(current.stdout).build_type !== 'workflow') {
    throw new Error('Bestaande Pages-configuratie wordt niet automatisch gewijzigd. Kies Settings > Pages > Source: GitHub Actions.');
  }
  command('gh', ['workflow', 'run', 'pages.yml', '--repo', REPOSITORY, '--ref', 'main']);
  console.log(`Publicatie aangevraagd. Controleer de uitkomst: https://github.com/${REPOSITORY}/actions`);
  console.log('Na een geslaagde Pages-run staat het voorbeeld op https://tiesdemaestro.github.io/apphub/wardrobe/');
}

export function main(mode = 'setup') {
  if (!['setup', 'testflight', 'simulator'].includes(mode)) throw new Error('Gebruik: bash Start-AppHub.command [setup|simulator|testflight]');
  prerequisites();
  if (mode === 'setup') {
    const user = ensureGitHubLogin();
    checkBuild();
    ensureExpoLogin();
    stageProject(user);
    publishRepository();
    publishPages();
    console.log('Volgende stap: bash Start-AppHub.command simulator (zonder Apple-signing), of testflight (actief Apple-lidmaatschap nodig).');
  } else {
    if (!existsSync(resolve(root, 'package-lock.json'))) throw new Error('Voer eerst bash Start-AppHub.command uit.');
    ensureExpoLogin();
    command('npm', ['run', 'check']);
    command('npm', ['run', 'bundle:ios']);
    if (mode === 'simulator') {
      eas('build', '--platform', 'ios', '--profile', 'simulator');
    } else {
      console.log('Eigen TestFlight-build. Apple-aanmelding gebeurt in de officiële EAS CLI. Dit publiceert niet in de App Store.');
      eas('build', '--platform', 'ios', '--profile', 'testflight', '--auto-submit-with-profile', 'testflight');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv[2]); } catch (error) {
    console.error(`\nGestopt: ${error.message}`);
    process.exitCode = 1;
  }
}
