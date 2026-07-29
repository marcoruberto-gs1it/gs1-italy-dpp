# Handoff — stato del lavoro al 29/07/2026

Documento di passaggio di consegne: contiene tutto il contesto della sessione in cui
sono stati aggiunti Docker/Traefik e l'assistente agentico UCP. Chi riprende da qui non
ha bisogno di ricostruire nulla.

**Progetto**: `/Users/iacovelli/Projects/demo-gs1-italy-web-vocabulary`
**Remote**: `git@github.com:gs1it/demo-gs1-italy-web-vocabulary.git` (privato), branch `main`
**Sample di origine dell'agente**: `/Users/iacovelli/Projects/samples/gs1_ucp_v2` (fuori da questo repo)

---

## 1. Cosa c'era e cosa è stato fatto

Il progetto era un sito Angular 22 (63 prodotti GS1 Digital Link, prerenderizzato,
pubblicato su GitHub Pages) con una **finta** chat in `/assistente`.

In questa sessione, in due fasi:

**Fase 1 — dal deploy su Pages a Docker.** Sostituito GitHub Pages con uno stack
`docker-compose` dietro Traefik (l'utente ha chiesto Traefik, non Caddy come ipotizzato
in `DEPLOY_CONTEXT.md`). Il sito gira in nginx a partire dal build statico.

**Fase 2 — la chat finta diventa un agente vero.** Portati `business-agent` (Google ADK
+ A2A + UCP, Gemini su Vertex) e `chat-client` (React+Vite) dal sample. Il
`fastapi-catalog` del sample è stato eliminato: la sorgente dati ora è il sito stesso.

Documentazione già scritta, da leggere per prima cosa:
- **`ARCHITETTURA.md`** — architettura tecnica completa (servizi, routing, flusso dati,
  configurazione, troubleshooting). È aggiornato.
- **`PRESENTAZIONE.md`** — documento discorsivo di presentazione della demo.
- `DEPLOY_CONTEXT.md` — **obsoleto**, superato dai due precedenti. Untracked, parla di
  Caddy e di un servizio FastAPI che non esiste. Da eliminare o riscrivere.

## 2. Stato del repository

Ultimi commit: `69d6433` (Aggiunti files) ← `5b2009a` (Mergiati i diversi servizi in un
compose unico) ← `c8b5f3c` (first push).

218 file tracciati. Nel working tree resta untracked solo `DEPLOY_CONTEXT.md` (e questo
file).

**Segreti — verificato, non tracciati**: `.env`, `secrets/gcp-sa.json`,
`.claude/settings.local.json`. I primi due sono in `.gitignore`; il terzo è stato tolto
dal versionamento durante la sessione.

## 3. Come far girare tutto

```bash
docker compose up -d --build          # locale → http://localhost
docker compose ps                     # 4 servizi: traefik, webshop, business-agent, chat-client
docker compose logs business-agent -f
```

Serve un `.env` (non versionato) con `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`,
`GEMINI_MODEL`, più `secrets/gcp-sa.json` (service account GCP). Modello di riferimento
in `.env.example`. Se il file `.env` manca, si ricava dal `.env` del sample
`gs1_ucp_v2` (contiene anche una `GOOGLE_API_KEY`, alternativa a Vertex).

Produzione (mai eseguita finora):
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Script di test della chat via API

Utile per provare l'agente senza browser. Salvarlo dove serve, non è nel repo:

```bash
#!/bin/bash
# uso: ./chat.sh --reset "primo messaggio"  poi  ./chat.sh "messaggio successivo"
CTX_FILE=/tmp/ucp_ctx.txt
[ "$1" = "--reset" ] && rm -f $CTX_FILE && shift
CTX=$(cat $CTX_FILE 2>/dev/null); CTX_JSON=""
[ -n "$CTX" ] && CTX_JSON=",\"contextId\":\"$CTX\""
curl -s -X POST http://localhost/api \
  -H 'Content-Type: application/json' \
  -H 'X-A2A-Extensions: https://ucp.dev/2026-01-23/specification/overview?v=2026-01-23' \
  -H 'UCP-Agent: profile="http://chat-client:3000/assistente/profile/agent_profile.json"' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":\"$(uuidgen)\",\"method\":\"message/send\",\"params\":{\"message\":{\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"text\":\"$1\"}],\"messageId\":\"$(uuidgen)\",\"kind\":\"message\"$CTX_JSON},\"configuration\":{\"historyLength\":0}}}" \
| python3 -c "
import sys,json
d=json.load(sys.stdin)
if 'error' in d: print('ERRORE:',json.dumps(d['error'])[:400]); sys.exit()
r=d.get('result',{})
if r.get('contextId'): open('$CTX_FILE','w').write(r['contextId'])
for p in (r.get('parts') or r.get('status',{}).get('message',{}).get('parts') or []):
    if p.get('kind')=='text' or p.get('type')=='text': print(p.get('text'))
    elif 'data' in p:
        for k,v in p['data'].items():
            if 'checkout' in k.lower(): print(f'[{k}] status={v.get(\"status\")} totali={json.dumps(v.get(\"totals\"))[:200]}')
            elif isinstance(v,dict) and 'results' in v: print(f'[{k}] {len(v[\"results\"])} prodotti')
"
```

### Verifiche rapide

```bash
curl -s http://localhost/catalog | jq length                                 # 63
curl -H 'Accept: application/ld+json' http://localhost/01/08032089000017     # JSON-LD (34 chiavi)
curl -o /dev/null -w '%{http_code}\n' -H 'Accept: application/ld+json' \
     http://localhost/01/08032089000048                                      # 404 — prodotto senza dati
curl -o /dev/null -w '%{http_code}\n' http://localhost/assistente            # 302 → /assistente/
```

## 4. Decisioni prese, con il motivo (non ribaltarle senza chiedere)

| Decisione | Perché |
|---|---|
| **Il sito è la sorgente dati dell'agente**, non un servizio a parte | Il `fastapi-catalog` del sample era un finto shop; qui lo shop vero esiste già e pubblica JSON-LD |
| **Si adatta il sito, non il core del sample** | L'utente vuole restare il più fedele possibile all'esempio di Google. Sono state modificate solo 2 cose nell'agente (§5) |
| **`/assistente` è del chat-client React**, la pagina Angular è dismessa | Scelta esplicita dell'utente fra 3 opzioni (le altre: iframe, sottodominio). Stessa origine → niente CORS |
| **`search_shopping_catalog` restituisce le schede GS1 JSON-LD complete, e non filtra nulla in Python** | Scelta esplicita dell'utente: il modello deve avere più informazione possibile su cui ragionare, e la selezione la fa lui, non il codice. Costa ~51k token per una ricerca completa. Un tentativo intermedio con filtro a faccette deterministico in Python è stato scartato per questo motivo |
| **Le schede prodotto mostrate devono coincidere col testo della risposta** | L'agente chiude con `search_shopping_catalog(gtins=…)` sui prodotti che raccomanda. Verificato: 1 scheda per "alimentari senza glutine", 2 per "capo in cotone biologico", 1 dopo l'aggiunta al carrello. È governato dall'istruzione, non dal codice: se in demo sballa, la strada solida è un parametro `display` esplicito sul tool |
| **`after_tool_modifier` mette in stato solo le chiavi UCP** | Altrimenti i ~117 KB di schede JSON-LD destinate al modello verrebbero rispediti al browser a ogni turno. Payload verso il client verificato: 2,3 KB |
| **I 16 prodotti senza `rawGs1Data` restano nel catalogo** e danno 404 sul JSON-LD | Scelta esplicita dell'utente: è il contrasto "AI Ready vs non AI Ready" che la demo vuole mostrare. **Non è un bug, non "aggiustarlo"** |
| **Sidecar `.jsonld` + content negotiation** invece di far parsare l'HTML all'agente | Permette di lasciare `leggi_prodotto` identico al sample. Vedi ARCHITETTURA.md §4 |
| **Traefik v3.7** e non v3.3 | La v3.3 usa una versione di API Docker rifiutata dal daemon 29.x: il provider resta muto e risponde 404 a tutto |
| **Healthcheck su `127.0.0.1`** | Il wget di busybox prova prima `::1`, dove nginx (`listen 80`) non ascolta |
| **`.npmrc` copiato prima di `npm ci`** nel Dockerfile | Contiene `legacy-peer-deps=true`, senza cui la build fallisce sul peer di `angularx-qrcode` |

## 5. Cosa è stato modificato nel codice portato dal sample

Solo due punti, entrambi commentati nel codice:

1. `business-agent/src/business_agent/store.py` — `search_products` non filtra più
   (solo `gtins`), e il nuovo `get_product_sheets` scarica le schede JSON-LD dalle URL
   Digital Link e le tiene in cache in `self._sheets`. Dettaglio in `ARCHITETTURA.md` §5.
   Il feed `/catalog` è tornato leggero (~21 KB): la ricchezza arriva dalle schede.
2. `business-agent/src/business_agent/agent.py` — `search_shopping_catalog` (firma +
   docstring, che è ciò che il modello legge), `after_tool_modifier` (whitelist delle
   chiavi verso il client) e `instruction`: 6 settori del catalogo, regola sui prodotti
   senza dati, semantica dei livelli di contenimento, allineamento schede/testo, lingua
   italiana, testo semplice senza LaTeX.

Nel `chat-client` solo configurazione: `base: '/assistente/'` in `vite.config.ts`, logo e
testi in `config.ts`. `App.tsx` e i componenti UCP non sono stati toccati.

Lato Angular: rimossa la rotta `assistente` (da `app.routes.ts` e
`app.routes.server.ts`), i due link in `app.html` passati da `routerLink` a `href`,
`/assistente` tolto dalla sitemap, `llms.txt` arricchito con i due endpoint macchina.

## 6. Argomento chiuso: la gerarchia logistica GDSN — NON riaprire

L'utente ha chiesto se l'agente potesse rispondere a domande di magazzino
("quanti prodotti ci stanno in XX m³"). Indagine fatta, con esito:

- **Oggi l'agente risponde**, ma usando solo l'unità consumatore: impila vasetti sfusi
  senza cartoni né pallet. Aritmeticamente giusto, logisticamente inutile (296.629
  vasetti in 120 m³, contro ~82.500 ragionando a pallet).
- Il dato buono **esiste** in `src/app/data/products.json` → `gdsn.hierarchy` (18 prodotti
  su 63): livelli Unità Base / Cartone / Pallet con GTIN proprio, dimensioni, pesi,
  quantità contenute, SSCC. Non è esposto nel JSON-LD.
- **Verificato scaricando il vocabolario ufficiale** (`https://ref.gs1.org/voc/data/gs1Voc.jsonld`,
  2.540 termini, 562 proprietà): il GS1 Web Vocabulary **non contiene** proprietà di
  gerarchia di imballo (né `childTradeItem`, né `quantityOfChildren`, né i flag
  `isTradeItemABaseUnit`…). Sono attributi GDSN, standard diverso. Le uniche relazioni
  Product→Product sono `equivalentProduct`, `replacedProduct`, `primaryAlternateProduct`.
  Esistono invece e sono usabili: `gs1:grossVolume`, `gs1:packagingType`, `gs1:netWeight`,
  `gs1:grossWeight`, `gs1:inPackage*`.

**Decisione dell'utente: si rinuncia**, finché il Web Vocabulary non ospiterà quei dati.
Motivo: in una demo il cui messaggio è l'aderenza agli standard, introdurre un namespace
locale o piegare `additionalProperty` sarebbe un'incoerenza che costa più del beneficio.
Nessuna modifica è stata fatta. **Non riproporre l'argomento** se non è l'utente a
riaprirlo.

Nota emersa e lasciata cadere per ora: `gs1:PropertyValue`, `gs1:propertyName`,
`gs1:propertyValue`, usati in `src/app/pages/product/product.ts:361` per lotto/scadenza,
**non esistono** nel vocabolario ufficiale. Preesistente al lavoro di questa sessione.

## 7. Punti aperti

- **Deploy in produzione mai eseguito.** Manca il dominio: `WEBSHOP_HOST`, `SITE_URL`,
  `ACME_EMAIL` non sono ancora stati decisi. Senza dominio Let's Encrypt non emette
  certificati (su IP nudo si resta in HTTP).
- **La GitHub Action non è stata sostituita.** `.github/workflows/deploy-pages.yml`
  risulta eliminato nel working tree ma il deploy via SSH sul droplet non è stato
  scritto. Bozza in `DEPLOY_CONTEXT.md`. Servono i secret `DROPLET_HOST`,
  `DROPLET_USER`, `DROPLET_SSH_KEY`.
- **Sul droplet i segreti vanno caricati a mano** (`scp`): `.env` e `secrets/gcp-sa.json`
  non passano da `git pull`.
- **429 `RESOURCE_EXHAUSTED` da Vertex**, intermittenti (circa 1 richiesta su 3): quota
  condivisa del progetto GCP, non il service account. Al ritentativo passa. Da tenere
  presente in demo dal vivo.
- **Chiave API n8n nella storia git**: presente nel commit `c8b5f3c`, dentro
  `.claude/settings.local.json`, già pushata. Il file non è più tracciato, ma la chiave
  resta nella storia: **va ruotata** dalla UI di n8n (ripulire la storia richiederebbe
  force push su un repo condiviso).
- **Ultimo passo del checkout non verificato da CLI**: la scelta del metodo di pagamento
  e `complete_checkout` sono guidati dalla UI React, vanno provati nel browser. Tutto
  ciò che precede (`ready_for_complete`) è verificato.
- **Residui cosmetici del sample**: `agent_card.json` si presenta come "SuperStore
  Merchant Agent"; `business-agent/src/business_agent/data/images/` contiene immagini
  dei prodotti del sample, inutilizzate; `chat-client/index.html` linka un `/index.css`
  che non esiste (già così nel sample).
- **Guardrail non applicato**: sulle domande numeriche l'agente risponde in LaTeX
  (`$$…$$`), che la UI di chat non renderizza, e presenta stime teoriche come dati.
  Bastano due righe nell'`instruction`, mai fatte perché legate all'argomento §6.

## 8. Preferenze di lavoro emerse

- Si risponde e si commenta il codice **in italiano**.
- L'utente vuole **concordare il piano prima di implementare** su interventi non banali.
- Tiene molto all'**aderenza reale agli standard GS1**: non inventare termini `gs1:` né
  dare per buoni nomi di proprietà senza verificarli sul vocabolario ufficiale.
- Chiede verifiche esplicite prima dei commit su cosa contiene segreti.
