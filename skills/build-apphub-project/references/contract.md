# AppHub-webprofiel v3

De manifest-validator staat in `assets/contracts.mjs`. Dat is dezelfde contractsnapshot als de bijbehorende AppHub-host. Werk host, checker en skill samen bij als het contract verandert.

```json
{
  "schemaVersion": 3,
  "kind": "web",
  "id": "mijn-project",
  "name": "Mijn project",
  "description": "Wat dit project voor de gebruiker doet.",
  "version": "1.0.0",
  "startUrl": "https://eigenaar.github.io/repository/",
  "storage": "local",
  "allowedOrigins": ["https://eigenaar.github.io"],
  "privacyUrl": "https://eigenaar.github.io/repository/privacy.html",
  "supportUrl": "https://eigenaar.github.io/repository/support.html",
  "ageRating": "4+",
  "dataCollected": [],
  "permissions": []
}
```

- Gebruik `local`, `cloud` of `both` voor opslag. Dit veld configureert geen database; implementeer die daadwerkelijk.
- Houd de project-ID stabiel bij updates. Beheer databaseversies en migraties afzonderlijk van de releaseversie.
- Gebruik publieke HTTPS-URLs zonder inloggegevens. Start-URL mag geen query of fragment bevatten. Gebruik bij voorkeur een map-URL met afsluitende slash en een `index.html` daarbinnen.
- Neem de start-origin op in `allowedOrigins`; noteer overige feitelijke netwerkdiensten. Dit is metadata, geen afdwingbare WebView-netwerkisolatie.
- Declareer werkelijk verzamelde/verzonden gegevenstypen. Gebruik `[]` alleen wanneer geen gegevens worden verzameld door de maker of diens diensten; lokale door de gebruiker beheerde inhoud blijft wel in privacy.html uitgelegd.
- Kies een leeftijdsclassificatie uit `4+`, `9+`, `13+`, `16+`, `18+` op basis van inhoud/functies. Het veld vormt geen leeftijdsverificatie.
- Houd `permissions` leeg. Dit profiel biedt geen AppHub-native bridge; voeg daar geen eigen API achterlangs aan toe. Standaard WebKit-bestandsselectie blijft onder controle van de gebruiker.
- Een GitHub Pages-map met `apphub.json`, `index.html`, scripts, stijlen, privacy en support vormt de distributie. Een GitHub-repo met ongecompileerde source is niet automatisch een werkende publicatie.

## Opslag en beveiliging

Browsers scheiden opslag op origin; paden onder dezelfde `eigenaar.github.io` zijn geen veiligheidsgrens. Gebruik een unieke IndexedDB-naam om ongelukken te vermijden, maar claim daarmee geen bescherming tegen kwaadaardige code op dezelfde origin. Gebruik afzonderlijke origins voor onderling onbetrouwbare projecten. Voer nooit geïmporteerde code uit in de native JavaScript-runtime van de host.

Voor cloud: autenticeer de gebruiker, controleer eigenaarschap server-side, beperk rechten tot die gebruiker en test cross-account-toegang. Een verborgen knop of alleen frontendcontrole is geen autorisatie. Gebruik JSON-schema-/typecontroles voor import, limieten voor tekst/foto/bestanden, en behandel foutieve/opgeblazen back-ups zonder bestaande data te overschrijven.

## Checklist conversie

| Bron | Werkelijk te doen |
|---|---|
| Statische websoftware | Relatieve paden, opslag, CSP, manifest en documenten toevoegen. |
| React/Vue SPA | Statische uitvoer maken; routing/paden geschikt maken voor Pages; dependencies controleren. |
| Node/Python-backend | Afzonderlijk hosten met auth of beperkte functies herschrijven voor browser. |
| Swift/desktopsoftware | Schermen en relevante logica porten; native exclusieve functies apart melden. |
| Onbekende repository | Eerst inventariseren; geen installatiescripts of code uitvoeren met accountgeheimen. |
