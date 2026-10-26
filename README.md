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

## Starten

Open Terminal in deze map en voer uit:

```bash
bash Start-AppHub.command
```

Het script gebruikt Node 24, Git en GitHub CLI. Het laat je officieel inloggen bij GitHub en Expo, installeert dependencies, controleert de app, verifieert het aangeleverde Expo-project, maakt `Tiesdemaestro/apphub` openbaar aan, uploadt de broncode en vraagt Pages-publicatie aan. Het publiceert alleen de bestanden uit `setup-files.json` plus de lockfile. Een bestaande andere repository of privé-instelling wordt niet overschreven. Bij een fout stopt het script met de melding; zie [STARTEN](docs/STARTEN.md).

Expo-project-ID: `38e28ae4-0169-4b3e-a2bb-5e5d70bb73e3`. Voorlopige slug: `ties-oosterman`, overgenomen uit jouw aanmaakcommando. Het script controleert deze tegen Expo voordat het verdergaat. De zichtbare appnaam blijft AppHub.

## Testen op je iPhone

Deze app gebruikt SDK 58. De App Store-versie van Expo Go ondersteunt die niet; gebruik een eigen testbuild. Na de geslaagde setup:

```bash
bash Start-AppHub.command testflight
```

Dit bouwt via EAS en uploadt naar jouw App Store Connect-account. Een actief Apple Developer-lidmaatschap en jouw Apple-aanmelding zijn nodig. Voeg daarna jezelf toe aan de interne TestFlight-testgroep; dat publiceert de app niet in de App Store. Een ongepubliceerde simulatorbuild kan vooraf via `bash Start-AppHub.command simulator`, zonder Apple-signing. EAS-gebruik volgt je Expo-abonnement; de simulatorbuild is nog geen iPhone-toesteltest.

Bron: [Expo Go-versieverschillen](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/). De oorspronkelijke gratis Expo Go-instructie voor deze versie is hiermee vervangen.

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
