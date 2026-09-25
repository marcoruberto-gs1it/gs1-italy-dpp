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
    "defaultLinktype": "gs1:pip",
    "links": [{"linktype": "gs1:pip", "href": "http://localhost/01/09521234000006", "title": "Prova", "type": "text/html", "hreflang": ["it"]}]
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

## Produzione

**Non ancora verificato dal vivo** (a differenza della sezione locale sopra) — questi passaggi
seguono lo stesso schema già verificato per `registry-api` in `docs/DEPLOY.md` (due Web Service
Render dal Dockerfile del repo), adattato ai due servizi del resolver. In assenza di un dominio
personalizzato reale su cui provarlo, trattali come indicazioni da verificare al primo deploy
vero, non come una ricetta già testata.

### 1. Un vero MongoDB

Render (piano free) non offre un database persistente per un Web Service — stesso motivo per
cui `registry-api` usa Supabase Postgres invece di SQLite locale (vedi
`docs/REGISTRY-SETUP.md`). Opzioni:
- **MongoDB Atlas**, piano free (M0) — genera una stringa di connessione `mongodb+srv://...`.
- Qualunque altro MongoDB gestito raggiungibile pubblicamente.

### 2. Due Web Service Render (Docker), stesso schema di `registry-api`

**resolver-data-entry**
- Root Directory: `resolver/data_entry_server`
- Runtime: Docker
- Environment: `MONGO_URI=<stringa Atlas>`, `SESSION_TOKEN=<segreto lungo e casuale, MAI
  "devtoken" in produzione>`

**resolver-web**
- Root Directory: `resolver/web_server`
- Runtime: Docker
- Environment: `MONGO_URI=<stessa stringa Atlas>`, `FQDN=id.<tuo-dominio>` (nudo, **senza**
  `https://` — il loro codice lo antepone da solo; con lo schema incluso qui si ottiene un
  doppio prefisso nel campo `anchor` del linkset, verificato dal vivo in locale, vedi sopra)

### 3. Instradamento

In produzione questo progetto usa `webshop/nginx.conf`, non Traefik (vedi `docs/DEPLOY.md`) — la
regola equivalente da aggiungere lì è: richieste con `Host: id.<tuo-dominio>` verso
`resolver-web` (root `/`) e `resolver-data-entry` (`/api`, `/swaggerui`), con lo stesso
prefisso `/api` aggiunto per `resolver-web` documentato in `resolver/README.md`. Serve inoltre un
vero record DNS per `id.<tuo-dominio>` puntato al servizio Render di `resolver-web` (o al
reverse proxy che lo instrada).

### 4. `registry-api`

Aggiungi alle Environment Variables già elencate in `docs/DEPLOY.md`:
```
RESOLVER_API_URL=<URL pubblico di resolver-data-entry>/api
RESOLVER_SESSION_TOKEN=<lo stesso segreto del passo 2>
```
