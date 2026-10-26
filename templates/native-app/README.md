# Je eigen app in AppHub

Deze template werkt direct in de native iPhone-app. `apphub.json` beschrijft je schermen en gegevens. AppHub maakt daar native lijsten, fotokaarten en invoerformulieren van, met toevoegen, bekijken, bewerken en verwijderen. Je eigen gegevens worden lokaal per app opgeslagen.

## In drie stappen

1. Kopieer `apphub.json` uit deze map, of kies `examples/native/boeken.json`, `taken.json` of `kleding.json`. Geef je eigen project een unieke `id` en passende naam.
2. Plaats het bestand **als `apphub.json` in de hoofdmap van de standaardbranch** van je GitHub-repository. Je kunt het bestand ook direct importeren, zonder GitHub.
3. Open AppHub, kies **Toevoegen** en voeg je repository toe, bijvoorbeeld `eigenaar/project`. Controleer de getoonde app en sla hem op. Gebruik voor een privéproject een GitHub-token met leestoegang tot die repository.

Controleer een bestand vanuit de hoofdmap van dit bouwpakket met Node.js 22.18 of nieuwer:

```bash
npm run check:project -- templates/native-app/apphub.json
npm run check:project -- examples/native/boeken.json
```

Er zijn voor deze controle geen geïnstalleerde npm-pakketten nodig; rechtstreeks werkt ook:

```bash
node scripts/check-native-project.mjs templates/native-app/apphub.json
```

## Wat je kunt maken

Boekenlijsten, taakoverzichten, inventarissen, receptenverzamelingen, dagboeken en een garderobe met foto's passen binnen dit formaat. Meerdere schermen kunnen dezelfde gegevens anders tonen of sorteren. De voorbeelden beginnen leeg, zodat je je eigen gegevens toevoegt. `kleding.json` bewaart handmatig vastgelegde outfits; de ingebouwde Kledingkast bevat de outfitgenerator.

AppHub voert **geen gedownloade JavaScript-, Python-, Swift- of React-code** uit. Een bestaande GitHub-app moet worden vertaald naar dit gegevensformaat. API-aanroepen, AI-modellen, berekeningen, relaties tussen collecties, notificaties en eigen knoppen of code horen niet bij deze runtime. Nieuwe native functies vereisen een nieuwe versie van de hostapp.

## Het formaat

Alleen onderstaande velden zijn toegestaan. JSON ondersteunt geen commentaar of komma na het laatste item.

| Onderdeel | Inhoud |
|---|---|
| `schemaVersion` | Het getal `2`. |
| `id` | Unieke, blijvende app-ID van 2–48 tekens; begint met een kleine letter, daarna alleen kleine letters, cijfers en `-`. Gebruik bijvoorbeeld `mijn-recepten`. |
| `name` / `description` | Naam van maximaal 60 tekens; beschrijving van maximaal 300 tekens. |
| `version` | Drie getallen, bijvoorbeeld `1.0.0`. Verhoog dit bij een wijziging. |
| `runtimeVersion` | `apphub-native-1`. |
| `capabilities` | `["storage"]`, of `["storage", "photos"]` bij fotovelden. |
| `theme` | Optioneel, bijvoorbeeld `{ "color": "#3559C7" }`. |
| `collections` | 1–12 collecties met elk `id`, `title` en 1–24 `fields`. |
| `screens` | 1–12 schermen met elk `id`, `title`, `collection`, `layout` en `titleField`. |
| `homeScreen` | De ID van het scherm dat als eerste wordt geopend. |

Collectie-, veld- en scherm-ID's mogen 1–48 tekens bevatten met dezelfde tekenregels. Maak ID's uniek binnen hun lijst. `wardrobe`, `notes`, `mijn-kledingkast`, `mijn-notities`, `apphub`, `system` en ID's die beginnen met `apphub-` of `system-` zijn geen beschikbare app-ID's. Het gehele bestand mag maximaal 128 KiB groot zijn.

Elk veld bevat `id`, `label` en `type`, optioneel `required: true` of `false`. Alleen bij `choice` voeg je `options` toe, met 1–40 verschillende keuzeteksten.

| Veldtype | Gebruik |
|---|---|
| `text` | Korte tekst, maximaal 500 tekens per ingevulde waarde. |
| `multiline` | Langere tekst, maximaal 10.000 tekens. |
| `number` | Een getal, bijvoorbeeld een aantal of prijs. |
| `boolean` | Ja/nee of afgerond. |
| `choice` | Eén keuze uit de opgegeven `options`. |
| `date` | Een kalenderdatum als `2026-10-19`. |
| `photo` | Een foto die de gebruiker via de fotokiezer toevoegt. |

`layout` is `list` of `grid`. `collection` verwijst naar een bestaande collectie. `titleField` verwijst naar een veld in die collectie, behalve een fotoveld. Optioneel: `subtitleField` voor een tweede waarde; `imageField` voor een fotoveld; `sortField` en `sortDirection` (`asc` of `desc`) voor sortering. Een foto kan niet worden gebruikt als subtitel of sorteerveld. Er zijn geen filters of formules in het schema.

## Prompt voor Claude

Kopieer de onderstaande prompt en voeg je appidee toe. Geef zo nodig ook het meegeleverde `apphub.json` als voorbeeld.

```text
Maak voor mijn appidee uitsluitend één geldig JSON-bestand met de naam
apphub.json voor de native AppHub-runtime. Geef de volledige JSON zonder
Markdown, commentaar, uitvoerbare code of andere bestanden.

Het bestand heeft precies deze structuur:
{
  "schemaVersion": 2,
  "id": "mijn-eigen-app",
  "name": "Naam van mijn app",
  "description": "Korte beschrijving",
  "version": "1.0.0",
  "runtimeVersion": "apphub-native-1",
  "capabilities": ["storage"],
  "theme": { "color": "#3559C7" },
  "collections": [{
    "id": "items",
    "title": "Items",
    "fields": [{ "id": "naam", "label": "Naam", "type": "text", "required": true }]
  }],
  "screens": [{
    "id": "overzicht",
    "title": "Overzicht",
    "collection": "items",
    "layout": "list",
    "titleField": "naam"
  }],
  "homeScreen": "overzicht"
}

Pas namen, collecties en velden aan mijn idee aan binnen deze afspraken:
- Alleen de sleutels uit dit voorbeeld en de opties hieronder zijn toegestaan.
- App-ID: 2–48 tekens, beginnend met een kleine letter, daarna alleen kleine
  letters, cijfers en koppeltekens. Houd deze ID bij updates hetzelfde.
  Gebruik niet wardrobe, notes, mijn-kledingkast, mijn-notities, apphub, system
  of een ID die begint met apphub- of system-.
- Andere ID's: dezelfde tekens, 1–48 lang; uniek binnen hun lijst.
- Naam maximaal 60 tekens, beschrijving maximaal 300. Versie: 1.0.0-formaat.
- 1–12 collecties, 1–24 velden per collectie, 1–12 schermen.
- Collectie: alleen id, title, fields. Veld: alleen id, label, type, optioneel
  required. Veldtypen: text, multiline, number, boolean, choice, date, photo.
- Bij choice zijn options verplicht: 1–40 unieke keuzeteksten. Gebruik
  options niet bij andere veldtypen. Er zijn geen defaults of beginrecords.
- Titels, labels en keuzeteksten maximaal 80 tekens.
- Een fotoveld vereist capabilities ["storage", "photos"]. Anders ["storage"].
- Scherm: id, title, collection, layout (list of grid), titleField. Optioneel
  subtitleField, imageField, sortField, sortDirection (asc of desc).
- Alle veldverwijzingen moeten bestaan in de collectie van dat scherm.
  imageField verwijst uitsluitend naar photo. titleField, subtitleField en
  sortField verwijzen nooit naar photo. sortDirection vereist sortField.
- homeScreen verwijst naar een bestaand scherm. theme is optioneel en bevat
  alleen color, een kleur als #3559C7. Het bestand blijft kleiner dan 128 KiB.
- Geen JavaScript, Python, React, Swift, HTML, WebView, scripts, URL-acties,
  API-aanroepen, formules, relaties, filters, notificaties of AI-functionaliteit.
  Modelleer alleen gegevens en schermen die binnen bovenstaande runtime passen.
- Bij een update: laat collectie-ID's en veld-ID's, typen, required en options
  ongewijzigd. Namen, labels, schermen en thema mogen veranderen. Verhoog version.

Mijn appidee:
```

## Bijwerken zonder gegevensverlies

Wijzig `apphub.json` in dezelfde repository en verhoog `version`. Gebruik daarna **Bijwerken** in het appmenu. De host bewaart de vorige geïnstalleerde versie; met terugzetten herstel je die schermindeling. Je ingevoerde gegevens blijven staan.

Updates mogen de presentatie aanpassen, zoals naam, labels, schermen, sortering en kleur. Wijzigingen aan collecties, veld-ID's, veldtypen, verplichte velden of keuzeopties worden geweigerd om bestaande gegevens te beschermen. Maak voor een ander gegevensmodel een app met een nieuwe ID. Maak vooraf een back-up via AppHub.
