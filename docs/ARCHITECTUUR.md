# AppHub: webprojecten en native bibliotheek

AppHub is een React Native/Expo-host met twee projectmodellen. **Schema v3 laadt live websites in een WebView. Schema v2 rendert vaste configuratie als native schermen.**

| Onderdeel | Werking |
|---|---|
| Hoofdscherm | Projecten zoeken, favorieten, import, openen, blokkeren en lijstexport. |
| Webmanifest v3 | `kind: web`, project-ID, versie, HTTPS-`startUrl`, opslagverklaring, privacy/support, leeftijd en gegevensverzameling. |
| Import | Publieke website/manifest-URL, publieke GitHub-repository of geplakte JSON. Alleen het manifest wordt gecontroleerd. |
| Webuitvoering | WebKit/WebView laadt HTML, CSS en JavaScript van `startUrl`; geen gedownloade React Native-bundel. |
| Native bibliotheek | Bestaande Kledingkast, Notities en schema-v2-formulieren; broncode van deze renderer zit in de host. |
| Private GitHub-toegang | Alleen de native bibliotheek gebruikt desgewenst een token in SecureStore. Het token wordt niet doorgegeven aan webprojecten. |

## Publicatie en updates

GitHub-code → publiceren op GitHub Pages/eigen HTTPS-host → `apphub.json` toevoegen → importeren → project openen.

Een website kan na import veranderen. De opgeslagen manifestversie pinnt of certificeert de live website niet. Er is geen hostgestuurde rollback van webcode. Offline starten werkt alleen als het project dat zelf ondersteunt; de meegeleverde webtemplates hebben geen service worker.

## Webtoegang en opslag

- Geen eigen JavaScript/native bridge: geen `onMessage`, geïnjecteerde hostcode of AppHub-SDK voor webprojecten.
- Webmedia voor camera/microfoon en geolocatie zijn uitgeschakeld. Standaard HTML-bestandsinvoer kan door de gebruiker gekozen bestanden ontvangen; die site bepaalt wat daarmee gebeurt.
- Navigatie blijft binnen de projectscope op dezelfde origin; nieuwe vensters worden tegengehouden. Dit is **geen netwerkfirewall** voor scripts, afbeeldingen, frames of `fetch`. Ook `allowedOrigins` is alleen een verklaring.
- Geen aparte WebKit-opslag per project. Sites op dezelfde origin kunnen elkaars browserdata benaderen, ook bij verschillende paden. Gebruik aparte origins voor makers die elkaar niet vertrouwen.
- Browserdata kunnen worden opgeruimd. Export en verwijdering van inhoud vinden in het webproject plaats. Verwijderen uit de projectlijst wist de websitegegevens niet.

## Twee soorten back-up

| Export | Bevat |
|---|---|
| Hoofdinstellingen | Webprojectlijst en metadata; geen website-inhoud. Geïmporteerde nieuwe vermeldingen starten geblokkeerd. |
| Native bibliotheek | Native definities, records en foto's; geen GitHub-token. |

Beide exports zijn leesbare gegevens. Namen en opslagprefixen vormen geen algemene sandbox voor willekeurige code.

## Wat nog moet worden gebouwd

Centrale meldingsafhandeling, filtering, blokkeren van misbruikers, software-index met universal links en werkelijke leeftijdstoegangscontrole. De huidige deelknop deelt alleen een melding via het systeemmenu. Lokale projectblokkering is geen moderatiedienst.

Schema-v2-updates behouden het gegevensmodel; nieuwe collecties/veldtypen vragen een nieuw project-ID. De native bibliotheek bewaart één vorige definitie en ondersteunt behouden gegevens bij verwijderen. Zie de templates en [APP_STORE_GATES.md](APP_STORE_GATES.md).
