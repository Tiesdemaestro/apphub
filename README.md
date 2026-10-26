# AppHub 1.1

Een iPhone-host voor zelfgemaakte software: voeg een publieke GitHub Pages-/website-URL of een AppHub-projectbestand toe, bekijk de gegevens en open het project binnen AppHub.

## Wat zit erin?

- Webprojectbibliotheek: import, zoeken, favorieten, toestemming, blokkeren, herkomst en privacygegevens.
- WebView voor daadwerkelijke HTML/CSS/JavaScript-projecten. Geen eigen JavaScript-naar-native brug.
- Native bibliotheek uit de vorige versie behouden: kledingkast, notities, schema-v2-projecten, privé-GitHub en back-ups.
- Zelfstandige webkledingkast met foto's, outfits, IndexedDB en JSON-back-up/herstel.
- Zelfstandige notitietemplate en skill `build-apphub-project` om software te maken of gericht om te zetten.
- Technische validator, scaffolder, tests en handmatig te starten GitHub Pages-workflow.

**Status:** broncode en technische controles. Geen ondertekende iPhone-installatie, live gehoste demo of App Store-goedkeuring. Zie [VALIDATIE](docs/VALIDATIE.md).

## Testen op je iPhone

Gebruik Node 24. Deze versie richt zich op Expo SDK 58, passend bij de huidige Expo Go-versie. Download Expo Go op je iPhone.

```bash
npm install
npx expo install --fix
npm run check
npx expo-doctor
npx expo login
npm start
```

Meld je in Expo Go aan met hetzelfde Expo-account. Scan de QR-code. Deze route heeft geen eigen betaald Apple Developer-account of lokale Xcode nodig, maar vereist wel een werkende dependency-installatie en ontwikkelserver. Volledige dependencycontrole kon hier nog niet worden uitgevoerd. Bij een latere Expo Go-versie moet de SDK opnieuw worden afgestemd.

## Je kledingproject online zetten

1. Zet de inhoud van deze map in jouw GitHub-repository.
2. Kies **Settings → Pages → Source: GitHub Actions**.
3. Start **Actions → Publish AppHub examples → Run workflow**.
4. Gebruik de URL uit de workflow, met `/wardrobe/` erachter, in AppHub.

De workflow stelt de project-URL's automatisch in. Een URL bestaat pas nadat publiceren is gelukt. De map `web-projects` bevat ook privacy- en hulppagina's die je vóór publieke verspreiding aanvult met je eigen contactgegevens.

## Software maken of omzetten

Gebruik de projectskill in `skills/build-apphub-project`. Een AI-agent leest eerst `SKILL.md`; de skill is nog niet globaal geïnstalleerd. Of maak direct een basisproject:

```bash
node scripts/create-web-project.mjs ../mijn-project --id mijn-project --name "Mijn project" --url https://jouwnaam.github.io/mijn-project/
node scripts/check-web-project.mjs ../mijn-project --json
```

De skill kan een bestaand webproject aanpassen of functies uit andere software opnieuw implementeren. Willekeurige Python-, Swift- of servercode wordt niet automatisch iPhone-code. Het controleverslag onderscheidt technische fouten van handmatige reviewpunten. Lees [PROJECTEN_MAKEN](docs/PROJECTEN_MAKEN.md).

## Opslag en grenzen

Webprojecten slaan gegevens zelf op, lokaal of bij hun eigen cloudservice. AppHub levert geen nieuwe cloudaccount/backend. De voorbeelden bewaren alles lokaal en bieden export. Projecten op hetzelfde webdomein delen browseropslag; verschillende GitHub Pages-repomappen zijn geen beveiligingsgrens. De projectlijst-back-up bevat geen websitegegevens. Native back-ups blijven afzonderlijk beschikbaar.

De navigatiecontrole begrenst paginaovergangen, niet alle netwerkverzoeken. URL-controle is geen DNS-/SSRF-beveiliging. De maker kan live websitecode wijzigen zonder een nieuwe manifestimport. Importeer alleen software van makers die je vertrouwt. AppHub belooft geen veilige sandbox voor willekeurige code.

## Publieke release

Zie [APP_STORE_GATES](docs/APP_STORE_GATES.md). `npm run check:store` blijft rood totdat onder meer toesteltest, moderatie, leeftijdstoegang, universal links, privacy en uitgeversgegevens zijn uitgewerkt en bewijs is geregistreerd. De productiebuild voert die controle ook uit. Vul het dossier uitsluitend met werkelijk uitgevoerd werk; een ingevuld dossier is geen goedkeuring door Apple.
