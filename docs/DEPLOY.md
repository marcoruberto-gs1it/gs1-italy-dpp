# Mettere online il sito (Render, gratis)

Due Web Service Render, entrambi costruiti dal Dockerfile già nel repo — nessuna riscrittura,
stessa immagine che gira in locale. Nessun dominio necessario per iniziare: si usano gli URL
gratuiti `*.onrender.com`; un dominio vero si potrà agganciare dopo, senza altri costi.

**Prerequisito**: completa prima **[docs/REGISTRY-SETUP.md](REGISTRY-SETUP.md)** — serve
Supabase (Postgres) + Auth0 + `mock-eu-registry` già pubblicato su Render. I valori raccolti lì
(stringa di connessione Supabase, credenziali Auth0, URL di `mock-eu-registry`) servono anche
qui.

**Opzionale ma consigliato**: **[docs/RESOLVER-SETUP.md](RESOLVER-SETUP.md)** — il GS1 Digital
Link Resolver CE, per la piena conformità allo standard di risoluzione (non necessario perché il
resto del sito funzioni: senza, salta solo la sincronizzazione col resolver, vedi quella guida).

GitHub Pages non basta: il sito ha bisogno di un server vero per `registry-api` (crea/pubblica
le schede DPP) e di regole di instradamento che un hosting statico non supporta (vedi
`webshop/nginx.conf` — content negotiation JSON-LD, fallback client-side per `/01/` e `/admin`).

## Come restano collegati i due servizi

`registry-api.service.ts` chiama `/registry-api/...` in modo relativo (nessun CORS
configurato, di proposito). Per restare così anche in produzione — senza toccare CORS o i
cookie di sessione — `webshop/nginx.conf` inoltra `/registry-api/*` verso il servizio
`registry-api` su Render, agli occhi del browser resta tutto un solo dominio, esattamente come
oggi in locale fa Traefik.

## 1. registry-api

**New → Web Service → Build and deploy from a Git repository** → connetti (se non già fatto)
e seleziona `marcoruberto-gs1it/gs1-italy-dpp`.

- **Name**: scegline uno ora — determina l'URL pubblico (`https://<nome-scelto>.onrender.com`),
  che ti servirà al passo 2. **Attenzione**: se il nome è già preso da un altro utente Render
  (i sottodomini `.onrender.com` sono globali, non solo tuoi), Render lo cambia in silenzio
  aggiungendo un suffisso — l'URL vero è sempre quello mostrato in cima alla pagina del
  servizio nella dashboard Render, non necessariamente quello che avevi scelto. Verificalo lì
  prima di incollarlo altrove: un URL sbagliato qui rompe silenziosamente ogni pubblicazione,
  con un errore che sembra tutt'altro (vedi nota più sotto).
- **Root Directory**: `registry-api`
- **Runtime**: Docker (Dockerfile Path: `Dockerfile`, relativo alla Root Directory sopra)
- **Instance Type**: Free
- **Environment Variables**:
  ```
  REGISTRY_DATABASE_URL=<stringa di connessione Supabase, porta 5432 — vedi REGISTRY-SETUP.md>
  REGISTRY_ADMIN_PASSWORD=<scegli una password per /admin>
  REGISTRY_AUTH_SECRET=<openssl rand -hex 32>
  SITE_URL=https://<il nome che darai al servizio webshop al passo 2>.onrender.com
  MOCK_EU_REGISTRY_URL=<come nel tuo .env locale>
  AUTH0_DOMAIN=<come nel tuo .env locale>
  AUTH0_M2M_CLIENT_ID=<come nel tuo .env locale>
  AUTH0_M2M_CLIENT_SECRET=<come nel tuo .env locale>
  AUTH0_M2M_AUDIENCE=<come nel tuo .env locale>
  ```
  (`PORT` non serve: `server.ts` legge già `process.env.PORT`, che Render imposta da solo.)

Deploy. La tabella `gs1_dpp_records` si crea da sola al primo avvio (vedi `db.ts`) — a
differenza di `mock-eu-registry`, qui non serve eseguire nulla a mano su Supabase.

Verifica (sostituisci con l'URL vero mostrato nella dashboard Render per questo servizio):
```
curl https://<nome-vero-del-servizio>.onrender.com/registry-api/health
# {"status":"ok"}
```
Se questa `curl` non risponde `{"status":"ok"}` — in particolare se la risposta è una pagina
HTML di errore invece di JSON, o l'header `x-render-routing` vale `no-server` — il servizio non
è raggiungibile a QUEL nome: prima di guardare altrove, controlla l'URL vero nella dashboard.

## 2. webshop

**New → Web Service** → stesso repo.

- **Name**: scegline uno — stessa avvertenza di sopra sul suffisso che Render può aggiungere in
  silenzio: usa sempre l'URL vero mostrato nella dashboard, non quello che avevi scelto.
- **Root Directory**: lascia vuoto (il build context è la root del repo, non `webshop/` —
  serve l'intero progetto Angular).
- **Runtime**: Docker (Dockerfile Path: `webshop/Dockerfile`)
- **Instance Type**: Free
- **Environment Variables**:
  ```
  SITE_URL=https://<URL VERO DI QUESTO SERVIZIO — dalla dashboard, passo dopo aver creato il servizio>
  REGISTRY_API_URL=https://<URL VERO del servizio registry-api creato al passo 1 — dalla dashboard>
  PORT=80
  ```
  **Entrambi vanno incollati dalla dashboard Render, non digitati a mano** — è esattamente
  l'errore che ha rotto la pubblicazione la prima volta in produzione: `REGISTRY_API_URL`
  impostato al nome che si pensava di usare, invece del nome vero assegnato da Render (diverso
  perché quello scelto era già preso da un altro utente). Il sintomo era fuorviante: l'admin
  mostrava un errore generico ("Qualcosa non ha funzionato") sul passo "Verifica del Digital
  Link" dell'animazione — che in realtà è solo il passo in cui l'interfaccia resta in attesa
  della risposta del backend, quindi mostra lì qualunque errore, anche uno di semplice
  instradamento come questo.

  `SITE_URL` qui è usato come **build arg** Docker (Render inietta automaticamente le
  variabili d'ambiente del servizio come build arg, vedi `webshop/Dockerfile`): finisce in
  sitemap.xml, robots.txt, llms.txt e nei canonical dell'HTML prerenderizzato — cambiarlo
  richiede un nuovo deploy, non basta un riavvio. `REGISTRY_API_URL` invece è letto a runtime
  dal template nginx (vedi `webshop/Dockerfile`/`webshop/nginx.conf`) per instradare
  `/registry-api`. `PORT=80` dice a Render su quale porta ascolta nginx (`listen 80` in
  `nginx.conf`) — senza, Render si aspetta la sua porta di default e il deploy fallisce.

  Ricontrolla anche `SITE_URL` sul servizio **registry-api** del passo 1 (non su questo): deve
  essere anch'esso l'URL vero di QUESTO servizio webshop — serve a `mock-eu-registry` per
  scaricare il liveURL della scheda durante la registrazione (vedi REGISTRY-SETUP.md).

Deploy.

## 3. Verifica end-to-end

- Apri l'URL vero del servizio webshop (dalla dashboard Render) — homepage.
- `/admin` → login, crea una scheda, "Pubblica su mock-eu-registry" → questa volta dovrebbe
  funzionare per intero (a differenza dei test in locale): `SITE_URL` è finalmente un URL
  pubblico che `mock-eu-registry` può raggiungere per calcolare l'hash della scheda (vedi la
  nota nello stesso REGISTRY-SETUP.md sul limite del test in locale).
- Apri `/01/{gtin}` della scheda appena pubblicata — deve mostrare il passaporto.

## Piano gratuito: cosa aspettarsi

`webshop`, `registry-api` e `mock-eu-registry` (quest'ultimo già su Render da
REGISTRY-SETUP.md) si "addormentano" tutti dopo un periodo di inattività sul piano Free: la
prima richiesta dopo una pausa può impiegare 30-60 secondi in più per il risveglio. Normale,
non un errore — e reso invisibile lato utente dal retry automatico (vedi
`RegistryApiService`/`PUBLISH_RETRY_DELAYS_MS`), che nasconde l'attesa senza mostrare alcun
messaggio sul risveglio in corso.

Due meccanismi tengono i servizi svegli, in ordine di affidabilità:

1. **Auto-risveglio dal traffico reale**: `App.wakeRegistryApi()` pinga `registry-api` a ogni
   caricamento di pagina del sito, e l'apertura di `/admin` pinga anche `mock-eu-registry`
   (`GET /registry-api/warmup`) — chi naviga il sito lo tiene sveglio da solo, senza dipendere
   da nulla di esterno.
2. **La GitHub Action `keep-render-awake.yml`**: pinga i tre servizi ogni 10 minuti per coprire
   i periodi senza traffico reale (es. di notte). **Non è affidabile quanto sembra**: lo
   `schedule` di GitHub Actions è "best effort" e può ritardare le esecuzioni di ore o saltarle
   del tutto senza errore — verificato con gap reali di 2-5 ore contro i 10 minuti richiesti
   (vedi cronologia delle Action). Utile come rete di sicurezza aggiuntiva, ma non basta da
   sola a prevenire lo sleep in assenza di traffico.

## Dominio personalizzato (quando ne avrai uno)

Render → servizio `webshop` → **Settings → Custom Domain**, segui la verifica DNS. Poi
aggiorna `SITE_URL` su **entrambi** i servizi (`webshop` e `registry-api`) col nuovo dominio e
rideploya `webshop` (è un build arg, un riavvio da solo non basta).
