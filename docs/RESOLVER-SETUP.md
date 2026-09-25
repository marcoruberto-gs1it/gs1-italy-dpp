# Configurare il GS1 Digital Link Resolver CE

Questa guida copre il **GS1-Conformant Resolver** aggiunto al progetto (vedi `resolver/README.md`
per il perché e per cosa fa) — un servizio distinto da `registry-api`, che ne resta comunque
l'unico "scrittore": non c'è un'interfaccia admin separata per il resolver, `registry-api` scrive
lì automaticamente a ogni pubblicazione (vedi `registry-api/src/resolverClient.ts`).

**In locale funziona subito, nessun account esterno da creare** — a differenza di
`docs/REGISTRY-SETUP.md` (mock-eu-registry: tre servizi esterni obbligatori), il resolver gira
interamente dentro `docker compose up -d --build`, con credenziali demo già pronte nel file
stesso. Questa guida serve soprattutto per la **produzione**, dove invece un vero MongoDB e un
vero sottodominio servono davvero.

## Locale — verificato dal vivo

```bash
docker compose up -d --build
```

Quattro servizi in più rispetto a prima (`resolver-database`, `resolver-data-entry`,
`resolver-web`, più le label Traefik che li instradano) — nessun passaggio manuale, le
credenziali demo (`gs1resolver`/`gs1resolver`, token `devtoken`) sono già nei default di
`docker-compose.yml`. Verifica:

```bash
# Crea una entry di prova (GTIN con cifra di controllo valida — il resolver la verifica davvero,
# un GTIN non valido risponde 400 "Invalid GS1 Digital Link syntax", verificato dal vivo)
curl -X POST http://id.localhost/api/new \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer devtoken" \
  -d '{
    "anchor": "/01/09521234000006",
    "itemDescription": "Prova",
    "defaultLinktype": "gs1:dpp",
    "links": [{"linktype": "gs1:dpp", "href": "http://localhost/01/09521234000006", "title": "Prova", "type": "text/html", "hreflang": ["it"]}]
  }'

# Redirect 307 verso la pagina prodotto reale del sito
curl -i http://id.localhost/01/09521234000006

# Linkset conforme allo standard (JSON-LD, RFC 9264)
curl -H "Accept: application/linkset+json" http://id.localhost/01/09521234000006

# Pulizia
curl -X DELETE http://id.localhost/api/01/09521234000006 -H "Authorization: Bearer devtoken"
```

`id.localhost` non è un'approssimazione: risolve da solo su `127.0.0.1` (RFC 6761, nessuna riga
da aggiungere a `/etc/hosts`), esattamente come farebbe un vero sottodominio `id.<dominio>` in
produzione — solo il dominio in sé cambia tra i due ambienti, l'instradamento Traefik/nginx no.

### Perché il resolver non fa fallire una pubblicazione

`registry-api/src/resolverClient.ts#syncResolverEntry` non lancia mai: se il resolver non è
raggiungibile, o `RESOLVER_SESSION_TOKEN` non è impostata, la pubblicazione vera (verso
mock-eu-registry) prosegue comunque — solo un avviso in log (`docker compose logs registry-api`).
Stessa filosofia già in vigore per `MOCK_EU_REGISTRY_URL` in `docs/REGISTRY-SETUP.md`: un
servizio esterno non configurato disattiva silenziosamente solo la sua parte, non il resto.

## Produzione (Render, senza dominio personalizzato)

Questa sezione presume che **non** abbiate ancora un dominio vero da collegare (vedi invece la
sezione successiva se ne avete uno) — si procede solo con gli URL gratuiti `*.onrender.com`,
stesso approccio di `docs/DEPLOY.md` per webshop/registry-api.

**Attenzione al nome**: come già capita a `registry-api` in `docs/DEPLOY.md`, se il nome scelto
per un servizio è già preso da qualcun altro (i sottodomini `.onrender.com` sono globali), Render
lo cambia in silenzio aggiungendo un suffisso. **L'URL vero è sempre quello mostrato in cima alla
pagina del servizio nella dashboard Render**, non necessariamente quello digitato in fase di
creazione — verificalo lì prima di incollarlo altrove.

**Perché tre servizi Render e non due**: in locale Traefik instrada `id.localhost` direttamente
ai due servizi del resolver (vedi sopra); su Render non c'è un Traefik condiviso davanti ai
vostri servizi, quindi serve un terzo servizio — `resolver/frontend_proxy_server` (adattato per
questo, vedi `resolver/README.md`) — che faccia da unico punto d'ingresso pubblico e instradi
verso gli altri due. **Verificato dal vivo in locale** (container nginx isolato puntato ai due
servizi già in esecuzione): redirect 307 e linkset funzionano identici attraverso questo proxy,
non solo attraverso Traefik.

### 1. Un vero MongoDB (MongoDB Atlas, piano free M0)

Render (piano free) non offre un database persistente per un Web Service — stesso motivo per
cui `registry-api` usa Supabase Postgres invece di SQLite locale (vedi
`docs/REGISTRY-SETUP.md`).

1. Crea un account su [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) e un nuovo
   progetto.
2. **Build a Database** → piano **M0 Free**.
3. **Database Access**: crea un utente con password (autogenerata o a scelta — salvala).
4. **Network Access**: aggiungi `0.0.0.0/0` (consenti da ovunque) — Render non ha IP statici sul
   piano free, non è possibile restringere per IP.
5. **Connect → Drivers**, copia la stringa `mongodb+srv://<utente>:<password>@.../` — questa è
   `RESOLVER_MONGO_URI` per i passi seguenti (sostituisci `<password>` con quella vera).

### 2. `resolver-data-entry` (Web Service Render, Docker)

**New → Web Service → Build and deploy from a Git repository**, stesso repository di
`registry-api`.
- **Name**: a scelta (es. `gs1it-dpp-resolver-data-entry`) — determina l'URL pubblico.
- **Root Directory**: `resolver/data_entry_server`
- **Runtime**: Docker (Dockerfile Path: `Dockerfile`, relativo alla Root Directory)
- **Instance Type**: Free
- **Environment Variables**:
  ```
  MONGO_URI=<stringa Atlas del passo 1>
  SESSION_TOKEN=<openssl rand -hex 32 — MAI "devtoken" qui>
  ```

Deploy. **Annota l'URL pubblico vero** mostrato in cima alla dashboard di questo servizio (es.
`https://gs1it-dpp-resolver-data-entry.onrender.com`) — serve subito dopo.

### 3. `resolver-web` (Web Service Render, Docker)

Stesso procedimento.
- **Name**: a scelta (es. `gs1it-dpp-resolver-web`)
- **Root Directory**: `resolver/web_server`
- **Runtime**: Docker
- **Instance Type**: Free
- **Environment Variables**:
  ```
  MONGO_URI=<stessa stringa Atlas del passo 1>
  FQDN=<valore temporaneo, es. lo stesso nome del servizio — si corregge al passo 5>
  ```

Deploy. **Annota anche questo URL pubblico vero.**

### 4. `resolver-frontend-proxy` (Web Service Render, Docker) — il vero indirizzo pubblico del resolver

- **Name**: questo È il nome che conta — sarà `<nome-scelto>.onrender.com`, l'indirizzo che
  finirà nel campo `RESOLVER_FQDN`/negli URL che condividete (es. `gs1it-dpp-resolver`).
- **Root Directory**: `resolver/frontend_proxy_server`
- **Runtime**: Docker
- **Instance Type**: Free
- **Environment Variables**:
  ```
  RESOLVER_WEB_UPSTREAM=<URL pubblico di resolver-web dal passo 3, SENZA slash finale>
  RESOLVER_DATA_ENTRY_UPSTREAM=<URL pubblico di resolver-data-entry dal passo 2, SENZA slash finale>
  ```

Deploy. **Annota l'URL pubblico vero di QUESTO servizio** — è l'indirizzo del resolver che userete
ovunque d'ora in poi (QR code, documentazione, condivisione con terzi).

### 5. Torna su `resolver-web` e correggi `FQDN`

Aggiorna la Environment Variable `FQDN` del servizio del passo 3 con l'host nudo (**senza**
`https://`, il loro codice lo antepone da solo — con lo schema incluso si ottiene un doppio
prefisso nel campo `anchor` del linkset, verificato dal vivo in locale) del servizio del passo 4:
```
FQDN=gs1it-dpp-resolver.onrender.com
```
Salva: Render fa da solo un nuovo deploy.

### 6. Verifica

Sostituisci con gli URL veri delle tue dashboard Render:
```bash
curl -X POST https://<resolver-data-entry>.onrender.com/api/new \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SESSION_TOKEN scelto al passo 2>" \
  -d '{"anchor":"/01/09521234000006","itemDescription":"Prova","defaultLinktype":"gs1:dpp","links":[{"linktype":"gs1:dpp","href":"https://<tuo-sito>/01/09521234000006","title":"Prova","type":"text/html","hreflang":["it"]}]}'

curl -i https://<resolver-frontend-proxy>.onrender.com/01/09521234000006
# atteso: 307, Location verso la tua pagina prodotto reale

curl -X DELETE https://<resolver-data-entry>.onrender.com/api/01/09521234000006 \
  -H "Authorization: Bearer <SESSION_TOKEN>"
```

Il piano free di Render "addormenta" un servizio dopo un periodo di inattività (stesso
comportamento già noto per `registry-api`/`mock-eu-registry`, vedi `docs/REGISTRY-SETUP.md`): la
prima richiesta dopo una pausa può impiegare 30-60s. `syncResolverEntry` (passo 7) ha un timeout
di 10s — una pubblicazione con il resolver "addormentato" registra comunque il DPP vero (verso
mock-eu-registry), solo la sincronizzazione col resolver fallisce silenziosamente quella volta,
vedi il commento nel codice.

### 7. `registry-api`

Aggiungi alle Environment Variables già elencate in `docs/DEPLOY.md` (server-a-server, diretto a
`resolver-data-entry` — non ha bisogno di passare dal proxy del passo 4, pensato per il pubblico):
```
RESOLVER_API_URL=https://<resolver-data-entry>.onrender.com/api
RESOLVER_SESSION_TOKEN=<lo stesso segreto del passo 2>
```

## Produzione, con un dominio personalizzato vero

Se possedete un dominio (es. `gs1it.org`) e volete `id.gs1it.org` invece di
`<nome>.onrender.com`: seguite comunque i passi 1-3 e 6-7 sopra, ma al passo 4 aggiungete anche,
nella dashboard Render del servizio `resolver-frontend-proxy`, **Settings → Custom Domains** →
`id.<vostro-dominio>`, poi create presso il vostro provider DNS il record CNAME che Render vi
indica. Al passo 5, `FQDN` diventa `id.<vostro-dominio>` invece dell'URL onrender.com. Il resto
della configurazione (Environment Variables, i due servizi upstream) non cambia.
