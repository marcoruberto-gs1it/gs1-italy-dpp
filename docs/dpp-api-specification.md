# Guida di Architettura e Specifica Tecnica API per Applicazioni DPP
**Infrastruttura Conforme agli Standard Armonizzati CEN/CENELEC JTC 24 & GS1**

---

## 1. Introduzione e Principi di Architettura

La presente guida definisce le specifiche tecniche, gli endpoint API, i formati payload e gli schemi di validazione JSON per lo sviluppo di un'applicazione software o servizio cloud per il **Passaporto Digitale di Prodotto (DPP)** pienamente conforme alla normativa europea **ESPR (Regolamento UE 2024/1781)** e al quadro di standardizzazione CEN/CENELEC JTC 24.

### 1.1 Standard Tecnici di Riferimento
L'architettura software deve implementare in modo stringente le seguenti 8 norme europee armonizzate:
1. **EN 18219:2026** – *Unique Identifiers*: Gestione di identificativi univoci di prodotto (UPI: GS1 Digital Link, SGTIN), operatore (UOI: GLN, EORI) e stabilimento (UFI: GLN).
2. **EN 18220:2026** – *Data Carriers*: Codifica vettori fisici AIDC (QR code con GS1 Digital Link, RFID/NFC con EPC TDS 2.3).
3. **EN 18216:2026** – *Data Exchange Protocols*: Protocolli di rete sicuri (HTTPS / TLS 1.2+ / HTTP/2+) e Content Negotiation (JSON, JSON-LD, HTML).
4. **EN 18222:2026** – *APIs for Lifecycle Management*: Interfacce RESTful per lettura, creazione, aggiornamento, cancellazione e notifica dei passaporti.
5. **EN 18223:2026** – *System Interoperability*: Modello dati concettuale UML, classi `DigitalProductPassport` e `DataElement`, e dizionari esterni (`dictionaryReference` / GS1 Web Vocabulary).
6. **EN 18221:2026** – *Data Storage, Archiving and Persistence*: Archiviazione storica OAIS (ISO 14721), registro modifiche inalterabile e replica verso il *Back-up Service Provider*.
7. **EN 18239:2026** – *Access Rights Management and Security*: Profilazione RBAC dei diritti d'accesso sui dati controllati e riservatezza commerciale.
8. **EN 18246:2026** – *Data Authentication and Integrity*: Firme digitali al livello del dato (ESDC, W3C Verifiable Credentials, QSeal eIDAS).

---

## 2. Requisiti di Protocollo e Comunicazione Sicura (EN 18216)

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

## 3. Specifiche delle API del Ciclo di Vita (EN 18222 Main Methods)

Tutti gli endpoint API utilizzano il prefisso di versione `/v1/` e sono definiti secondo lo stile RESTful.

### 3.1 `GET /v1/dpps/{dppId}` – ReadDPPById (Obbligatorio)
Restituisce il passaporto completo o filtrato in base ai diritti d'accesso dell'utente richiedente partendo dal suo ID univoco.

* **HTTP Method:** `GET`
* **Path:** `/v1/dpps/{dppId}` (Percent-encoding obbligatorio per `dppId`)
* **Query Parameters:**
  * `representation` (opzionale): `compressed` (default, conforme EN 18223 Cl. 5.2) oppure `full` (conforme EN 18223 Allegato A).
* **Headers:**
  * `Accept`: `application/json`, `application/ld+json` oppure `text/html`
  * `Authorization`: `Bearer <token>` (Opzionale per dati pubblici; obbligatorio per dati controllati)

**Esempio di Risposta JSON (200 OK - Compressed Representation):**
```json
{
  "digitalProductPassportId": "https://dpp.company.com/dpp/EV-BATT-2026-987654",
  "uniqueProductIdentifier": "https://id.company.com/01/08012345678901/21/SN-2026-XYZ987",
  "granularity": "Item",
  "dppSchemaVersion": "EN18223:v1.0",
  "dppStatus": "Active",
  "lastUpdated": "2026-09-23T10:30:00Z",
  "economicOperatorId": "urn:gs1:gln:8012345000008",
  "facilityId": "urn:gs1:gln:8012345000015",
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
  "dppStatus": "Active",
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
  "uniqueEconomicOperatorIdentifier": "urn:gs1:gln:8012345000008",
  "uniqueEconomicOperatorIdentifierBackup": "urn:gs1:gln:8099999000001",
  "dppApiEndpoint": "https://dpp.company.com/v1/dpps/EV-BATT-2026-987654",
  "granularity": "Item",
  "productGroup": "Batteries"
}
```
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
  "description": "Schema di validazione JSON ufficiale per il Passaporto Digitale di Prodotto secondo la EN 18223:2026.",
  "type": "object",
  "required": [
    "digitalProductPassportId",
    "uniqueProductIdentifier",
    "granularity",
    "dppSchemaVersion",
    "dppStatus",
    "lastUpdated",
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
      "description": "Identificativo univoco di prodotto conforme alla norma EN 18219 (es. GS1 Digital Link)."
    },
    "granularity": {
      "type": "string",
      "enum": ["Model", "Batch", "Item"],
      "description": "Livello di granularità della registrazione."
    },
    "dppSchemaVersion": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.-]+:v[0-9]+\.[0-9]+$",
      "description": "Versione dello schema di riferimento (es. EN18223:v1.0)."
    },
    "dppStatus": {
      "type": "string",
      "enum": ["Active", "Inactive", "Archived", "Invalid"],
      "description": "Stato operativo della risorsa passaporto."
    },
    "lastUpdated": {
      "type": "string",
      "format": "date-time",
      "description": "Timestamp UTC dell'ultimo aggiornamento conforme a ISO 8601-1."
    },
    "economicOperatorId": {
      "type": "string",
      "description": "Identificativo dell'operatore economico conforme a EN 18219 (es. GLN GS1)."
    },
    "facilityId": {
      "type": "string",
      "description": "Identificativo dello stabilimento produttivo (opzionale)."
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

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://registry.product-passport.ec.europa.eu/schemas/v1.0/dpp-registry-entry.schema.json",
  "title": "DppRegistryEntry",
  "description": "Schema per la validazione della notifica al Registro Centrale Europeo (Regolamento UE 2026/1778).",
  "type": "object",
  "required": [
    "uniqueProductIdentifier",
    "digitalProductPassportId",
    "uniqueEconomicOperatorIdentifier",
    "dppApiEndpoint",
    "granularity"
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
      "type": "string"
    },
    "dppApiEndpoint": {
      "type": "string",
      "format": "uri"
    },
    "granularity": {
      "type": "string",
      "enum": ["Model", "Batch", "Item"]
    },
    "productGroup": {
      "type": "string"
    }
  },
  "additionalProperties": false
}
```

---

## 7. Sicurezza, Autenticazione e Tracciabilità (EN 18239 & EN 18246)

### 7.1 Architettura della Sicurezza
1. **Dati Pubblici (Unauthenticated):** Accesso `GET` in lettura per consumatori e cittadini generici. **Nessun login, nessuna registrazione, nessun tracciamento di dati personali**.
2. **Dati Controllati (Authenticated & Authorized):** Accesso profilato basato sul principio del *Need-to-Know* (RBAC).
3. **Autenticazione Attori:** Basata su credenziali digitali fiduciarie (OAuth2 / OIDC con certificati **eIDAS QSeal** o **W3C Verifiable Credentials**).
4. **Firma del Dato (ESDC - EN 18246):** Il payload inviato alle autorità o memorizzato nell'archivio storico include un blocco di firma crittografica `ESDC` (Electronically Signed Data Construct) per garantire l'impossibilità di manomissioni retroattive.
5. **Log di Audit Inalterabile (EN 18221):** Ogni operazione di modifica (`PATCH`, `POST`, `DELETE`) registra in modo immutabile l'ID dell'attore, il timestamp UTC, i campi modificati e la firma digitale del richiedente.

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
l'utente può inserire un GLN GS1 vero, coerente con la descrizione del campo nello schema §6.1
("conforme a EN 18219, es. GLN GS1"). Gli altri campi obbligatori/opzionali che lo standard
assegna al sistema (`digitalProductPassportId`, `granularity`, `dppSchemaVersion`, `dppStatus`,
`lastUpdated`, `contentSpecificationIds`) restano non editabili per costruzione — modificarli a
mano romperebbe un vincolo che lo standard stesso pone (es. `dppSchemaVersion` è la dichiarazione
di conformità di QUESTA implementazione) — ma sono comunque mostrati nel form, con spiegazione e
citazione, non solo nell'anteprima JSON-LD.

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
- **`sectorId`**: non è un campo dello schema (8 dei 9 settori demo condividono lo stesso
  `contentSpecificationId` ESPR, non abbastanza per risalire al settore) — passato come query
  param su Create/Update invece che nel corpo, così il body resta esattamente lo schema §6.1.
- **`dppsByIdAndDate`**: nessuno storico versioni reale (EN 18221 mai implementato) — restituisce
  la versione corrente se la data richiesta cade dopo la creazione, 404 altrimenti; dichiarato nel
  commento della rotta, non finto.
- **§5 (Fine Granular API, JSONPath)**: non implementata — nessun campo abbastanza grande da
  giustificarla in una demo con poche decine di schede.

Il §4/§6.2 (payload verso il Registro UE) descrive il metodo astratto "RegisterProductDPP" — **non**
implementato letteralmente: `registry-api/src/mockRegistryClient.ts` parla con l'istanza reale di
mock-eu-registry (CIRPASS-2), che ha un proprio schema concreto con nomi di campo diversi (`upi`,
`reoId`, `liveURL`…). I due schemi non sono intercambiabili — vedi il commento in cima a
`mockRegistryClient.ts` per la corrispondenza campo per campo tra i due.
