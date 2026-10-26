# Handmatige Apple-controle

Bron: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), gecontroleerd 26 oktober 2026. Open de actuele bron opnieuw vóór publicatie. Dit document is een werkchecklist en geen goedkeuring of juridisch oordeel.

## Mini-app: wat deze skill kan voorbereiden

- Beoordeel inhoud, leeftijdsclassificatie, rechten op broncode/beelden en afwezigheid van verboden misleiding.
- Beschrijf daadwerkelijk verzamelde gegevens, alle externe ontvangers en bewaartermijnen. Maak verwijderen mogelijk. Vraag relevante toestemming voor gegevensdeling, ook naar AI-diensten.
- Controleer of digitale betalingen onder 3.1 vallen; voeg geen externe checkout toe om Apple-regels te omzeilen.
- Maak privacy- en supportpagina's bereikbaar, met feitelijke contactinformatie.
- Toon alle functies aan de reviewer; laat backend en demonstratieaccount werken indien nodig.
- Noteer gewijzigde gegevensstromen en rechten bij iedere nieuwe versie.

## AppHub-host: apart te realiseren en te beoordelen

| Regel | Hostverplichting / beoordeling |
|---|---|
| 2.5.2 | Beoordeel toegestane code-uitvoering en distributie; geen generieke vrijstelling voor willekeurige GitHub-code. |
| 4.2 | Voldoende bruikbare eigen functionaliteit en appkwaliteit; een verpakte website alleen kan onvoldoende zijn. |
| 4.7 | HTML5/JavaScript-mini-apps zijn onder voorwaarden mogelijk. Host blijft verantwoordelijk voor aangeboden software. |
| 4.7.1 | Privacy, inhoudsfiltering, meldproces met tijdige afhandeling, gebruikers blokkeren en toepasselijke betaalregels. Alleen lokaal een kaart verbergen is geen volledig moderatiesysteem. |
| 4.7.2 | Voor native platform-API's/-technologie beschikbaar stellen aan mini-apps is voorafgaande Apple-toestemming vereist. Lege permissions bewijst geen automatische vrijstelling voor de totale host. |
| 4.7.3 | Expliciete toestemming per mini-app en relevante gegevens-/rechtenoverdracht. |
| 4.7.4 | Software-index met metadata en universal links naar alle aangeboden software. Een lokale lijst is niet vanzelf die volledige voorziening. |
| 4.7.5 | Herkenning van software boven hostleeftijdsclassificatie en leeftijdsbeperking op basis van geverifieerde of verklaarde leeftijd. Alleen manifesttekst is geen leeftijdspoort. |
| 5.1 | Privacybeleid, juiste privacylabels en dataminimalisatie; accountverwijdering wanneer accounts worden aangemaakt. |

## Releasebeslissing registreren

Houd per punt vast: `uitgevoerd`, `niet van toepassing met reden`, of `open`. Markeer publicatie als geblokkeerd zolang noodzakelijke hostvoorzieningen, toegang of Apple-toestemming ontbreken. Technische tests en een succesvolle Expo Go-sessie bewijzen geen App Store-toelating. Apple beoordeelt de concrete app, het distributiemodel en de inhoud.
