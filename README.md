# GS1 Italy — Digital Product Passport

Sito dimostrativo del Digital Product Passport (DPP) richiesto dal Regolamento ESPR
((UE) 2024/1781) e dal Regolamento batterie ((UE) 2023/1542): spiega cos'è il DPP, presenta i
settori interessati (batterie, tessile/abbigliamento, siderurgia, edilizia, alluminio,
pneumatici, mobili, materassi, elettronica) e permette di creare, modificare e pubblicare una
scheda DPP di prova su un registro UE di riferimento.

Ogni prodotto è raggiungibile via GS1 Digital Link (`/01/{gtin}`), con la pagina che mostra la
scheda pubblicata da `/admin` quando esiste.

## Struttura del progetto

- **Frontend** (root) — Angular 22 (standalone, signals, SSR/prerendering), IT/EN.
- **`registry-api/`** — backend Node/Express/TypeScript: CRUD delle schede DPP (SQLite) dietro
  password, più la pubblicazione verso un registro UE di riferimento
  ([CIRPASS-2/mock-eu-registry](https://github.com/CIRPASS-2/mock-eu-registry)) via OAuth2
  client-credentials (Auth0).

```
src/app/
  pages/       home, product, brand, admin
  components/  icon, star-rating, json-ld-drawer, search-palette
  services/    product, registry-api, language, i18n, structured-data, site-origin
  data/        sectors.ts, products.json (catalogo statico, oggi vuoto)
  i18n/        dizionario IT/EN

registry-api/src/
  db.ts               SQLite (better-sqlite3): le schede DPP
  auth.ts              sbarramento a password per /admin
  routes/dpp.ts        CRUD + pubblicazione (autenticato)
  routes/public.ts      lettura pubblica per GTIN (usata dalle pagine prodotto)
  mockRegistryClient.ts client verso mock-eu-registry
```

## Sviluppo

Frontend:

```bash
npm install
npm start        # http://localhost:4200 — proxy automatico di /registry-api (proxy.conf.json)
npm run build
npm test
```

Backend (in un altro terminale):

```bash
cd registry-api
npm install
npm run dev       # http://localhost:4310 — legge il .env della radice del repo
```

Senza altra configurazione, `/admin` funziona per intero (login, creare/modificare/eliminare
schede) usando solo un `REGISTRY_ADMIN_PASSWORD` locale. Solo il pulsante "Pubblica" richiede
Supabase/Auth0/Render: vedi **[docs/REGISTRY-SETUP.md](docs/REGISTRY-SETUP.md)** per la
configurazione passo-passo, con tutte le insidie già risolte.

## Deploy

Docker Compose (Traefik + `webshop` + `registry-api`), vedi `docker-compose.yml`,
`docker-compose.prod.yml` (override TLS) e `webshop/Dockerfile`.
