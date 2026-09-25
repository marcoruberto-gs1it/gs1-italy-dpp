# GS1 Digital Link Resolver CE (vendorizzato)

Codice preso da [gs1/GS1_DigitalLink_Resolver_CE](https://github.com/gs1/GS1_DigitalLink_Resolver_CE)
(Apache-2.0, vedi `LICENSE` in questa cartella), versione 3.0.0.

- `data_entry_server/`, `web_server/`, `database_server/`: **vendorizzati pari pari, non un
  fork** — nessuna modifica al codice sorgente, solo la configurazione di orchestrazione
  attorno (vedi `docker-compose.yml` alla radice del repo).
- `frontend_proxy_server/`: **adattato**, non vendorizzato tale e quale — stessa identica logica
  di instradamento dell'originale (root → resolving web server con prefisso `/api` aggiunto,
  `/api`+`/swaggerui` → data entry server), ma con gli host a monte parametrizzati via variabili
  d'ambiente invece che scritti fissi (`web-service:4000`, `data-entry-service:3000`), perché su
  Render — a differenza della rete Docker locale — questo servizio non ha "vicini" con un nome
  DNS interno fisso: serve per il deploy in produzione (vedi `docs/RESOLVER-SETUP.md`), non per
  `docker-compose.yml` locale, dove Traefik già ricopre lo stesso ruolo (vedi sotto).

## Perché questo servizio esiste

Il resto del progetto (`registry-api`) genera già un JSON-LD e un linkset "a mano" per ogni DPP
pubblicato (vedi `registry-api/src/jsonld.ts#dppToLinkset`). Questo però non è un vero
**GS1-Conformant Resolver** secondo lo standard (https://ref.gs1.org/standards/resolver/): manca
la negoziazione del contenuto completa, il formato di risposta corretto, il supporto ai
qualificatori AI, la compressione dei link. Questo servizio aggiunge quella conformità reale,
senza toccare il resto del sito: risolve `id.<dominio>/01/{gtin}[...]` e reindirizza (307) o
restituisce il linkset (`Accept: application/linkset+json`) puntando alla pagina prodotto VERA
di questo sito (`<dominio>/01/{gtin}[...]`), che resta l'unica fonte di contenuto reale — anche
perché mock-eu-registry scarica e verifica l'hash di QUELLA pagina, non di un resolver che fa
solo da puntatore (vedi il commento in cima a `registry-api/src/mockRegistryClient.ts`).

`registry-api/src/resolverClient.ts` tiene sincronizzato questo resolver: scrive un'entry (via
la sua Data Entry API, `POST/PUT/DELETE /api{anchor}`) a ogni pubblicazione di un DPP, non a ogni
bozza — stessa regola già in vigore per JSON-LD/pagina pubblica, che il pubblico non deve vedere
mai una scheda ancora in bozza.

## Perché in locale non si usa `frontend_proxy_server`

In `docker-compose.yml` (locale) `resolver-database`, `resolver-data-entry` e `resolver-web`
sono raggiunti direttamente da Traefik con le proprie label, sotto l'host locale `id.localhost`
— Traefik ricopre già lo stesso ruolo di instradamento che altrimenti spetterebbe a
`frontend_proxy_server`, usarla in più sarebbe un doppio livello di proxy per lo stesso lavoro.
Su Render invece non c'è un Traefik condiviso davanti ai servizi: lì `frontend_proxy_server` (la
versione adattata in questa cartella) diventa l'unico punto d'ingresso pubblico del resolver —
vedi `docs/RESOLVER-SETUP.md`.

## Aggiornare questo vendoring

Per allineare `data_entry_server/`, `web_server/`, `database_server/` a una versione più recente
del progetto upstream: ripetere lo stesso `git clone --depth 1` e ricopiare sopra queste tre
cartelle — senza portare modifiche locali al loro codice, che non ce ne sono. `frontend_proxy_server/`
va invece confrontata a mano con l'originale (`nginx.conf` upstream), visto che qui è stata
adattata: solo gli host a monte sono cambiati (da valori fissi a `${VAR}`), la logica di
instradamento resta identica.
