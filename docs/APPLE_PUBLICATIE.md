# Van eerste testbuild naar App Store

De eerste iPhone-installatie loopt via een eigen TestFlight-build. Een openbare App Store-release is een latere stap. Beide gebruiken een ondertekende iOS-build; alleen het publieke releaseprofiel vereist het afgeronde AppHub-reviewdossier.

## 1. Accounts en projectidentiteit

Gebruik je bestaande Expo-project: `38e28ae4-0169-4b3e-a2bb-5e5d70bb73e3`. Verifieer de eigenaar en slug met `npx eas-cli@latest project:info`. `ties-oosterman` is voorlopig afgeleid van het aangeleverde startcommando, niet van een bevestigde serverrespons. Laat het bestaande project-ID staan; maak geen nieuw leeg Expo-project aan.

Voor TestFlight en App Store heb je een actief [Apple Developer-lidmaatschap](https://developer.apple.com/programs/enroll/) nodig. **Individual** gebruikt je wettelijke naam als verkoper. Apple noemt US$99 per jaar; de lokale prijs verschijnt bij inschrijving. Betaal pas als je deze route wilt voortzetten na de technische bouwcontroles.

## 2. Configuratie en signing

Gebruik deze echte waarden in je shell en de gekozen EAS-omgeving: **preview** voor `testflight`, **production** voor publieke release.

| Variabele | Waarde |
|---|---|
| `APPHUB_BUNDLE_ID` | Unieke Bundle ID die je bij Apple registreert. Gebruik dezelfde voor testen en publicatie. |
| `APPHUB_APPLE_TEAM_ID` | Je Apple Team ID. |
| `EXPO_PUBLIC_SUPPORT_URL` | Publieke HTTPS-supportpagina van AppHub. |
| `EXPO_PUBLIC_PRIVACY_URL` | Publiek privacybeleid van AppHub. |

Vul beheerder en contactgegevens in [PRIVACYBELEID.md](PRIVACYBELEID.md) in en publiceer de bijbehorende pagina's. Templatepagina's met placeholders zijn niet gereed voor verspreiding. Expo laat je tijdens het signingproces zelf bij Apple aanmelden en de juiste ontwikkelaarsteamgegevens kiezen.

```bash
npm run configure:release
npm run check:release
npx eas-cli@latest project:info
```

De lokale controles bewijzen geen domeineigendom of Apple-toelating. De EAS-server moet bovendien bevestigen dat jouw account toegang heeft tot het geconfigureerde project.

## 3. Eerste TestFlight-build

Na geslaagde begeleide inrichting, typecontrole en JavaScript-export:

```bash
bash Start-AppHub.command testflight
```

Deze route bouwt met het profiel `testflight` en begeleidt de indiening bij TestFlight. De losse commando’s zijn `npx eas-cli@latest build --platform ios --profile testflight` en `npx eas-cli@latest submit --platform ios --profile testflight`.

Selecteer bij indiening de werkelijk geslaagde build. Het profiel gebruikt `distribution: store` en geen development client. `preview` met `distribution: internal` is een andere installatieroute en is niet geschikt voor TestFlight.

Maak zo nodig het App Store Connect-apprecord met dezelfde Bundle ID. Voeg jezelf toe aan een **interne** TestFlight-groep en installeer de verwerkte build via TestFlight. Externe testers kunnen beta-review vereisen. Het testprofiel vinkt geen punten uit het publieke release-dossier af.

Voer daarna de toesteltest uit [VALIDATIE.md](VALIDATIE.md) uit en los bevindingen op.

## 4. Openbare publicatie

Rond [APP_STORE_GATES.md](APP_STORE_GATES.md) af, inclusief moderatie, leeftijdstoegang, privacy, software-index en toestelbewijs. Beschrijf zowel de HTML/JavaScript-projecten als de native bibliotheek aan App Review. Een testbuild of vooroverleg is geen App Store-goedkeuring.

```bash
npm run check:store
npm run check
npm run bundle:ios
npm run build:ios
npx eas-cli@latest submit --platform ios --profile production
```

Vul vervolgens definitieve [metadata](APP_STORE_METADATA.md), screenshots, privacy- en leeftijdsantwoorden, encryptiegegevens, EU-verkopersinformatie en reviewtoegang in. Dien in voor App Review; geef na goedkeuring handmatig vrij.

Bronnen: [Apple-inschrijving](https://developer.apple.com/programs/enroll/), [Apple-reviewregels](https://developer.apple.com/app-store/review/guidelines/), [EAS-projectkoppeling](https://docs.expo.dev/tutorial/eas/configure-development-build/), [TestFlight-build en interne distributie](https://docs.expo.dev/submit/testflight/), [EAS-omgevingen](https://docs.expo.dev/eas/environment-variables/usage/).
