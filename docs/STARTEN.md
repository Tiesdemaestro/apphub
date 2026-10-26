# AppHub op je iPhone testen

## Route: een eigen TestFlight-versie

AppHub gebruikt Expo SDK 58. De gewone Expo Go-versie uit de iOS App Store ondersteunt SDK 54; gebruik die niet voor deze versie. We bouwen AppHub via EAS en installeren hem met TestFlight. Hiervoor is een actief Apple Developer-lidmaatschap nodig. Een lokale Xcode-installatie is voor deze cloudroute niet nodig.

1. Pak het startpakket uit. Open Terminal in de map `apphub`, bij `package.json`.
2. Start de begeleide inrichting:

```bash
bash Start-AppHub.command
```

Het script controleert de hulpmiddelen, vraagt waar nodig om GitHub-/Expo-aanmelding, installeert afhankelijkheden, voert bouwcontroles uit en verifieert het bestaande Expo-project. Daarna maakt het de repository aan, uploadt de code en start de GitHub Pages-publicatie. Volg eventuele gerichte installatie- of aanmeldinstructies op het scherm.

3. Controleer het resultaat: een repositorylink en de gepubliceerde kledingdemo. Het Expo-project moet ID `38e28ae4-0169-4b3e-a2bb-5e5d70bb73e3` hebben. De naam `ties-oosterman` komt uit het aangeleverde startcommando; de server bevestigt de werkelijke slug en eigenaar tijdens de inrichting. Een project-ID is geen aanmelding.
4. Rond Apple-signing en de echte Bundle ID, support- en privacygegevens af volgens [APPLE_PUBLICATIE.md](APPLE_PUBLICATIE.md). Start daarna:

```bash
bash Start-AppHub.command testflight
```

5. Installeer **TestFlight** op je iPhone, open je interne testuitnodiging en installeer AppHub.

Een geslaagde JavaScript-export is nog geen geslaagde native iPhone-build. De actuele controle-uitkomsten staan in [VALIDATIE.md](VALIDATIE.md).

## Een webproject toevoegen

1. Publiceer `web-projects/wardrobe` via de meegeleverde GitHub Pages-workflow. Vul eerst de echte URLs en contactgegevens in; de workflow herschrijft deployment-URLs automatisch.
2. Open in AppHub **Project toevoegen** en plak de gepubliceerde `/wardrobe/`-URL.
3. Controleer herkomst, privacy en toestemming; voeg het project toe.

Je kunt ook een publieke GitHub-repository met een schema-v3-`apphub.json` in de hoofdmap van de standaardbranch importeren, of JSON plakken. Het manifest wijst naar de gepubliceerde website. De importer compileert of publiceert geen repository.

## Korte toesteltest

- Voeg drie kledingstukken toe, inclusief een foto, en maak een outfit.
- Sluit AppHub volledig en controleer of de gegevens bij heropenen behouden zijn.
- Exporteer en herstel een back-up vanuit de kledingapp.
- Test een foutieve URL, netwerkuitval en een link buiten het project.
- Controleer ook de native bibliotheek en de afzonderlijke native back-up.

De export in de hoofdinstellingen bevat alleen de webprojectlijst. Websitegegevens en foto's horen daar niet bij. Projecten op dezelfde origin delen browseropslag; verschillende GitHub Pages-mappen zijn geen beveiligingsgrens.

## Verder ontwikkelen

Met een geïnstalleerde development build start je de ontwikkelserver via `npm run start:dev`. Met volledige Xcode kun je lokaal de simulator gebruiken. Openbare publicatie volgt pas na de controles in [APP_STORE_GATES.md](APP_STORE_GATES.md).

Bronnen: [Expo Go-versieverschillen](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/), [EAS-project koppelen](https://docs.expo.dev/tutorial/eas/configure-development-build/), [TestFlight](https://docs.expo.dev/submit/testflight/).
