# AppHub testen op je iPhone

## Eerst via Expo Go

Een betaald Apple Developer-lidmaatschap is hiervoor niet nodig. Installeer **Expo Go** op je iPhone en **Node.js 24** op je Mac. Gebruik dezelfde wifi en hetzelfde gratis Expo-account op beide apparaten.

Open Terminal in de uitgepakte map `apphub`, bij `package.json` (in de projectwerkruimte: `build/apphub`):

```bash
npm install
npx expo install --fix
npx expo-doctor
npx expo login
npm start
```

`npm start` gebruikt `expo start --go`. Log ook in Expo Go in en scan de QR-code met je iPhone-camera. Houd Terminal open. `npm run start:dev` is voor een eigen development build, niet voor deze eerste test.

**Versies:** het pakket richt zich op Expo SDK 58. Expo Go op een echte iPhone moet die SDK ondersteunen. Rond installatie en de twee Expo-controles eerst af. Bij een versiemelding moeten de project-SDK en afhankelijkheden overeenkomen met de ondersteunde versie. Een andere QR-code lost dat niet op. Volg de [Expo-upgradehandleiding](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).

## Een webproject toevoegen

1. Open in AppHub **Project toevoegen**.
2. Plak een publieke HTTPS-projectlink, `eigenaar/repository` of de inhoud van een schema-v3-`apphub.json`.
3. Controleer de maker, opslag, gegevensverwerking en leeftijd; bevestig en open het project.

Een GitHub-repository moet `apphub.json` in de hoofdmap van de standaardbranch bevatten. Het manifest wijst met `startUrl` naar de **gepubliceerde website**, bijvoorbeeld GitHub Pages. De importer publiceert of compileert geen repository.

De voorbeelden in `web-projects/template` en `web-projects/wardrobe` staan lokaal. Publiceer ze eerst op HTTPS en vul de echte URLs, uitgever en contactgegevens in. De meegeleverde URL-placeholders werken niet als hosting.

## Wat je test

- Webproject openen, invoer opslaan, sluiten en opnieuw openen.
- Foto kiezen via de bestandskiezer van het webproject.
- Een foutieve URL en een link buiten het project: duidelijke melding.
- Gegevens **vanuit het webproject zelf** exporteren en herstellen.
- **Native bibliotheek:** Kledingkast, Notities, schema-v2-projecten en de afzonderlijke native back-up.

De export in de hoofdinstellingen bevat alleen de webprojectlijst. Websitegegevens en foto's horen daar niet bij. Projecten op dezelfde origin delen browseropslag; verschillende GitHub Pages-mappen zijn geen beveiligingsgrens.

## Daarna een eigen build

Voer na installatie `npm run check` en `npm run bundle:ios` uit. Voor lokaal compileren is volledige Xcode nodig; gebruik `npm run ios` voor de simulator of `npm run ios -- --device` voor een aangesloten iPhone met jouw signingconfiguratie.

**Nog te verifiëren:** dependency-installatie, SDK/Expo Go-combinatie en toestelgedrag. De bouwomgeving had `ENOTFOUND` bij de npm-registry; er is geen bevestigde native build of Apple-goedkeuring. Actuele controles staan in [VALIDATIE.md](VALIDATIE.md). Publicatie volgt pas na [APP_STORE_GATES.md](APP_STORE_GATES.md).

Bron: [Expo starten op een toestel](https://docs.expo.dev/get-started/start-developing/).
