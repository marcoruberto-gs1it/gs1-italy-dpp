# Mettere online il sito (Render, gratis)

Due Web Service Render, entrambi costruiti dal Dockerfile già nel repo — nessuna riscrittura,
stessa immagine che gira in locale. Nessun dominio necessario per iniziare: si usano gli URL
gratuiti `*.onrender.com`; un dominio vero si potrà agganciare dopo, senza altri costi.

**Prerequisito**: completa prima **[docs/REGISTRY-SETUP.md](REGISTRY-SETUP.md)** — serve
Supabase (Postgres) + Auth0 + `mock-eu-registry` già pubblicato su Render. I valori raccolti lì
(stringa di connessione Supabase, credenziali Auth0, URL di `mock-eu-registry`) servono anche
qui.

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

- **Name**: scegline uno ora, es. `gs1-dpp-registry-api` — determina l'URL
  (`https://gs1-dpp-registry-api.onrender.com`), che ti servirà al passo 2.
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

Verifica:
```
curl https://gs1-dpp-registry-api.onrender.com/registry-api/health
# {"status":"ok"}
```

## 2. webshop

**New → Web Service** → stesso repo.

- **Name**: quello usato come `SITE_URL`/`REGISTRY_ADMIN_...SITE_URL` sopra, es.
  `gs1-dpp-webshop`.
- **Root Directory**: lascia vuoto (il build context è la root del repo, non `webshop/` —
  serve l'intero progetto Angular).
- **Runtime**: Docker (Dockerfile Path: `webshop/Dockerfile`)
- **Instance Type**: Free
- **Environment Variables**:
  ```
  SITE_URL=https://gs1-dpp-webshop.onrender.com
  REGISTRY_API_URL=https://gs1-dpp-registry-api.onrender.com
  PORT=80
  ```
  `SITE_URL` qui è usato come **build arg** Docker (Render inietta automaticamente le
  variabili d'ambiente del servizio come build arg, vedi `webshop/Dockerfile`): finisce in
  sitemap.xml, robots.txt, llms.txt e nei canonical dell'HTML prerenderizzato — cambiarlo
  richiede un nuovo deploy, non basta un riavvio. `REGISTRY_API_URL` invece è letto a runtime
  dal template nginx (vedi `webshop/Dockerfile`/`webshop/nginx.conf`) per instradare
  `/registry-api`. `PORT=80` dice a Render su quale porta ascolta nginx (`listen 80` in
  `nginx.conf`) — senza, Render si aspetta la sua porta di default e il deploy fallisce.

Deploy.

## 3. Verifica end-to-end

- Apri `https://gs1-dpp-webshop.onrender.com` — homepage.
- `/admin` → login, crea una scheda, "Pubblica su mock-eu-registry" → questa volta dovrebbe
  funzionare per intero (a differenza dei test in locale): `SITE_URL` è finalmente un URL
  pubblico che `mock-eu-registry` può raggiungere per calcolare l'hash della scheda (vedi la
  nota nello stesso REGISTRY-SETUP.md sul limite del test in locale).
- Apri `/01/{gtin}` della scheda appena pubblicata — deve mostrare il passaporto.

## Piano gratuito: cosa aspettarsi

`webshop`, `registry-api` e `mock-eu-registry` (quest'ultimo già su Render da
REGISTRY-SETUP.md) si "addormentano" tutti dopo un periodo di inattività sul piano Free: la
prima richiesta dopo una pausa può impiegare 30-60 secondi in più per il risveglio. Normale,
non un errore.

## Dominio personalizzato (quando ne avrai uno)

Render → servizio `webshop` → **Settings → Custom Domain**, segui la verifica DNS. Poi
aggiorna `SITE_URL` su **entrambi** i servizi (`webshop` e `registry-api`) col nuovo dominio e
rideploya `webshop` (è un build arg, un riavvio da solo non basta).
