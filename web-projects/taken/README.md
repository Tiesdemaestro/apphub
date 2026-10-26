# Mijn taken

Taken met optionele datum, notities, zoeken en afvinken.

Voeg https://tiesdemaestro.github.io/apphub/taken/ toe via Project toevoegen in AppHub. Deze mini-app gebruikt eigen IndexedDB-opslag, zonder account of backend. De browseropslag van de simulator kan aan het einde van een sessie worden gewist. Exporteer gegevens om ze mee te nemen.

Tests: node --test web-projects/taken/domain.test.mjs
Audit: node scripts/check-web-project.mjs web-projects/taken --json

Technische compatibiliteit is geen Apple-goedkeuring; toesteltests blijven nodig.
