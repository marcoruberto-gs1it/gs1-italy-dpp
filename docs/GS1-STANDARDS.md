# Uso degli standard GS1

Questo catalogo usa tre standard GS1 insieme: **GS1 Digital Link** (come si indirizza un
prodotto/un'organizzazione), il **GS1 Web Vocabulary** (come si descrivono i loro dati in
JSON-LD) e i normali identificativi GS1 (**GTIN**, **GLN**). Ogni termine del vocabolario usato
in questo progetto è stato verificato contro la copia ufficiale del vocabolario
([github.com/gs1/WebVoc](https://github.com/gs1/WebVoc), v1.16) prima di essere scritto nel
codice — nessuna proprietà o classe "a memoria".

## GS1 Digital Link

Ogni prodotto e ogni organizzazione ha un URL nella forma
`https://{dominio}/{Application Identifier}/{chiave}`, secondo la
[GS1 Digital Link URI Syntax](https://ref.gs1.org/standards/digital-link/uri-syntax/):

| Application Identifier | Cosa identifica | Esempio in questo catalogo |
|---|---|---|
| `01` | GTIN del prodotto | `/01/08076800195057` (Barilla Spaghetti n. 5) |
| `414` | GLN dell'organizzazione (brand owner) | `/414/8076800000009` (Barilla G. e R. Fratelli SpA) |

Lo stesso URL di prodotto risolve sia per un browser (HTML) sia per un agente che chiede
`Accept: application/ld+json` (JSON-LD puro) — vedi `webshop/nginx.conf`. È lo stesso principio
per cui GS1 Digital Link esiste: un solo identificativo, più rappresentazioni a seconda di chi
lo interroga.

## GTIN

Il GTIN è sempre normalizzato alla forma canonica **a 14 cifre** richiesta da GS1 Digital Link
(zero-padded a sinistra quando il codice sorgente è un GTIN-8/12/13), sia nell'URL sia nella
proprietà `gs1:gtin` del JSON-LD. Un link più corto (es. un vecchio GTIN-8 non completato con
zeri) resta comunque risolvibile: `ProductService.getProductByGtin()` accetta entrambe le forme.

## GLN e pagine brand

`gs1:brandOwner` (dominio `gs1:Product`, range `gs1:Organization`) collega ogni prodotto
all'organizzazione "responsabile dell'allocazione del GTIN al prodotto" — non sempre lo stesso
stabilimento che lo confeziona: per un prodotto a marchio del distributore (es. Coop, Selex,
Conad) è il distributore a possedere il prefisso GS1, non il terzista che lo produce
fisicamente (`gs1:manufacturer`, tenuto distinto).

Il GLN usato per questi 11 prodotti è costruito così:

- Le **prime 7 cifre** (il GS1 Company Prefix) sono **reali**, verificate una per una via
  GEPIR — il registro pubblico GS1 (oggi confluito in "Verified by GS1",
  [gs1.org/services/verified-by-gs1](https://www.gs1.org/services/verified-by-gs1)) che
  conferma a quale azienda è assegnato un prefisso.
- Le cifre restanti (riferimento di sede + check digit) sono un **valore dimostrativo**: GEPIR
  non espone il riferimento di sede specifico di un'azienda (è privato), quindi non era
  disponibile da nessuna fonte verificabile. Il check digit è comunque calcolato con
  l'algoritmo standard GS1 (mod-10), quindi il GLN risultante è strutturalmente valido, anche
  se il riferimento di sede non è quello realmente assegnato dall'azienda.

Questa distinzione è dichiarata esplicitamente sia nel codice
(`src/app/services/product.service.ts`, interfaccia `BrandOwner`) sia nella UI della pagina
brand stessa.

## GS1 Web Vocabulary — dove e come

Ogni scheda prodotto pubblica un documento JSON-LD (`rawGs1Data` in
`src/app/data/products.json`, generato dallo script di build `add-gs1-jsonld.js`) che mescola
`schema.org` e `gs1:` sullo stesso nodo — esattamente come previsto dal vocabolario, pensato per
essere un'estensione di schema.org, non un sostituto.

### Termini usati, per area

- **Identità prodotto**: `gs1:gtin`, `gs1:brand`/`gs1:Brand` (con `gs1:brandName`,
  `gs1:subBrandName`), `gs1:regulatedProductName`, `gs1:netContent`.
- **Ingredienti**: `gs1:ingredientStatement` (testo libero, l'intera dichiarazione così come
  in etichetta).
- **Allergeni**: `gs1:hasAllergen` → array di `gs1:AllergenDetails`, ciascuno con
  `gs1:allergenType` (`gs1:AllergenTypeCode-*`) e `gs1:allergenLevelOfContainmentCode`
  (`CONTAINS` / `MAY_CONTAIN` / `FREE_FROM`). Il JSON-LD dichiara **sempre tutti i 14 allergeni**
  del Regolamento UE 1169/2011 Allegato II per ogni prodotto — non solo quelli citati
  esplicitamente in etichetta — completando automaticamente a `FREE_FROM` chi non compare né tra
  gli ingredienti né tra gli avvisi "può contenere" (la lista dei 14 è esaustiva per legge,
  quindi l'assenza da una dichiarazione ingredienti obbligatoria è un segnale valido, non
  un'invenzione). La UI umana mostra invece solo `CONTAINS`/`MAY_CONTAIN`, come farebbe
  un'etichetta reale — vedi [FEATURES.md](./FEATURES.md#scheda-prodotto-01gtin).
- **Valori nutrizionali**: `gs1:nutrientBasisQuantity`/`gs1:nutrientBasisQuantityType`, poi una
  proprietà `*PerNutrientBasis` per nutriente (`gs1:energyPerNutrientBasis`,
  `gs1:fatPerNutrientBasis`, `gs1:saturatedFatPerNutrientBasis`, …), ciascuna tipizzata
  `gs1:NutritionMeasurementType` — la sottoclasse di `gs1:QuantitativeValue` che il vocabolario
  dichiara come range effettivo di queste proprietà, non il tipo generico.
- **Packaging**: `gs1:packaging` → `gs1:PackagingDetails` (tipo imballaggio, materiali via
  `gs1:packagingMaterial`/`gs1:PackagingMaterialTypeCode-*`); `gs1:grossWeight` e
  `gs1:inPackageHeight`/`Width`/`Depth` sono invece proprietà **dirette del prodotto** (il loro
  dominio dichiarato è `gs1:Product`, non `gs1:PackagingDetails`) e non vanno annidate dentro
  `gs1:packaging`.
- **Origine**: `gs1:countryOfOrigin` → `gs1:Country`/`gs1:countryCode` in forma strutturata dove
  il paese è inequivocabile, più `gs1:countryOfOriginStatement` (testo libero) per la dicitura
  estesa in etichetta. `gs1:targetMarket` → `gs1:TargetMarketDetails`/`gs1:targetMarketCountries`.
- **Claim**: `gs1:organicClaim`/`gs1:OrganicClaimDetails`/`gs1:organicClaimAgency`
  (`gs1:OrganicClaimAgencyCode-*`); `gs1:dietCode` → array di `gs1:DietTypeCodeDetails`
  (`gs1:DietTypeCode-*`, es. `VEGAN`, `VEGETARIAN`, `ORGANIC`).
- **Certificazioni**: `gs1:certification` → array di `gs1:CertificationDetails`
  (`gs1:certificationAgency`, `gs1:certificationStandard`, `gs1:certificationValue`).
- **Bevande**: `gs1:Beverage` (sottoclasse di `gs1:FoodBeverageTobaccoProduct`) come `@type`
  aggiuntivo dove pertinente, con `gs1:percentageOfAlcoholByVolume` (il cui dominio è proprio
  `gs1:Beverage`, non il generico `gs1:Product`).
- **Organizzazioni**: `gs1:manufacturer` e `gs1:brandOwner` → `gs1:Organization`, con
  `gs1:organizationName`, `gs1:globalLocationNumber` e `gs1:homepage` dove disponibili.
- **Offerta commerciale**: `gs1:Offer`/`gs1:priceSpecification`/`gs1:seller` accanto ai
  corrispondenti `schema:Offer`/`schema:priceSpecification` — il vocabolario GS1 ha proprie
  classi/proprietà per il prezzo, usate qui insieme (non al posto di) quelle di schema.org.

### Stringhe multilingua (`rdf:langString`)

Le proprietà testuali con range `rdf:langString` dichiarato nel vocabolario (ingredienti,
allergeni, nome organizzazione, nome marchio, denominazione legale, conservazione,
certificazioni, istruzioni di preparazione…) sono scritte nella forma
`{"@value": "…", "@language": "it"}`, non come stringa semplice: senza tag lingua un
letterale JSON-LD non è un `rdf:langString` valido per chi consuma il documento come RDF, resta
una stringa non tipizzata.

### Disciplina sui dati

Ogni prodotto di questo catalogo è trascritto da una scheda ufficiale GS1 Immagino fornita
dall'azienda. Nessun dato di prodotto è inventato; dove un'informazione non è presente nella
scheda sorgente (es. paese di origine non dichiarato, traduzione inglese non disponibile), la
proprietà corrispondente è semplicemente omessa, mai indovinata. L'unica eccezione dichiarata è
il riferimento di sede del GLN (vedi sopra), per la quale non esiste una fonte pubblica
verificabile: è segnalata come dimostrativa ovunque compare.
