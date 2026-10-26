# Software maken voor AppHub

Gebruik de meegeleverde skill **build-apphub-project** in Claude/Codex. De skill maakt of port software, gebruikt een projecttemplate en voert controles uit. Hij levert geen automatische Apple-goedkeuring.

## Een nieuw project

Vanuit de AppHub-map, met Node.js 24:

```bash
node scripts/create-web-project.mjs ../mijn-project --id mijn-project --name "Mijn project" --url https://eigenaar.github.io/repository/
node scripts/check-web-project.mjs ../mijn-project --json
```

Vul je echte publicatie-URL in. De eerste opdracht maakt bestanden; hij publiceert niets. De uitvoermap mag nog niet bestaan. Het voorbeeld gebruikt lokale opslag. Laat de skill daarna de gewenste functies bouwen.

## Skill gebruiken

De volledige skill staat in `skills/build-apphub-project/`. Verwijs je code-assistent naar de `SKILL.md` in die map of kopieer die volledige map naar de skills-map van je eigen installatie. Voor lokale Codex-installaties is dat doorgaans `~/.codex/skills/`; controleer de ondersteunde installatievorm van je assistent. Een projectbestand aanleveren betekent niet dat de skill al globaal geïnstalleerd is.

Voorbeeldprompt:

> Gebruik build-apphub-project uit deze repository. Maak een kledingapp met foto’s, categorieën en outfitcombinaties. Bewaar gegevens lokaal, voeg export/herstel toe en voer alle technische controles uit. Geef apart aan welke toesteltests en Apple-reviewpunten nog openstaan.

Voor bestaande code:

> Gebruik build-apphub-project om deze repository geschikt te maken voor AppHub. Onderzoek eerst wat rechtstreeks herbruikbaar is en wat moet worden geport. Behoud de bestaande broncode en gebruikersdata. Lever werkende statische uitvoer, apphub.json, privacy/support en een testrapport.

## Naar je iPhone

1. Bouw de distributiemap; controleer dat assets met relatieve paden laden.
2. Publiceer onder je eigen GitHub Pages-/HTTPS-adres. GitHub Pages host geen Python-/Node-backend.
3. Open de gepubliceerde pagina en controleer privacy/support en opslag.
4. Voeg de `apphub.json`-URL toe in AppHub, bekijk de informatie en open het project.
5. Voeg gegevens toe, sluit/heropen, exporteer en herstel. Test de echte iPhone voordat je publiceert.

Webprojecten gebruiken WebView. De host voert hun JavaScript niet uit als onbeperkte native AppHub-code. Data-opslag moet door ieder project worden geïmplementeerd. Browserdata kan worden verwijderd; maak back-ups. Aparte mappen op dezelfde GitHub Pages-origin vormen geen harde gegevensisolatie.

## Betekenis van het controlerapport

- `technicalPass`: de uitgevoerde statische controles vonden geen blokkerende fout.
- `reviewRequired`: blijft `true`; gedrag, beveiliging, privacy en Apple-regels vereisen handmatige beoordeling.
- `errors`: oplossen voordat het project wordt gebruikt.
- `warnings`: beoordelen en met feitelijke testresultaten afhandelen.

De controle publiceert niets en voert geen projectcode uit. Ook een technisch geslaagd project kan door Apple worden afgewezen. Zie de handmatige checklist in `skills/build-apphub-project/references/apple-review.md`.
