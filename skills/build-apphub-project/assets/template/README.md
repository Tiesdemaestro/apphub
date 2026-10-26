# AppHub Web-projecttemplate

Een werkend notitieproject met IndexedDB, versiecontrole bij gelijktijdig openen, CRUD, veilige tekstrendering, gevalideerde JSON-back-up en lokale gegevensverwijdering. Dit is de basis voor de bouwskill; geen automatische converter voor willekeurige code.

1. Kopieer deze map naar een nieuw project. Kies een unieke `id` in `apphub.json` én een unieke `PROJECT_ID` in `domain.mjs`. Houd beide daarna stabiel om je opslag terug te vinden.
2. Pas de schermen, gegevensvalidatie, back-upversie en tests aan het doel aan. Verhoog de back-upversie alleen met expliciete migratie.
3. Publiceer op HTTPS. Vervang de `YOUR-ACCOUNT`/`YOUR-REPO`-URLs in het manifest; het manifest bevat nu deploymentplaceholders.
4. Vul uitgever en echte contactgegevens in de support- en privacypagina’s in. Verklaar gegevensverwerking eerlijk. De opgegeven leeftijdsclassificatie is een ontwikkelaarsverklaring, geen Apple-classificatie.
5. Importeer de volledige HTTPS-URL van `apphub.json` in AppHub. Een GitHub `owner/repo`-import zoekt het manifest in de hoofdmap, niet in deze submap.

Lokaal: `python3 -m http.server 8080` vanuit `web-projects`, dan `http://localhost:8080/template/`. Alleen de ontwikkelbrowser gebruikt HTTP; de AppHub-importer vereist publieke HTTPS.

Geen native bridge, `eval`, remote JavaScript, API-sleutels of cloudbackend. De Content Security Policy staat geen netwerkverzoeken toe. Bij cloudfuncties moeten CSP, manifest, toestemming, serverauthenticatie en privacybeleid samen worden aangepast; zet nooit servergeheimen in deze bestanden.

Webopslag wordt per origin gedeeld; een nieuwe databasenaam scheidt gegevens logisch maar vormt geen veiligheidsgrens. Publiceer onbetrouwbare projecten op afzonderlijke origins. Lokale gegevens kunnen worden gewist door OS/browseropruiming. Geen service worker: volledig offline starten is niet ondersteund.

Test opslag na heropenen, bewerken/verwijderen, ongeldige back-ups en opslagconflicten in twee tabs. Test apart op de echte iPhone in AppHub: tekstselectie/kopiëren, dialogen en IndexedDB. Een succesvolle projectcheck is geen App Store-goedkeuring.
