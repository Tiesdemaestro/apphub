# App Store-gegevens voorbereiden

**Werkversie voor de huidige functies.** Finaliseer na de open punten in [APP_STORE_GATES.md](APP_STORE_GATES.md); dien geen claims over nog ontbrekende moderatie of beveiliging in.

## Nederlands

**Naam:** AppHub  
**Subtitel:** Je projecten op één plek  
**Categorie:** Productiviteit  
**Trefwoorden:** projecten,kledingkast,outfits,notities,formulieren,bibliotheek

**Promotietekst**

Open je eigen webprojecten op één plek. Gebruik daarnaast de ingebouwde kledingkast, notities en native formulieren.

**Beschrijving**

AppHub verzamelt je persoonlijke projecten in één iPhone-app.

Voeg een gepubliceerd webproject toe met een AppHub-manifest. Open het binnen AppHub, bewaar favorieten en beheer je projectlijst. Voor toevoegen gebruik je een publieke projectlink, GitHub-repository of manifest.

In de native bibliotheek houd je kleding bij met foto's, stel je combinaties samen en bewaar je notities. Je kunt ook projecten met vaste collecties en velden toevoegen. Private GitHub-toegang en native gegevensback-ups zijn beschikbaar in deze bibliotheek.

Webprojecten hebben hun eigen gegevensopslag en privacyvoorwaarden. Internet is nodig om hun website te laden, tenzij het project zelf offline gebruik ondersteunt. De hoofdexport bevat de projectlijst; inhoud exporteer je vanuit het project. Projecten op hetzelfde webdomein delen browseropslag.

AppHub bouwt geen willekeurige GitHub-code om naar een iPhone-app. Webprojecten moeten gepubliceerd zijn en een schema-v3-manifest hebben. Native formulieren gebruiken schema v2. Outfitcombinaties zijn gebaseerd op kledingcategorieën.

## Notes for Review: technical draft

AppHub is a React Native host with two distinct modes:

- The main library loads live public HTTPS HTML/JavaScript projects in WKWebView through react-native-webview. Schema-v3 manifests declare the start URL and project information. Import validates metadata, not all remote code. Websites can change after import.
- The native library includes Wardrobe, Notes and a fixed renderer for schema-v2 JSON collections and forms. These native capabilities are bundled in the host; this mode does not execute imported scripts.

The WebView exposes no custom native bridge, host SDK, injected host JavaScript or GitHub token. Web media capture and geolocation are disabled. Standard HTML file selection may provide files explicitly selected by the user. Navigation controls are not a network firewall. Browser storage is shared by projects with the same origin.

The native library optionally stores a GitHub token in SecureStore for private repository access. It is excluded from native backups. The host has no AppHub account system, advertising or analytics service. Remote websites have their own data practices.

Review route: import the final published v3 sample; inspect its data declaration; open it; save and export test data; return to AppHub; inspect native Wardrobe/Notes and native backup separately.

**Before submission:** replace this draft with the final sample URLs and completed moderation, age-control and index/universal-link implementation details. Currently, the report button only opens the user-selected share sheet; there is no central moderation backend. Local blocking only disables a project in this installation. Do not claim these are completed platform controls.

## Nog invullen

Echte support/privacy-URLs, verkopersgegevens, gepubliceerde reviewprojecten, definitieve versienaam, screenshots van de releasebuild en de privacy-/leeftijdsantwoorden van die versie. Geen rating of privacylabel vooraf aannemen.
