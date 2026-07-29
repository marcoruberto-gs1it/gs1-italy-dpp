// Script postbuild (eseguito dopo generate-seo-files.js, vedi package.json): genera in
// dist/gs1-catalog/browser i due artefatti che rendono il sito consumabile da un agente
// commerciale — il feed leggero del catalogo e il JSON-LD "puro" di ogni scheda prodotto.
//
// Il consumatore è il business-agent (Google ADK/A2A/UCP, cartella business-agent/), portato
// dal sample UCP di Google: lì la sorgente dati era un finto shop FastAPI, qui è questo sito.
// Il sample si aspetta esattamente due chiamate — GET {CATALOG_URL}/catalog e GET
// {CATALOG_URL}/01/{gtin} con Accept: application/ld+json — quindi è il sito ad adattarsi al
// protocollo che l'agente già parla, non il contrario: il core del sample resta intatto.
//
// Il routing verso questi file lo fa nginx (vedi webshop/nginx.conf): /catalog serve
// catalog.json, e /01/{gtin} serve index.jsonld solo se il chiamante manda l'header Accept
// giusto (content negotiation), altrimenti resta la pagina HTML prerenderizzata di sempre.
const fs = require('fs');
const path = require('path');

const BROWSER_DIR = path.join(__dirname, 'dist', 'gs1-catalog', 'browser');
const PRODUCTS_PATH = path.join(__dirname, 'src', 'app', 'data', 'products.json');

// Stessa convenzione di generate-seo-files.js: nessun dominio hardcoded, in produzione
// SITE_URL arriva dall'ambiente di build (vedi webshop/Dockerfile).
const SITE_URL = (process.env.SITE_URL || 'http://localhost:4200').replace(/\/$/, '');

if (!fs.existsSync(BROWSER_DIR)) {
  console.error(`generate-agent-feed: ${BROWSER_DIR} non trovato — esegui dopo "ng build".`);
  process.exit(1);
}

const products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// 1. catalog.json — vista leggera, servita su GET /catalog
// ---------------------------------------------------------------------------
// I nomi dei campi non sono una scelta libera: sono quelli letti da
// business_agent/store.py::_initialize_products (gtin, name, brand, price, priceCurrency,
// category, image, description). Cambiarli qui significa rompere il mapping del sample.
//
// Il feed resta volutamente leggero: è l'elenco di cosa esiste in negozio, con i dati
// commerciali. La ricchezza GS1 non passa da qui — l'agente legge le schede JSON-LD
// pubblicate, una per prodotto, dalla loro URL Digital Link (vedi §2 e store.py).
// L'immagine è assoluta perché viene renderizzata dalla ProductCard del chat-client, che sta
// su un'altra pagina (/assistente) e non condivide il base URL del sito.
const catalog = products.map((p) => ({
  gtin: p.gtin,
  name: p.name,
  brand: p.brand || 'GS1',
  price: p.price?.amount != null ? String(p.price.amount) : '',
  priceCurrency: p.price?.currency || 'EUR',
  category: p.sectorName || '',
  image: p.image ? `${SITE_URL}/${p.image.replace(/^\//, '')}` : '',
  description: p.description || '',
}));

fs.writeFileSync(path.join(BROWSER_DIR, 'catalog.json'), JSON.stringify(catalog));
console.log(`generate-agent-feed: catalog.json generato (${catalog.length} prodotti, ${(JSON.stringify(catalog).length / 1024).toFixed(1)} KB)`);

// ---------------------------------------------------------------------------
// 2. 01/<gtin>/index.jsonld — la scheda GS1 in JSON-LD puro
// ---------------------------------------------------------------------------
// Stessa identica fonte del blocco <script type="application/ld+json"> che la pagina
// prerenderizzata già pubblica (vedi product.ts::jsonLdJson): cambia solo l'involucro.
//
// I prodotti senza rawGs1Data NON ottengono il sidecar, di proposito: rappresentano il caso
// demo "non ancora AI Ready" (vedi il commento in product.ts). Per loro /01/{gtin} con
// Accept: application/ld+json risponde 404, l'agente non riceve dati e deve dichiarare che la
// scheda non pubblica dati strutturati — che è esattamente il contrasto che la demo mostra.
let written = 0;
for (const p of products) {
  if (!p.rawGs1Data) continue;

  // Allineato a product.ts: i campi schema.org semplici seguono il nome/descrizione del
  // prodotto (le proprietà gs1: restano intatte, sono già multilingua all'origine).
  const doc = JSON.parse(JSON.stringify(p.rawGs1Data));
  if (doc.name) doc.name = p.name;
  if (doc.description) doc.description = p.description;

  const dir = path.join(BROWSER_DIR, '01', p.gtin);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.jsonld'), JSON.stringify(doc));
  written++;
}

console.log(`generate-agent-feed: ${written} schede JSON-LD generate (${products.length - written} prodotti senza dati strutturati, volutamente non esposti)`);
