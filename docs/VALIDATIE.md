# Validatie — 26 oktober 2026

| Controle | Uitkomst |
|---|---|
| Bestaande native kern + webimport, URL-beleid, registry, herstel, voorbeelden en skill-CLI | **128 tests geslaagd, 0 mislukt**, Node 24.21.0. |
| Webkern strikte TypeScriptcontrole | registry, importer en policy geslaagd. |
| TypeScript/TSX-syntax | **33 bestanden**, geen syntaxfouten. |
| Technische projectaudit | Kledingkast en notitietemplate geslaagd; handmatige review blijft vereist. |
| Pages-voorbereiding | Uitvoermap gemaakt met herschreven deployment-URL's; kledingproject gecontroleerd. Niet gehost. |
| Skillformaat | Officiële quick_validate geslaagd. |
| Zelfstandige skillproef | Een afzonderlijke agent maakte met alleen de skill een boekenapp: technische audit geslaagd, 0 fouten, 8 aanvullende tests geslaagd. Geen browser- of toesteltest. |
| Productiereleasecontrole | Blokkeert correct op de tien open bewijsvelden in release-readiness.json. |
| Dependency-installatie en lockfile | Niet afgerond: npm-registry niet bereikbaar vanuit deze sessie (`ENOTFOUND`). |
| Volledige RN/Expo-typecheck, bundel en native build | Niet uitgevoerd; geïnstalleerde native dependencies ontbreken. |
| Browser/IndexedDB end-to-end | Niet uitgevoerd: lokale browser-/serverprocessen werden door de omgeving geblokkeerd. |
| Echte iPhone / eigen TestFlight-build | Niet uitgevoerd. Gewone App Store-Expo Go ondersteunt niet de gebruikte SDK 58. |
| GitHub Pages-publicatie | Niet uitgevoerd; nog geen doelrepository aangemaakt. |
| GitHub aanmaken | CLI-poging gestopt: geen verbinding met api.github.com. Connector herkent Tiesdemaestro maar heeft geen repository-aanmaakfunctie. |
| Begeleid startscript | Shell- en JavaScript-syntax gecontroleerd; login, upload, Pages en EAS-build nog niet daadwerkelijk uitgevoerd. |
| Expo-projectidentiteit | Aangeleverd: `38e28ae4-0169-4b3e-a2bb-5e5d70bb73e3`. Servertoegang, eigenaar en slug nog niet bevestigd. |
| App Store-review | Niet ingediend. |

De 128 tests omvatten 88 bestaande native tests, 19 webhosttests, 9 domeintests voor webvoorbeelden 8 skilltests en 4 tests voor publicatiepaden, Expo-identiteit en scheiding van TestFlight/publieke release. GitHub-responses en opslagadapters zijn in de hosttests nagebootst. De tests bewijzen geen werkende WebKit-, SQLite-, fotokiezer- of Keychain-integratie op een echte iPhone.

SDK 58 en de moduleversies zijn afgestemd op de actuele officiële Expo-documentatie. De eerdere basis gebruikte SDK 56. Installatie, `expo install --fix`, `expo-doctor`, volledige typecontrole en visuele toestelcontrole zijn nodig om de upgrade te bevestigen.

De eerdere gratis Expo Go-route is gecorrigeerd: de App Store-versie stopt volgens de [actuele Expo-uitleg](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/) bij SDK 54. Een eigen TestFlight-build vereist Apple Developer-toegang. Het `testflight`-profiel en de publieke `production`-release hebben daarom afzonderlijke controles.

## Acceptatietest op je iPhone

1. Rond afhankelijkheden en bouwcontroles af; maak de eigen `testflight`-build en installeer deze op je iPhone. Zie [STARTEN.md](STARTEN.md).
2. Publiceer de voorbeelden. Importeer `/wardrobe/` via URL; controleer herkomst, privacy en toestemming.
3. Voeg drie kledingstukken toe inclusief een foto; maak een outfit. Sluit het project en AppHub volledig en controleer gegevens bij heropenen.
4. Exporteer een back-up als tekst, wis proefgegevens en herstel. Test ook ongeldige JSON en onvoldoende opslagruimte.
5. Test foutieve manifesten, netwerkuitval, onbereikbare pagina's, blokkeren en verwijderen uit bibliotheek.
6. Controleer dat links buiten de projectmap, nieuwe vensters en externe URL-schemes niet automatisch openen. Controleer expliciet subresources en netwerkgedrag; de navigatiecontrole blokkeert deze niet allemaal.
7. Gebruik een tweede project op hetzelfde domein om de gedeelde opslaggrens te beoordelen. Gebruik afzonderlijke origins voor projecten die elkaar niet mogen vertrouwen.
8. Test native bibliotheek, bestaande gegevens en native back-ups na de upgrade. Controleer bewerken, terugnavigeren en fotokeuze.
9. Controleer tekstgrootte, VoiceOver, toetsenbord, foutschermen en privacy-/hulplinks.

Noteer build, toestel, iOS-versie en afwijkingen. Rond daarna het afzonderlijke openbare-release-dossier af. Schrijf geen test als geslaagd wanneer alleen codecontrole is uitgevoerd.
