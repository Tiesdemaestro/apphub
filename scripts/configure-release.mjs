#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_VARIABLES = [
  'APPHUB_BUNDLE_ID',
  'APPHUB_APPLE_TEAM_ID',
  'EXPO_PUBLIC_SUPPORT_URL',
  'EXPO_PUBLIC_PRIVACY_URL',
];

const placeholder = /(?:example|placeholder|yourdomain|jouwdomein|jouworganisatie|changeme)/i;

export function validateReleaseEnvironment(env = process.env) {
  const errors = [];
  for (const name of RELEASE_VARIABLES) {
    if (!env[name]?.trim()) errors.push(`${name} ontbreekt.`);
    else if (env[name] !== env[name].trim()) errors.push(`${name} bevat witruimte aan het begin of einde.`);
  }
  const bundleID = env.APPHUB_BUNDLE_ID?.trim();
  if (bundleID && (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+){2,}$/.test(bundleID) || placeholder.test(bundleID))) {
    errors.push('APPHUB_BUNDLE_ID moet een eigen Bundle ID zijn, bijvoorbeeld de omgekeerde schrijfwijze van je domein met een appnaam.');
  }
  const teamID = env.APPHUB_APPLE_TEAM_ID?.trim();
  if (teamID && (!/^[A-Z0-9]{10}$/.test(teamID) || /^(?:ABCDE12345|XXXXXXXXXX|JOUWTEAMID|YOURTEAMID)$/.test(teamID))) {
    errors.push('APPHUB_APPLE_TEAM_ID moet je echte Apple Team ID van tien hoofdletters/cijfers zijn.');
  }
  for (const name of ['EXPO_PUBLIC_SUPPORT_URL', 'EXPO_PUBLIC_PRIVACY_URL']) {
    if (!env[name]?.trim()) continue;
    try {
      const url = new URL(env[name]);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') ||
          /(?:^|\.)(?:localhost|local|test|invalid|example)$/.test(url.hostname) ||
          placeholder.test(url.hostname) || /^\d+(?:\.\d+){3}$/.test(url.hostname) || url.hostname.includes(':')) {
        throw new Error('invalid');
      }
    } catch {
      errors.push(`${name} moet een openbare HTTPS-URL op je eigen echte domein zijn, zonder inloggegevens.`);
    }
  }
  return errors;
}

export function printErrors(errors) {
  console.error('Releasecontrole niet geslaagd:');
  for (const error of errors) console.error(`- ${error}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--help')) {
    console.log(`Stel deze omgevingsvariabelen in en voer dit script opnieuw uit:\n${RELEASE_VARIABLES.join('\n')}\n\nZie docs/APPLE_PUBLICATIE.md. Het script schrijft geen bestanden of sleutels.`);
  } else {
    const errors = validateReleaseEnvironment();
    if (errors.length) {
      printErrors(errors);
      process.exitCode = 1;
    } else {
      console.log('De vier vereiste releasewaarden hebben een geldig formaat.');
      console.log('Er zijn geen bestanden geschreven of accounts gewijzigd.');
      console.log('Voer nu node scripts/release-check.mjs uit. Domeinbereikbaarheid en accountrechten moeten apart worden gecontroleerd.');
    }
  }
}
