# Kledingkast voor AppHub Web

Werkende, statische HTML/JavaScript-mini-app: kledingfoto’s, outfitcombinaties, IndexedDB-opslag en back-up via kopieerbare JSON. Geen native bridge, tracking, accounts of cloudbackend. Schermen zijn websoftware binnen de native AppHub-host.

## Lokaal openen

Start vanuit `web-projects`:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/wardrobe/` in een browser. De productie-importer accepteert alleen publieke HTTPS-URLs; localhost is alleen voor ontwikkeling.

## Publiceren en toevoegen

1. Publiceer de inhoud van `web-projects` als GitHub Pages-website of op een eigen HTTPS-host.
2. Vervang `your-account` en `YOUR-REPO` in `apphub.json` door echte waarden. De opgegeven URLs zijn placeholders, geen live demo.
3. Vul uitgeversgegevens en een echte supportmogelijkheid in `privacy.html` en `support.html` in.
4. Controleer `https://jouwaccount.github.io/jouwrepo/wardrobe/` en `.../wardrobe/apphub.json` in een browser.
5. Voeg de volledige HTTPS-link naar `apphub.json` toe aan AppHub. Een `owner/repo`-import zoekt een manifest in de repositoryhoofdmap; dit voorbeeld staat in een submap.

## Functionele controle

- Voeg bovenstuk, onderstuk en schoenen toe; optioneel een foto. Controleer een outfit en andere combinaties.
- Sluit het project en open dezelfde URL opnieuw: gegevens blijven staan zolang de webopslag behouden is.
- Exporteer, kopieer en herstel een back-up. Ongeldige JSON mag bestaande gegevens niet veranderen.
- Open in twee tabs: een verouderde tab mag geen nieuwere gegevens overschrijven.
- Controleer foto-invoer, tekstselectie/kopiëren, bevestigingsdialogen en IndexedDB op de echte iPhone-host.

Er is geen service worker: de programmabestanden moeten bij het openen bereikbaar zijn; volledig offline starten wordt niet beloofd. Lokale data kan door OS-/browseropruiming of verwijderen van de host verloren gaan. GitHub Pages gebruikt één origin per account; repositorypaden zijn geen onderlinge opslagbeveiliging. Gebruik aparte origins voor onbetrouwbare projecten.

Tests: `node --test web-projects/wardrobe/domain.test.mjs` vanuit de AppHub-map. Browseropslag en de iOS-fotokiezer vragen daarnaast toesteltests. Een technische test is geen Apple-goedkeuring.
