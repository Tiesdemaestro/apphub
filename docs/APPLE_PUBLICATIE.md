# Van toesteltest naar App Store

**Huidige fase: lokaal testen.** Het betaalde Apple-lidmaatschap, de toestelbuild en productievoorwaarden zijn nog niet afgerond. Gebruik eerst [Expo Go](STARTEN.md). Dit pakket is nog niet klaar voor openbare publicatie.

## 1. Eigendom en accounts

Schrijf je in bij het [Apple Developer Program](https://developer.apple.com/programs/enroll/) zodra je de publicatieroute wilt voortzetten. **Individual** gebruikt je wettelijke naam als verkoper, ook bij een eenmanszaak. **Organization** vraagt een rechtspersoon, tekenbevoegdheid en doorgaans een D-U-N-S-nummer. Apple noemt US$99 per jaar; de lokale prijs verschijnt bij inschrijving.

Beheer Apple-, Expo-, GitHub- en hostingaccounts zelf. Deel geen wachtwoorden of ondertekeningssleutels.

## 2. Publicatievoorwaarden afbouwen

Rond eerst [APP_STORE_GATES.md](APP_STORE_GATES.md) af. Het product bevat nu live HTML/JavaScript-mini-apps in een WebView én een native bibliotheek. Beschrijf beide aan App Review. Een bespreking vooraf is geen goedkeuring.

Publiceer echte host-support/privacy-pagina's en werkende voorbeeldprojecten. Vul de beheerder en contactgegevens in [PRIVACYBELEID.md](PRIVACYBELEID.md) in. Templatepagina's met placeholders gelden niet als gepubliceerde dienstverlening.

## 3. Release configureren

Stel deze echte waarden in je shell en in de EAS-omgeving **production** in:

| Variabele | Waarde |
|---|---|
| `APPHUB_BUNDLE_ID` | Unieke Bundle ID die je bij Apple registreert. |
| `APPHUB_APPLE_TEAM_ID` | Je Apple Team ID. |
| `EXPO_PUBLIC_SUPPORT_URL` | Publieke HTTPS-supportpagina van AppHub. |
| `EXPO_PUBLIC_PRIVACY_URL` | Publiek privacybeleid van AppHub. |

```bash
npm run configure:release
npm run check:release
npx eas-cli login
npx eas-cli init
npx eas-cli build:configure
```

Deze controles toetsen lokale configuratie, niet de volledigheid van moderatie, domeineigendom of Apple-toelating. Controleer dat `app.config.ts` de gekoppelde EAS-projectidentiteit behoudt.

## 4. Build, TestFlight en review

Na volledige installatie, geslaagde tests en toestelcontrole:

```bash
npm run check
npm run bundle:ios
npm run build:ios
```

Maak in App Store Connect een apprecord met dezelfde Bundle ID. Upload de geslaagde productiebuild bewust:

```bash
npx eas-cli submit --platform ios --profile production
```

Test intern; externe TestFlight-distributie doorloopt waar vereist beta-review. Daarna: definitieve [metadata](APP_STORE_METADATA.md), screenshots, privacy- en leeftijdsantwoorden, encryptiegegevens, EU-verkopersinformatie en reviewtoegang invullen. Na goedkeuring handmatig vrijgeven.

Bronnen: [Apple-inschrijving](https://developer.apple.com/programs/enroll/), [reviewregels](https://developer.apple.com/app-store/review/guidelines/), [TestFlight](https://developer.apple.com/testflight/), [EAS Build](https://docs.expo.dev/build/setup/), [iOS-indiening](https://docs.expo.dev/submit/ios/). Regels opnieuw controleren vóór indiening.
