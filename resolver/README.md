# GS1 Digital Link Resolver CE (vendorizzato)

Codice preso da [gs1/GS1_DigitalLink_Resolver_CE](https://github.com/gs1/GS1_DigitalLink_Resolver_CE)
(Apache-2.0, vedi `LICENSE` in questa cartella), versione 3.0.0 — non un fork: nessuna modifica
al codice sorgente di `data_entry_server`/`web_server`/`database_server`, solo la configurazione
di orchestrazione (`docker-compose.yml` alla radice del repo, con Traefik al posto della loro
`frontend_proxy_server`, che qui non serve — vedi sotto).

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

## Perché non la loro `frontend_proxy_server`

La loro immagine `frontend_proxy_server` è un nginx che instrada `/` verso `web-service:4000` e
`/api`+`/swaggerui` verso `data-entry-service:3000` — esattamente il ruolo che Traefik già
ricopre nel resto di questo progetto (vedi `docker-compose.yml` alla radice). Usarla in più
avrebbe significato un doppio livello di proxy per lo stesso lavoro: qui `database-service`,
`resolver-data-entry` e `resolver-web` sono raggiunti direttamente da Traefik con le proprie
label, sotto l'host locale `id.localhost` (in produzione: un vero sottodominio `id.<dominio>`,
vedi `docs/RESOLVER-SETUP.md`).

## Aggiornare questo vendoring

Per allineare a una versione più recente del progetto upstream: ripetere lo stesso
`git clone --depth 1` di `data_entry_server/`, `web_server/`, `database_server/` (non
`frontend_proxy_server/`, non usata qui) e ricopiare sopra queste cartelle — senza portare
modifiche locali al loro codice, che non ce ne sono.
