#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { printErrors, validateReleaseEnvironment } from './configure-release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = validateReleaseEnvironment();
if (Number(process.versions.node.split('.')[0]) < 24) errors.push('Gebruik Node.js 24 of nieuwer om app.config.ts te controleren.');

if (errors.length) {
  printErrors(errors);
  process.exitCode = 1;
} else {
  try {
    const configPath = resolve(root, 'app.config.ts');
    if (!existsSync(configPath)) throw new Error('config-missing');
    const exported = (await import(pathToFileURL(configPath).href)).default;
    const staticPath = resolve(root, 'app.json');
    const base = existsSync(staticPath) ? JSON.parse(readFileSync(staticPath, 'utf8')).expo ?? {} : {};
    const value = typeof exported === 'function' ? await exported({ config: base, projectRoot: root }) : exported;
    const config = value?.expo ?? value;
    if (!config || typeof config !== 'object') throw new Error('config-shape');

    if (config.ios?.bundleIdentifier !== process.env.APPHUB_BUNDLE_ID) errors.push('app.config.ts gebruikt APPHUB_BUNDLE_ID niet als iOS Bundle ID.');
    if (config.ios?.appleTeamId !== process.env.APPHUB_APPLE_TEAM_ID) errors.push('app.config.ts gebruikt APPHUB_APPLE_TEAM_ID niet als Apple Team ID.');
    if (!config.name || !config.version) errors.push('Appnaam of versienummer ontbreekt in app.config.ts.');
    if (!config.icon && !config.ios?.icon) errors.push('Geen appicoon geconfigureerd in app.config.ts.');

    const assets = [];
    const addAsset = (label, path) => {
      if (typeof path === 'string') assets.push({ label, path });
      else if (path && typeof path === 'object') {
        for (const [key, nested] of Object.entries(path)) addAsset(`${label}.${key}`, nested);
      }
    };
    addAsset('icon', config.icon);
    addAsset('ios.icon', config.ios?.icon);
    addAsset('splash.image', config.splash?.image);
    addAsset('ios.splash.image', config.ios?.splash?.image);
    for (const plugin of config.plugins ?? []) {
      if (Array.isArray(plugin) && plugin[0] === 'expo-splash-screen') {
        addAsset('expo-splash-screen.image', plugin[1]?.image);
        addAsset('expo-splash-screen.dark.image', plugin[1]?.dark?.image);
      }
    }
    for (const asset of assets) {
      const absolute = resolve(root, asset.path);
      const local = relative(root, absolute);
      if (/^[a-z]+:/i.test(asset.path) || local === '..' || local.startsWith('../') || isAbsolute(local)) {
        errors.push(`${asset.label}: gebruik een lokaal bestand binnen het project.`);
        continue;
      }
      if (!existsSync(absolute) || !statSync(absolute).isFile() || statSync(absolute).size === 0) errors.push(`${asset.label}: asset ontbreekt of is leeg (${asset.path}).`);
    }
    if (!existsSync(resolve(root, 'package-lock.json'))) errors.push('package-lock.json ontbreekt; leg reproduceerbare afhankelijkheden vast.');

    if (errors.length) {
      printErrors(errors);
      process.exitCode = 1;
    } else {
      console.log(`Lokale releaseconfiguratie gecontroleerd; ${assets.length} geconfigureerde assets aanwezig.`);
      console.log('Dit is geen native build, ondertekening, netwerkcontrole of Apple-goedkeuring.');
      console.log('Volgende stap: toesteltest en de publicatiestappen in docs/APPLE_PUBLICATIE.md.');
    }
  } catch {
    console.error('Releasecontrole kon app.config.ts niet veilig laden. Controleer het bestand, installeer afhankelijkheden met npm ci en gebruik Node.js 24.');
    process.exitCode = 1;
  }
}
