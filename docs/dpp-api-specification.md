# Guida di Architettura e Specifica Tecnica API per Applicazioni DPP
**Infrastruttura Conforme agli Standard Armonizzati CEN/CENELEC JTC 24 & GS1**

---

## 1. Introduzione e Principi di Architettura

La presente guida definisce le specifiche tecniche, gli endpoint API, i formati payload e gli schemi di validazione JSON per lo sviluppo di un'applicazione software o servizio cloud per il **Passaporto Digitale di Prodotto (DPP)** pienamente conforme alla normativa europea **ESPR (Regolamento UE 2024/1781)** e al quadro di standardizzazione CEN/CENELEC JTC 24.

### 1.1 Standard Tecnici di Riferimento
L'architettura software deve implementare in modo stringente le seguenti 8 norme europee armonizzate:
1. **EN 18219:2026** – *Unique Identifiers*: identificativi univoci di prodotto (UPI), operatore economico (UOI) e stabilimento (UFI). La norma ammette più schemi (anche non-GS1: W3C DID, ISO 26324 DOI, EN IEC 61406 Identification Link, ISO/IEC 6523 con altri registri come LEI/DUNS/EORI/VAT); questo progetto usa **solo** gli schemi GS1-compatibili che la norma elenca: per l'UPI, GS1 Digital Link (ISO/IEC 15459 + ISO/IEC 15418, AI `01`/`10`/`21` — Cl. 5, scheme 1); per UOI e UFI, il GLN GS1 via Application Identifier `417`/`414` (ISO/IEC 15418 — Cl. 6, scheme 7).
2. **FprEN 18220:2026** – *Data Carriers*: Codifica vettori fisici AIDC (QR code con GS1 Digital Link, RFID/NFC con EPC TDS 2.3).
3. **FprEN 18216:2026** – *Data Exchange Protocols*: Protocolli di rete sicuri (HTTPS / TLS 1.2+ / HTTP/2+) e Content Negotiation (JSON, JSON-LD, HTML).
4. **FprEN 18222:2026** – *APIs for Lifecycle Management*: Interfacce RESTful per lettura, creazione, aggiornamento, cancellazione e notifica dei passaporti.
5. **FprEN 18223:2026** – *System Interoperability*: Modello dati concettuale UML, classi `DigitalProductPassport` e `DataElement`, e dizionari esterni (`dictionaryReference` / GS1 Web Vocabulary).
6. **FprEN 18221:2026** – *Data Storage, Archiving and Persistence*: Archiviazione storica OAIS (ISO 14721), registro modifiche inalterabile e replica verso il *Back-up Service Provider*.
7. **prEN 18239:2025** – *Access Rights Management and Security*: Profilazione RBAC dei diritti d'accesso sui dati controllati e riservatezza commerciale.
8. **prEN 18246:2025** – *Data Authentication and Integrity*: Firme digitali al livello del dato (ESDC, W3C Verifiable Credentials, QSeal eIDAS).

Nota sui prefissi: **EN 18219:2026** (la n. 1) è ormai testo definitivo pubblicato, da cui la sezione
sull'identificazione qui sotto e nel resto del progetto è allineata direttamente; **FprEN** ("Final
Draft") per le altre 5 tra le prime 6, ancora in **prEN** (draft precedente) per le ultime 2 — non un
refuso, è lo stato di avanzamento reale di ciascuna dichiarato nell'introduzione di entrambi i Final
Draft FprEN 18222/18223 (testi di riferimento di questa sezione).

---

## 2. Requisiti di Protocollo e Comunicazione Sicura (FprEN 18216)

### 2.1 Requisiti di Rete
* **Protocollo:** HTTP over TLS (HTTPS).
* **Versione TLS:** TLS 1.2 come versione minima obbligatoria; **TLS 1.3 fortemente raccomandato**. *Proibiti espressamente TLS 1.0, 1.1 e tutte le versioni SSL*.
* **Versione HTTP:** **HTTP/2 come versione minima obbligatoria**; HTTP/3 raccomandato. *Proibite versioni inferiori a HTTP/2 (es. HTTP/1.1)*.
* **Integrità Messaggio:** Cifratura simmetrica e controlli MAC (*Message Authentication Codes*).

### 2.2 Content Negotiation (Interoperabilità Sintattica e Accessibilità)
Il server deve supportare la negoziazione del contenuto tramite l'intestazione HTTP `Accept`:
* **`application/json` (Obbligatorio):** Interscambio dati fondamentale machine-to-machine (ISO/IEC 21778).
* **`application/ld+json` (Raccomandato):** Linked Data per collegare i dati al **GS1 Web Vocabulary** o ad altri dizionari semantici.
* **`text/html` (Obbligatorio per consumatori):** Rendering visivo conforme ai requisiti di accessibilità **EN 301549:2021** (WCAG 2.1 AA) per la consultazione da browser mobile senza credenziali o app dedicate.

---

## 3. Specifiche delle API del Ciclo di Vita (FprEN 18222 Main Methods)

Tutti gli endpoint API utilizzano il prefisso di versione `/v1/` e sono definiti secondo lo stile RESTful.

### 3.1 `GET /v1/dpps/{dppId}` – ReadDPPById (Obbligatorio)
Restituisce il passaporto completo o filtrato in base ai diritti d'accesso dell'utente richiedente partendo dal suo ID univoco.

* **HTTP Method:** `GET`
* **Path:** `/v1/dpps/{dppId}` (Percent-encoding obbligatorio per `dppId`)
* **Query Parameters:**
  * `representation` (opzionale): `compressed` (default, conforme FprEN 18223 Cl. 5.2) oppure `full` (conforme FprEN 18223 Allegato A).
* **Headers:**
  * `Accept`: `application/json`, `application/ld+json` oppure `text/html`
  * `Authorization`: `Bearer <token>` (Opzionale per dati pubblici; obbligatorio per dati controllati)

**Esempio di Risposta JSON (200 OK - Compressed Representation):**
```json
{
  "digitalProductPassportId": "https://dpp.company.com/dpp/EV-BATT-2026-987654",
  "uniqueProductIdentifier": "https://id.company.com/01/08012345678901/21/SN-2026-XYZ987",
  "granularity": "item",
  "dppSchemaVersion": "EN18223:v1.0",
  "dppStatus": "active",
  "lastUpdate": "2026-09-23T10:30:00Z",
  "economicOperatorId": "https://id.gs1.org/417/8012345000008",
  "facilityId": "https://id.gs1.org/414/8012345000015",
  "contentSpecificationIds": [
    "EU_BATTERY_REGULATION_2023_1542"
  ],
  "productGeneralInfo": {
    "brandName": "VoltPower",
    "modelDesignation": "EV-PowerCell-Pro-80",
    "commercialCategory": "Electric Vehicle Battery"
  },
  "batteryTechnicalSpecs": {
    "ratedCapacitykWh": 82.5,
    "nominalVoltageV": 400.0,
    "chemistryType": "Li-Ion NMC",
    "carbonFootprintKgCO2eq": 3200.5
  },
  "documentation": [
    {
      "resourceTitle": "Manual di Sicurezza e Manutenzione Battery Pack",
      "contentType": "application/pdf",
      "url": "https://dpp.company.com/docs/manual_ev_80.pdf",
      "language": "it-IT"
    }
  ]
}
```

---

### 3.2 `GET /v1/dppsByProductId/{productId}` – ReadDPPByProductId (Obbligatorio)
Restituisce l'ultima versione attiva del passaporto associata all'Identificativo Univoco di Prodotto (`uniqueProductIdentifier`, es. GS1 Digital Link).

* **HTTP Method:** `GET`
* **Path:** `/v1/dppsByProductId/{productId}` (Percent-encoding per l'URL del prodotto)
* **Query Parameters:** `representation=compressed|full`
* **HTTP Status Codes:**
  * `200 OK`: Passaporto trovato e restituito.
  * `404 Not Found`: Nessun passaporto attivo associato all'ID prodotto.

---

### 3.3 `GET /v1/dppsByIdAndDate/{dppId}` – ReadDPPVersionByIdAndDate (Raccomandato)
Restituisce la versione storica del passaporto valida alla data/ora UTC specificata.

* **HTTP Method:** `GET`
* **Path:** `/v1/dppsByIdAndDate/{dppId}?date=2026-08-15T12:00:00Z`
* **Query Parameters:** `date` (timestamp ISO 8601-1 UTC obbligatorio)

---

### 3.4 `POST /v1/dppsByProductIds` – ReadDPPIdsByProductIds (Obbligatorio)
Ricerca in blocco e restituisce l'elenco di ID passaporto corrispondenti a un set di identificatori prodotto.

* **HTTP Method:** `POST`
* **Path:** `/v1/dppsByProductIds`
* **Payload Richiesta:**
```json
{
  "productIds": [
    "https://id.company.com/01/08012345678901/21/SN-2026-000001",
    "https://id.company.com/01/08012345678901/21/SN-2026-000002"
  ],
  "limit": 50,
  "cursor": "eyJvZmZzZXQiOjEwfQ=="
}
```
* **Payload Risposta (200 OK):**
```json
{
  "dppIds": [
    "https://dpp.company.com/dpp/EV-BATT-2026-000001",
    "https://dpp.company.com/dpp/EV-BATT-2026-000002"
  ],
  "nextCursor": null
}
```

---

### 3.5 `POST /v1/dpps` – CreateDPP (Raccomandato per Service Provider)
Inizializza e memorizza un nuovo Passaporto Digitale di Prodotto.

* **HTTP Method:** `POST`
* **Path:** `/v1/dpps`
* **Payload Richiesta:** Il JSON del passaporto completo.
* **Risposta (201 Created):**
```json
{
  "statusCode": "SuccessCreated",
  "digitalProductPassportId": "https://dpp.company.com/dpp/EV-BATT-2026-987654"
}
```

---

### 3.6 `PATCH /v1/dpps/{dppId}` – UpdateDPPById (Obbligatorio per terze parti autorizzate)
Aggiorna parzialmente il passaporto registrando le modifiche storicizzate (conforme a **RFC 7396 JSON Merge Patch**).

* **HTTP Method:** `PATCH`
* **Path:** `/v1/dpps/{dppId}`
* **Payload Richiesta:**
```json
{
  "dppStatus": "active",
  "batteryTechnicalSpecs": {
    "stateOfHealthSoHPercentage": 96.5,
    "completedChargeCycles": 142
  }
}
```
* **Risposta (200 OK):** Restituisce il JSON aggiornato del passaporto.

---

### 3.7 `DELETE /v1/dpps/{dppId}` – DeleteDPPById (Raccomandato)
Rimuove o disattiva un passaporto al raggiungimento del fine vita reale del prodotto.

* **HTTP Method:** `DELETE`
* **Path:** `/v1/dpps/{dppId}`
* **Risposta (204 No Content / 200 OK)**

---

## 4. Specifica dell'API del Registro Centrale UE (DPP Registry API)

### 4.1 `POST /v1/registerDPP` – RegisterProductDPP
Endpoint esposto dal server del Registro Centrale della Commissione Europea (`https://registry.product-passport.ec.europa.eu/`) per notificare e indicizzare l'UPI del prodotto.

* **HTTP Method:** `POST`
* **Path:** `/v1/registerDPP`
* **Header Richiesta:** `Authorization: Bearer <QSeal_eIDAS_Token>`
* **Payload Richiesta (`DppRegistryEntry`):**
```json
{
  "uniqueProductIdentifier": "https://id.company.com/01/08012345678901/21/SN-2026-XYZ987",
  "digitalProductPassportId": "https://dpp.company.com/dpp/EV-BATT-2026-987654",
  "uniqueEconomicOperatorIdentifier": "https://id.gs1.org/417/8012345000008",
  "uniqueEconomicOperatorIdentifierBackup": "https://id.gs1.org/417/8099999000001",
  "dppApiEndpoint": "https://dpp.company.com/v1/dpps/EV-BATT-2026-987654"
}
```
Solo questi 5 campi: `DppRegistryEntry` (Table 11, FprEN 18222 §7.1) non include `granularity` né
`productGroup` — nessuno dei due compare nella definizione ufficiale, a differenza di quanto
riportava una versione precedente di questa guida (vedi nota di correzione in fondo al documento).
Il registro riceve solo identificativi + l'indirizzo (`dppApiEndpoint`) dove va cercato il DPP
vero: nessun dato di prodotto/semantico transita da questo endpoint.
* **Payload Risposta (200 OK):**
```json
{
  "statusCode": "Success",
  "registrationId": "URI-EU-REG-2026-8877665544332211"
}
```

---

## 5. Specifiche delle API a Granularità Fine (Fine Granular API)

Consentono l'accesso e l'aggiornamento "chirurgico" di singoli campi dati senza scaricare o reinviare l'intero passaporto, utilizzando lo standard **RFC 9535 (JSONPath)**.

### 5.1 `GET /v1/dpps/{dppId}/elements/{elementIdPath}` – ReadDataElement
* **HTTP Method:** `GET`
* **Path:** `/v1/dpps/EV-BATT-2026-987654/elements/batteryTechnicalSpecs.ratedCapacitykWh`
* **Risposta (200 OK):**
```json
{
  "elementId": "ratedCapacitykWh",
  "value": 82.5,
  "dictionaryReference": "https://ref.gs1.org/voc/ratedCapacity"
}
```

### 5.2 `PATCH /v1/dpps/{dppId}/elements/{elementIdPath}` – UpdateDataElement
* **HTTP Method:** `PATCH`
* **Path:** `/v1/dpps/EV-BATT-2026-987654/elements/batteryTechnicalSpecs.stateOfHealthSoHPercentage`
* **Payload Richiesta:**
```json
{
  "value": 95.8
}
```

---

## 6. Schemi di Validazione JSON (JSON Schema Validation Draft 2020-12)

### 6.1 Schema Validazione del Passaporto (`dpp-payload.schema.json`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://standards.cen.eu/dpp/schemas/v1.0/dpp-payload.schema.json",
  "title": "DigitalProductPassport",
  "description": "Schema di validazione JSON ufficiale per il Passaporto Digitale di Prodotto secondo la FprEN 18223:2026.",
  "type": "object",
  "required": [
    "digitalProductPassportId",
    "uniqueProductIdentifier",
    "granularity",
    "dppSchemaVersion",
    "dppStatus",
    "lastUpdate",
    "economicOperatorId"
  ],
  "properties": {
    "digitalProductPassportId": {
      "type": "string",
      "format": "uri",
      "description": "URI/URL univoco globale dell'istanza del passaporto."
    },
    "uniqueProductIdentifier": {
      "type": "string",
      "format": "uri",
      "description": "Identificativo univoco di prodotto conforme a EN 18219:2026 — GS1 Digital Link (GTIN via AI 01, con AI 10/21 per lotto/articolo)."
    },
    "granularity": {
      "type": "string",
      "enum": ["model", "batch", "item"],
      "description": "Livello di granularità della registrazione (FprEN 18223 §4.1.2.2)."
    },
    "dppSchemaVersion": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.-]+:v[0-9]+\.[0-9]+$",
      "description": "Versione dello schema di riferimento (es. EN18223:v1.0)."
    },
    "dppStatus": {
      "type": "string",
      "enum": ["active", "inactive", "archived", "invalid"],
      "description": "Stato operativo della risorsa passaporto (FprEN 18223 Table 1)."
    },
    "lastUpdate": {
      "type": "string",
      "format": "date-time",
      "description": "Timestamp UTC dell'ultimo aggiornamento conforme a ISO 8601-1 (FprEN 18223 Table 1: \"lastUpdate\")."
    },
    "economicOperatorId": {
      "type": "string",
      "description": "Identificativo dell'operatore economico conforme a EN 18219:2026 — GLN GS1 come URI GS1 Digital Link, Application Identifier 417 (ISO/IEC 15418)."
    },
    "facilityId": {
      "type": "string",
      "description": "Identificativo dello stabilimento produttivo (opzionale), conforme a EN 18219:2026 — GLN GS1 come URI GS1 Digital Link, Application Identifier 414 (ISO/IEC 15418)."
    },
    "contentSpecificationIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Riferimenti agli atti delegati o specifiche settoriali."
    },
    "documentation": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/RelatedResource"
      }
    }
  },
  "additionalProperties": true,
  "$defs": {
    "RelatedResource": {
      "type": "object",
      "required": ["contentType", "url"],
      "properties": {
        "resourceTitle": {
          "type": "string"
        },
        "contentType": {
          "type": "string",
          "pattern": "^[a-zA-Z0-9]+/[a-zA-Z0-9.+-]+$"
        },
        "url": {
          "type": "string",
          "format": "uri"
        },
        "language": {
          "type": "string",
          "pattern": "^[a-z]{2}(-[A-Z]{2})?$"
        }
      }
    }
  }
}
```

---

### 6.2 Schema Validazione del Registro UE (`dpp-registry-entry.schema.json`)

Campi esattamente come elencati in Table 11 (FprEN 18222, tipo `DppRegistryEntry`) — nessun campo
aggiuntivo: il registro è solo un indice di puntatori (chi è il prodotto, chi è l'operatore
economico, dove si trova il DPP vero), non un secondo posto dove finiscono i dati di prodotto.
`granularity`/`dppStatus`/`contentSpecificationIds`/ecc. appartengono al DPP stesso (schema §6.1),
mai al registro.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://registry.product-passport.ec.europa.eu/schemas/v1.0/dpp-registry-entry.schema.json",
  "title": "DppRegistryEntry",
  "description": "Schema per la notifica al Registro Centrale Europeo (FprEN 18222 §5.2 Method RegisterProductDPP, Table 11).",
  "type": "object",
  "required": [
    "uniqueProductIdentifier",
    "digitalProductPassportId",
    "uniqueEconomicOperatorIdentifier",
    "dppApiEndpoint"
  ],
  "properties": {
    "uniqueProductIdentifier": {
      "type": "string",
      "format": "uri",
      "maxLength": 500
    },
    "digitalProductPassportId": {
      "type": "string",
      "format": "uri"
    },
    "uniqueEconomicOperatorIdentifier": {
      "type": "string"
    },
    "uniqueEconomicOperatorIdentifierBackup": {
      "type": "string",
      "description": "\"uniqueEconomicOperatorIdentifier of the Back-up operator\" in Table 11 — facoltativo, non ogni registrazione ha un secondo operatore/service provider di backup."
    },
    "dppApiEndpoint": {
      "type": "string",
      "format": "uri"
    }
  },
  "additionalProperties": false
}
```

---

## 7. Sicurezza, Autenticazione e Tracciabilità (prEN 18239 & prEN 18246)

### 7.1 Architettura della Sicurezza
1. **Dati Pubblici (Unauthenticated):** Accesso `GET` in lettura per consumatori e cittadini generici. **Nessun login, nessuna registrazione, nessun tracciamento di dati personali**.
2. **Dati Controllati (Authenticated & Authorized):** Accesso profilato basato sul principio del *Need-to-Know* (RBAC).
3. **Autenticazione Attori:** Basata su credenziali digitali fiduciarie (OAuth2 / OIDC con certificati **eIDAS QSeal** o **W3C Verifiable Credentials**).
4. **Firma del Dato (ESDC - prEN 18246):** Il payload inviato alle autorità o memorizzato nell'archivio storico include un blocco di firma crittografica `ESDC` (Electronically Signed Data Construct) per garantire l'impossibilità di manomissioni retroattive.
5. **Log di Audit Inalterabile (FprEN 18221):** Ogni operazione di modifica (`PATCH`, `POST`, `DELETE`) registra in modo immutabile l'ID dell'attore, il timestamp UTC, i campi modificati e la firma digitale del richiedente.

---

*Specifica tecnica generata in conformità con il quadro normativo ESPR e le pubblicazioni ufficiali CEN/CENELEC JTC 24.*

---

## Nota di implementazione (gs1-italy-dpp)

Questa demo implementa il payload del §6.1 (`dpp-payload.schema.json`) nel JSON-LD pubblico di ogni
DPP — vedi `registry-api/src/jsonld.ts#dppToJsonLd` (fonte), duplicato per la stessa ragione già
documentata altrove in `src/app/utils/dpp-jsonld.ts` (Admin.previewJsonLd e Product.dppJsonLdJson,
stesso contratto tenuto a mano tra i tre). Tutti i 7 campi obbligatori sono presenti, più
`facilityId` e `contentSpecificationIds` tra gli opzionali (`documentation` è omesso: la demo non
ha documenti reali da collegare, e il campo è facoltativo).

`economicOperatorId`/`facilityId` sono compilabili nel form admin (colonne `economic_operator_id`/
`facility_id` in `db.ts`, con un default demo se lasciati vuoti) — non più costanti fisse:
l'utente può inserire un GLN GS1 vero, come URI GS1 Digital Link (`https://id.gs1.org/417/{gln}` /
`https://id.gs1.org/414/{gln}`), coerente con la descrizione del campo nello schema §6.1 ("conforme
a EN 18219:2026 — GLN GS1, AI 417/414"). Gli altri campi obbligatori/opzionali che lo standard
assegna al sistema (`digitalProductPassportId`, `granularity`, `dppSchemaVersion`, `dppStatus`,
`lastUpdate`, `contentSpecificationIds`) restano non editabili per costruzione — modificarli a
mano romperebbe un vincolo che lo standard stesso pone (es. `dppSchemaVersion` è la dichiarazione
di conformità di QUESTA implementazione) — ma sono comunque mostrati nel form, con spiegazione e
citazione, non solo nell'anteprima JSON-LD.

**Nomi e valori allineati al testo ufficiale FprEN 18222:2026/18223:2026 (Final Draft, febbraio
2026, sottoposto a voto formale CEN).** Le sezioni precedenti di questo documento erano state
scritte prima che il testo dei due Final Draft fosse disponibile a questo progetto, basandosi su
fonti secondarie indipendenti (in particolare
[`openepcis/openepcis-dpp-ready`](https://github.com/openepcis/openepcis-dpp-ready), Apache-2.0).
Con il testo ufficiale ora disponibile, i punti che quella prima stesura descriveva come
"divergenza dichiarata" (in favore di OpenEPCIS, rispetto allo schema §6.1 qui sopra) sono stati
verificati e corretti direttamente contro le Tabelle normative:
- **`granularity`/`dppStatus` minuscoli** (`"model"/"batch"/"item"`, `"active"/"inactive"/
  "archived"/"invalid"`): confermato da FprEN 18223 §4.1.2.2 (prosa normativa) e dalla nota
  EXAMPLE della Table 1 — non una scelta di stile, è quanto richiede il testo. Lo schema §6.1 qui
  sopra è stato corretto di conseguenza (era "Model"/"Active" con iniziale maiuscola, errato).
- **`dppSchemaVersion` in formato `"<norma>:v<major>.<minor>"`** (es. `"EN18223:v1.0"`): confermato
  dall'esempio dello stesso §5.2.4 del documento (`"ENXXX:v1.0"`) e dall'esempio XML in Annex B
  (`"prEN18223:v1.0"`) — il pattern regex nello schema §6.1 qui sopra era già corretto; era la
  scelta di OpenEPCIS (`"FprEN 18223:2026"`, norma+anno) a non essere quella del testo ufficiale.
- **`lastUpdate`, non `lastUpdated`**: la Table 1 (§4.1.2.1) nomina l'attributo `lastUpdate` — gli
  esempi JSON/XML dello stesso documento (§5.2.4, Annex B) scrivono però `lastUpdated`, in
  contraddizione con la propria tabella. Per la regola di precedenza esplicita del documento
  stesso (§4.1.1: "If there are discrepancies between the UML diagrams, text and JSON
  representations the prose text of Clause 4, including the tables, is authoritative"), vince
  `lastUpdate` — corretto qui e nel codice (era `lastUpdated` in entrambi).
- **`economicOperatorId`/`facilityId` come URI GS1 Digital Link con AI 417/414**
  (`"https://id.gs1.org/417/8012345000008"`), non più come URN GLN nudo (`"urn:gs1:gln:..."`): il
  testo ufficiale di **EN 18219:2026**, ora disponibile, Cl. 6 elenca per l'operatore economico e
  per lo stabilimento due schemi GS1-compatibili — ISO/IEC 6523 (scheme 6, GLN come registered ID
  scheme ICD `0088`) e **ISO/IEC 15418 con GS1 Application Identifier** (scheme 7, AI `417`/`414`),
  quest'ultimo esattamente la sintassi GS1 Digital Link già usata in tutto il resto del progetto per
  l'UPI di prodotto. FprEN 18222/18223 non impongono un formato URI specifico su questi due campi
  oltre "identificativo conforme a EN 18219" — restava tecnicamente ammissibile anche l'URN — ma
  usare qui la stessa sintassi GS1 Digital Link (invece di un URN a sé) evita di introdurre un
  secondo formato per lo stesso tipo di chiave e resta coerente con l'indicazione del progetto di
  fare riferimento solo agli schemi di identificazione GS1-compatibili previsti dalla norma, non a
  quelli non-GS1 che la stessa norma ammette in alternativa (W3C DID, ISO 26324 DOI, EN IEC 61406
  Identification Link, o ISO/IEC 6523 con altri registri come LEI/DUNS/EORI/VAT). Corretto di
  conseguenza sia nell'esempio §5.2.4 sia nello schema §6.1 qui sopra, e già così nel codice
  (`registry-api/src/db.ts`, `src/app/utils/dpp-jsonld.ts`) prima ancora di questa revisione della
  guida.
- **`DppRegistryEntry` (§6.2) senza `granularity` né `productGroup`**: una versione precedente di
  questa guida (basata su OpenEPCIS) elencava questi due campi come parte del payload di
  registrazione al Registro UE. **Table 11 di FprEN 18222** (il tipo `DppRegistryEntry`, referenziato
  da §5.2 Method RegisterProductDPP / Table 17 REST-Path `v1/registerDPP`) elenca invece
  esplicitamente solo cinque campi: `uniqueProductIdentifier`, `digitalProductPassportId`,
  `uniqueEconomicOperatorIdentifier`, l'identificativo dell'operatore di backup, e
  `dppApiEndpoint`. Nessun dato di prodotto/settore, nessuna granularità: il registro è solo un
  indice di puntatori verso il DPP vero (servito altrove, dal "creator of the digital product
  passport or their main digital product passport service provider", FprEN 18222 §4.1) — non un
  secondo posto dove finiscono i dati semantici. Corretto sia nell'esempio §4.1 sia nello schema
  §6.2 qui sopra.

Vedi `toStandardGranularity()`/`toStandardDppStatus()` in `registry-api/src/jsonld.ts` e
`src/app/utils/dpp-jsonld.ts` per il dettaglio, con citazione di clausola/tabella esatta in
ciascun commento.

**Serializzazione degli attributi liberi di settore**: non più avvolti in un array
`schema:additionalProperty`/`PropertyValue` (scelta di questo progetto, non richiesta dallo
standard) — FprEN 18223 §5.2.6 EXAMPLE 1 mostra i Data Element liberi come chiavi piatte di primo
livello sull'oggetto DPP stesso (es. `"manufacturerName": "ExampleCorp"`), ed è quello che
`dppToJsonLd()` produce ora, con un controllo di collisione contro i 9 campi di Table 1 (un
attributo che si chiamasse per esempio `"granularity"` viene scartato con un avviso, invece di
sovrascrivere silenziosamente l'intestazione del DPP).

Le rotte REST del §3 sono implementate in `registry-api/src/routes/v1.ts`, sotto
`/registry-api/v1/dpps*` — path, verbi (inclusa la PATCH con semantica JSON Merge Patch, RFC 7396,
per UpdateDPPById) e forma del payload in ingresso/uscita, verificati uno per uno dal vivo contro
questo documento. Affiancano, senza sostituirle, le rotte interne già esistenti sotto
`/registry-api/dpp` (il contratto con cui l'admin di *questo* sito crea/modifica un DPP — un solo
campo UPI, pensato per la UX del form, non per l'interoperabilità con terzi): questa qui è invece
la superficie che un sistema esterno troverebbe seguendo lo standard alla lettera. Scostamenti
dichiarati, non nascosti:
- **Autenticazione**: la spec usa `Authorization: Bearer <token>` (OAuth2/OIDC); qui il cookie di
  sessione già in uso per l'admin (nessun modello multi-tenant "service provider" con credenziali
  proprie — esplicitamente fuori scope).
- **`sectorId`**: non è un campo dello schema (9 dei 10 settori demo condividono lo stesso
  `contentSpecificationId` ESPR, non abbastanza per risalire al settore) — passato come query
  param su Create/Update invece che nel corpo, così il body resta esattamente lo schema §6.1.
- **`dppsByIdAndDate`**: nessuno storico versioni reale (FprEN 18221 mai implementato) — restituisce
  la versione corrente se la data richiesta cade dopo la creazione, 404 altrimenti; dichiarato nel
  commento della rotta, non finto.
- **§5 (Fine Granular API, JSONPath)**: non implementata — nessun campo abbastanza grande da
  giustificarla in una demo con poche decine di schede.

Il §4/§6.2 (payload verso il Registro UE) descrive il metodo astratto "RegisterProductDPP" — **non**
implementato letteralmente: `registry-api/src/mockRegistryClient.ts` parla con l'istanza reale di
mock-eu-registry (CIRPASS-2), che ha un proprio schema concreto con nomi di campo diversi (`upi`,
`reoId`, `liveURL`…). I due schemi non sono intercambiabili — vedi il commento in cima a
`mockRegistryClient.ts` per la corrispondenza campo per campo tra i due.

## Endpoint di dimostrazione: registrazione, storico, simulazione e traccia

Aggiunti a `registry-api` per rendere ispezionabile ogni passaggio. Non fanno parte delle API
normative FprEN 18222/18223 (le rotte `/registry-api/v1/…`), sono estensioni della demo.

| Metodo e percorso | Auth | Cosa fa |
|---|---|---|
| `GET /registry-api/public/dpp/{gtin}/registry-entry` | no | Richiesta (`POST /metadata/v1`) e risposta REALI del DPP Registry UE alla registrazione, con gli identificativi assegnati (`registryId`, …). Per le schede registrate prima che venissero salvate: richiesta ricostruita (`requestReconstructed: true`) e risposta riletta dal registro se possibile. |
| `GET /registry-api/public/dpp/{gtin}/history` | no | Storico delle modifiche nel tempo (reali o simulate): titolo, riepilogo e cosa è cambiato (prima/dopo). |
| `POST /registry-api/dpp/{id}/simulate-change` | sì | Simula una modifica nel tempo di un DPP **pubblicato e non statico**. Body: `{ "scenario": "repair" \| "recycled-content" \| "carbon-recalc" \| "certificate-renewal" \| "software-update" \| "end-of-life" \| "custom", "monthsLater": 1-120, "patch": {…} }` (`patch` solo per `custom`, semantica JSON Merge Patch RFC 7396, `null` rimuove una chiave). Aggiorna gli attributi e `lastUpdate`, registra l'evento e ri-sincronizza il resolver. **Non chiama il registro UE**: conserva solo i puntatori, non il contenuto. Risposta: `{ record, event, mergePatch }`. |
| `GET /registry-api/trace/{id}` | no (id non indovinabile) | Le chiamate che `registry-api` ha fatto verso Auth0, DPP Registry UE e resolver mentre serviva una richiesta. `{id}` è l'header `X-Trace-Id` della risposta. Segreti (`Authorization`, `client_secret`, token) oscurati; tracce solo in memoria (ultime 300). |

Nell'interfaccia il pulsante **API** (in basso a destra) mostra ogni chiamata del browser verso
`registry-api` con richiesta e risposta JSON e, aprendola, le chiamate del server verso i servizi esterni.
