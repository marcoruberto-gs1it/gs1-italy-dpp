# Configurare il registro UE (mock-eu-registry)

Questa guida serve a far funzionare il pulsante **"Pubblica su mock-eu-registry"**
della sezione admin (`/admin`). Senza questi passaggi la sezione admin funziona
comunque per intero (creare/modificare/eliminare schede) — solo la pubblicazione
resta disattivata, con un errore esplicito invece che un errore muto.

**Configurazione interamente completata e verificata con richieste reali** (non
solo dedotta dal codice) durante una sessione con GS1 Italy — inclusa una
registrazione di prova andata a buon fine (HTTP 201) contro un'istanza live su
Render. Tutto quello che segue riflette cosa ha *davvero* funzionato, comprese
un paio di sorprese rispetto a quanto la documentazione del progetto lascia
intendere (segnalate esplicitamente dove capitano).

Tre servizi esterni, tutti su piano gratuito, nessuno dei quali GS1 Italy o
questo assistente può creare per te:

1. **Supabase** — solo il database Postgres di mock-eu-registry.
2. **Auth0** — l'autenticazione OIDC che mock-eu-registry richiede (l'app
   pubblicata non ha una modalità "senza login", verificato nel suo `pom.xml`).
3. **Render** — dove gira l'immagine Docker già pubblicata di mock-eu-registry.

## 1. Supabase (database)

1. Crea un account su [supabase.com](https://supabase.com) e un nuovo progetto
   (piano Free). Scegli una password del database e **salvala**.
2. Nella schermata di sicurezza/Data API che compare in fase di creazione:
   **disattiva "Enable Data API"** (mock-eu-registry si collega via Postgres
   diretto, non tramite le REST API di Supabase — meno superficie esposta
   inutilmente). Il resto ai default va bene.
3. Nel progetto → **Project Settings → Database → Connection string**, copia la
   stringa in modalità **Session pooler**. **Porta 5432**, non 6543 — verificato:
   nel pooler attuale di Supabase (Supavisor) è il Session mode ad usare 5432,
   il contrario di quanto valeva con il vecchio PgBouncer.
4. Tieni a portata: host, user (tipo `postgres.xxxxxxxxxxxx`), password,
   database (di solito `postgres`). Servono al passo 3 (Render).

### 1.1 Crea le tabelle

mock-eu-registry **non le crea da solo in produzione** — lo script che lo fa
(`schema/v1_0_0/schema.sql` nel repo) gira automaticamente solo in modalità
sviluppo (Quarkus Dev Services), non contro un database esterno come Supabase.
Senza questo passaggio, la prima registrazione fallisce con
`relation "dpp_metadata" does not exist` — verificato.

Nel progetto Supabase → **SQL Editor** → nuova query, incolla ed esegui:

```sql
CREATE SEQUENCE IF NOT EXISTS dpp_metadata_seq;

CREATE TABLE IF NOT EXISTS dpp_metadata (
  id BIGINT PRIMARY KEY DEFAULT nextval('dpp_metadata_seq'),
  registry_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB NOT NULL,
  dpp_hash VARCHAR(71),
  dpp_content_type VARCHAR(50)
);

CREATE SEQUENCE IF NOT EXISTS json_schema_seq;

CREATE TABLE IF NOT EXISTS json_schemas (
  id BIGINT PRIMARY KEY DEFAULT nextval('json_schema_seq'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_schema JSONB NOT NULL
);
```

(Schema v1.1.0, quello usato dall'immagine `:latest` — con le colonne
`dpp_hash`/`dpp_content_type` che le versioni precedenti non avevano.)

## 2. Auth0 (OIDC)

1. Crea un account su [auth0.com](https://auth0.com) e un tenant (piano Free).
2. Crea prima una **API** (**Applications → APIs → Create API**): nome a
   piacere, **Identifier** a piacere ma segnati il valore — sarà
   `AUTH0_M2M_AUDIENCE` (es. `https://mock-eu-registry.internal`, non deve
   esistere davvero).
3. **Applications → Applications → Create Application → Machine to Machine
   Applications**, nome a piacere (es. `registry-api`). Quando chiede a quale
   API autorizzarla, seleziona quella appena creata. Scope: nessuno, non
   servono.
4. **Verifica il grant type** (causa comune di errore
   `unauthorized_client: Grant type 'client_credentials' not allowed`):
   sull'applicazione M2M → **Settings** → in fondo **Show Advanced Settings**
   → tab **Grant Types** → assicurati che **Client Credentials** sia spuntato
   → **Save Changes**.
5. mock-eu-registry richiede nel token un claim di ruolo che un'app M2M di
   Auth0 non aggiunge da sola. **Usa il meccanismo RBAC nativo di Auth0**, non
   una Action custom — un primo tentativo con una Action
   (`api.accessToken.setCustomClaim('groups', ...)`) veniva scartato in
   silenzio da Auth0 perché il nome del claim non era "namespaced" (una regola
   di sicurezza di Auth0 sui custom claim), verificato ispezionando il token
   ottenuto:
   - Sulla pagina dell'API → **Settings** → **RBAC Settings**: attiva
     **Enable RBAC** e **Add Permissions in the Access Token**. Salva.
   - Tab **Permissions** della stessa API: aggiungi un permesso con
     **Permission** = `admin`. Salva.
   - Sull'applicazione M2M → tab **API Access** → apri il pannello verso
     l'API → ora il permesso `admin` compare nell'elenco (prima era vuoto,
     "0/0" è normale finché non ci sono permessi). **Spuntalo** → **Save**
     (basta anche senza spuntare nulla se non compare nulla da spuntare: il
     bottone "Grant Access"/"Save" crea comunque l'autorizzazione).
   - Risultato verificato: il token M2M contiene `"permissions": ["admin"]`.
6. Annota: **Domain**, **Client ID**, **Client Secret** dell'applicazione M2M,
   **Identifier** dell'API (audience).

**Nota tecnica** (perché serve un passo apparentemente ridondante su Render):
il mapping di default di mock-eu-registry
(`registry.roles-mappings=admin:admin,eo:eo,eu:eu`) traduce il ruolo in
ingresso "admin" nel ruolo interno `Roles.ADMIN.name()`, cioè la stringa
**`ADMIN`** maiuscola (`RolesMappingsConverter` la forza con
`.toUpperCase()`, confermato da `RoleMapperTest.java` nel repo). Le policy
HTTP che proteggono gli endpoint sono però scritte in minuscolo
(`quarkus.http.auth.policy.metadata-policy.roles-allowed=admin,eo,eu` in
`application.properties`) — un disallineamento nella configurazione di
default del progetto stesso. Il passo 3 imposta le stesse policy in
MAIUSCOLO su Render per far combaciare i due lati con certezza.

## 3. Render (hosting di mock-eu-registry)

1. Crea un account su [render.com](https://render.com).
2. **New → Web Service → Deploy an existing image**, immagine:
   `ghcr.io/cirpass-2/mock-eu-registry-pgsql-oidc:latest`.
3. Piano **Free** (nota: si "addormenta" dopo un periodo di inattività — la
   prima richiesta dopo una pausa può impiegare 30-60 secondi in più).
4. **Environment Variables**, aggiungi:
   ```
   QUARKUS_DATASOURCE_REACTIVE_URL=postgresql://<host-supabase>:5432/postgres
   QUARKUS_DATASOURCE_USERNAME=<utente-supabase>
   QUARKUS_DATASOURCE_PASSWORD=<password-supabase>
   QUARKUS_OIDC_AUTH_SERVER_URL=https://<AUTH0_DOMAIN>/
   QUARKUS_OIDC_CLIENT_ID=<Client ID Auth0>
   QUARKUS_OIDC_CREDENTIALS_SECRET=<Client Secret Auth0>
   QUARKUS_OIDC_ROLES_ROLE_CLAIM_PATH=permissions
   QUARKUS_HTTP_AUTH_POLICY_METADATA_POLICY_ROLES_ALLOWED=ADMIN,EO,EU
   QUARKUS_HTTP_AUTH_POLICY_SCHEMA_POLICY_ROLES_ALLOWED=ADMIN,EU
   ```
5. **Chiavi RSA per la "proof of registration"** — obbligatorie, l'app non
   parte senza (`Failed to load config value ... smallrye.jwt.encrypt.key.location`).
   Genera una coppia (in locale, con OpenSSL):
   ```
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private-key.pem
   openssl rsa -pubout -in private-key.pem -out public-key.pem
   ```
   **Non** usare i "Secret Files" di Render per questo (il percorso di mount
   non è scontato) — più semplice ed **verificato funzionante**: incolla il
   contenuto PEM (con `-----BEGIN...-----`/`-----END...-----` e gli a capo)
   direttamente come valore di due normali variabili d'ambiente:
   ```
   SMALLRYE_JWT_SIGN_KEY=<contenuto di private-key.pem>
   SMALLRYE_JWT_ENCRYPT_KEY=<contenuto di public-key.pem>
   ```
6. Deploy. Una volta "Live", annota l'URL pubblico (es.
   `https://mock-eu-registry-xxxx.onrender.com`).
7. Verifica rapida (nessuna autenticazione richiesta su questi due):
   ```
   curl https://<il-tuo-servizio>.onrender.com/.well-known/jwks.json
   curl https://<il-tuo-servizio>.onrender.com/q/openapi
   ```
   Il primo deve rispondere con la chiave pubblica appena incollata.

## 4. Incollare tutto nel `.env` del progetto

```
MOCK_EU_REGISTRY_URL=https://<il-tuo-servizio>.onrender.com
AUTH0_DOMAIN=<tuo-tenant>.us.auth0.com
AUTH0_M2M_CLIENT_ID=<Client ID dell'app M2M>
AUTH0_M2M_CLIENT_SECRET=<Client Secret dell'app M2M>
AUTH0_M2M_AUDIENCE=<Identifier dell'API Auth0>
```
Poi:
```
docker compose up -d --build registry-api
```
(o, se stai già girando l'intero stack, semplicemente `docker compose up -d --build`).

## 5. Verifica — e un limite noto in locale

Da `/admin`, crea una scheda e premi "Pubblica su mock-eu-registry".

**In locale, questo passaggio fallirà comunque** — non per una configurazione
sbagliata, ma per un limite strutturale: mock-eu-registry **scarica davvero
il `liveURL`** della scheda per calcolarne l'hash (verificato: la risposta di
registrazione include `dppHash`/`contentType` calcolati sul contenuto vero
dell'URL). Con `SITE_URL=http://localhost:4200`, Render non può raggiungere
la tua macchina per scaricarlo. Il pulsante funzionerà automaticamente una
volta che `SITE_URL` sarà il dominio reale del sito in produzione; per
provarlo prima, serve un tunnel pubblico verso il tuo locale (es. ngrok)
puntato come `SITE_URL` temporaneo.

Con un `SITE_URL` raggiungibile, una pubblicazione riuscita restituisce un
`registryId` reale (verificato: `HTTP 201`, `registryId` popolato). Nota che
l'endpoint della "proof of registration" (`GET .../proof`) può restituire
`404` anche subito dopo una registrazione riuscita con lo stesso
`registryId` — un comportamento dell'istanza live non spiegabile senza
accesso ai suoi log, trattato nel nostro codice (`registry-api/src/
mockRegistryClient.ts`) come "proof non disponibile" senza far fallire la
pubblicazione: la scheda risulta comunque "Pubblicata" con un `registryId`
valido, solo senza il JWT di prova allegato.
