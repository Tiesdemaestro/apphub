# Voorwaarden vóór openbare publicatie

**Status: niet gereed voor App Store-indiening.** Onderstaande punten horen bij de productrelease; een geslaagde lokale releasecheck vervangt ze niet.

| Onderdeel | Nu | Gereed wanneer |
|---|---|---|
| Werkende toestelbuild | Niet bevestigd; npm-installatie geblokkeerd door `ENOTFOUND`. | Afhankelijkheden vastgelegd; typecheck, iOS-bundel en echte iPhone-test geslaagd. |
| Gepubliceerde voorbeelden | Templates en kledingdemo lokaal. | Echte HTTPS-URLs, ingevulde contact/privacy-pagina's en complete importtest. |
| Centrale meldingen | Alleen een systeem-deelmenu. | Meldingen komen aantoonbaar bij beheer terecht; opvolging en escalatie getest. |
| Filtering en misbruik | Lokale blokkering van één project. | Inhoudsfiltering en blokkeren van misbruikers operationeel; eigenaar en procedure vastgelegd. |
| Software-index | Lokale projectlijst. | Volledige software-index/metadata en werkende universal links aanwezig. |
| Leeftijdstoegang | Verklaring van maker en bevestigingsvakje. | Vastgelegde of geverifieerde leeftijd bepaalt aantoonbaar de toegang; te oude inhoud herkenbaar. |
| Native toegang | Geen eigen web/native bridge. | Toegang geïnventariseerd; benodigde voorafgaande Apple-toestemming verkregen bij uitbreiding. |
| Toestemming/data | Import toont de makerverklaring. | Vereiste toestemming per project en daadwerkelijke verwerking gecontroleerd, ook na wijzigingen. |
| Nut hoofdapp | Bibliotheek plus native tools. | Duurzaam eigen gebruiksnut onderbouwd en getest; geen garantie op acceptatie onder 4.2. |
| Privacy en support | Conceptteksten/placeholders. | Echte beheerder, contact, publieke URLs, passende privacylabels en verwijderroutes. |
| Accounts en release | Betaald Apple-lidmaatschap niet afgerond. | Eigenaar, betaling, Bundle ID, signing, EAS, App Store Connect en verkopersinformatie gereed. |
| Review | Niet ingediend. | Finaliteit, metadata, screenshots en volledige reviewtoegang gecontroleerd; Apple-besluit ontvangen. |

Apple **4.7.1–4.7.5** stelt eisen aan mini-apps: privacy, moderatie, native toegang, toestemming, index en leeftijd. **2.5.2** blijft relevant voor gedownloade code; **4.2** voor bruikbaarheid. De huidige WebView-aanpak is geen automatische vrijstelling. Een adviesgesprek levert geen goedkeuring vooraf op.

Projectblokkering stopt alleen openen via deze AppHub-installatie. Het verwijdert de website niet en blokkeert geen maker of gebruiker op een platform. ‘Meldingsbestand delen’ is geen melding totdat de gebruiker zelf een ontvanger kiest en deelt.

Bij accountaanmaak of digitale verkoop later ook de toepasselijke accountverwijdering, login- en betaalregels verwerken. Bouw geen publieke release rond functies die alleen als toekomstige belofte bestaan.

Bron: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), gecontroleerd op 26 oktober 2026. Eigen implementatie en bewijs per rij vastleggen vóór indiening.

## Uitvoerbare releasecontrole

Vul alleen met werkelijk bewijs `release-readiness.json` in. `npm run check:store` controleert de volledigheid; een EAS-productiebuild voert dezelfde controle uit. Deze controle beoordeelt niet zelfstandig de inhoud van bewijs en vervangt Apple-review niet.
