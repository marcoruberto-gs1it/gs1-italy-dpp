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
// Stesso placeholder di SiteOriginService (src/app/services/site-origin.service.ts,
// SSR_FALLBACK_ORIGIN) e di generate-knowledge-graph.js: il dominio salvato in products.json per
// rawGs1Data.brand['@id'] finché non si conosce l'origine reale.
const PLACEHOLDER_ORIGIN = 'https://tuodominio-produzione.it';
const resolveOrigin = (id) => (id.startsWith(PLACEHOLDER_ORIGIN) ? SITE_URL + id.slice(PLACEHOLDER_ORIGIN.length) : id);
/** "images/x.jpg" → "https://dominio/images/x.jpg"; un URL già assoluto resta com'è. */
const absoluteUrl = (u) => (/^https?:\/\//i.test(u) ? u : `${SITE_URL}/${u.replace(/^\//, '')}`);

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
  // Se il prodotto pubblica una scheda GS1 o no. Serve alla chat per mostrare il badge
  // "AI Ready" solo a chi lo è davvero: senza questo dato il client non ha modo di
  // saperlo, perché la vista leggera non porta le proprietà gs1:. È la stessa condizione
  // che decide la generazione del sidecar .jsonld qui sotto.
  aiReady: !!p.rawGs1Data,
}));

fs.writeFileSync(path.join(BROWSER_DIR, 'catalog.json'), JSON.stringify(catalog));
console.log(`generate-agent-feed: catalog.json generato (${catalog.length} prodotti, ${(JSON.stringify(catalog).length / 1024).toFixed(1)} KB)`);

// ---------------------------------------------------------------------------
// 2. 01/<gtin>/index.jsonld — la scheda GS1 in JSON-LD puro
// ---------------------------------------------------------------------------
// Stessa identica fonte del blocco <script type="application/ld+json"> che la pagina
// prerenderizzata già pubblica (vedi product.ts::jsonLdJson): cambia solo l'involucro.
//
// I prodotti senza rawGs1Data NON ottengono il sidecar, di proposito: non pubblicano dati
// strutturati. Per loro /01/{gtin} con Accept: application/ld+json risponde 404, l'agente non
// riceve dati e deve dichiarare che la scheda non pubblica dati strutturati.
let written = 0;
for (const p of products) {
  if (!p.rawGs1Data) continue;

  // Allineato a product.ts: i campi schema.org semplici seguono il nome/descrizione del
  // prodotto (le proprietà gs1: restano intatte, sono già multilingua all'origine).
  const doc = JSON.parse(JSON.stringify(p.rawGs1Data));
  if (doc.name) doc.name = p.name;
  if (doc.description) doc.description = p.description;
  // schema:hasGS1DigitalLink — stessa proprietà iniettata da product.ts::jsonLdJson, qui con
  // SITE_URL invece di SiteOriginService perché questo script gira a build time, non a runtime.
  doc['hasGS1DigitalLink'] = `${SITE_URL}/01/${p.gtin}`;
  // @id è l'identificatore del prodotto stesso: deve essere il GS1 Digital Link risolvibile su
  // questo sito (non il placeholder di products.json, né id.gs1.org — non è il nostro dominio).
  doc['@id'] = doc['hasGS1DigitalLink'];
  if (doc.offers) doc.offers['schema:url'] = doc['hasGS1DigitalLink'];
  // brand['@id'] è salvato in products.json col placeholder di dominio (vedi PLACEHOLDER_ORIGIN
  // sopra): risolto qui con lo stesso principio di hasGS1DigitalLink, non copiato così com'è.
  if (doc.brand?.['@id']) doc.brand['@id'] = resolveOrigin(doc.brand['@id']);
  // image è salvata relativa in products.json ("images/<gtin>.jpg"), che va bene per un <img>
  // in pagina ma non dentro un documento JSON-LD: chi lo consuma lo riceve staccato dalla
  // pagina (Accept: application/ld+json, o dal knowledge graph) e non ha nessun base URL su cui
  // risolverla. Assoluta come già lo sono catalog.json e hasGS1DigitalLink.
  if (typeof doc.image === 'string') doc.image = absoluteUrl(doc.image);

  const dir = path.join(BROWSER_DIR, '01', p.gtin);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.jsonld'), JSON.stringify(doc));
  written++;
}

console.log(`generate-agent-feed: ${written} schede JSON-LD generate (${products.length - written} prodotti senza dati strutturati, volutamente non esposti)`);

// ---------------------------------------------------------------------------
// 3. 01/<gtin>/index.jsonld dei livelli di imballo superiori (cartone, pallet…)
// ---------------------------------------------------------------------------
// Cartone e pallet hanno un GTIN proprio — nei dati ci sono — e per GS1 un GTIN che
// esiste identifica un articolo commerciale che deve poter essere risolto. Quindi ogni
// livello diventa una risorsa a sé al proprio Digital Link, descritta con SOLI termini
// verificati sul GS1 Web Vocabulary: gs1:packagingType, gs1:netContent, gs1:netWeight,
// gs1:grossWeight, gs1:grossVolume, gs1:inPackage*.
//
// La RELAZIONE fra i livelli non ha bisogno di alcuna proprietà: è già codificata negli
// identificativi. Il primo carattere del GTIN-14 è l'*indicator digit*, che per le GS1
// General Specifications distingue i livelli di imballo dello stesso articolo — qui
// 0=unità base, 1=cartone, 2=pallet, con lo stesso item reference e il check digit
// ricalcolato. Nel dataset la regola è rispettata da 18 prodotti su 18, ed è così che
// store.py ritrova i livelli partendo dal GTIN dell'unità base.
//
// ORDINE DEGLI ASSI. Sull'unità base è certo: la stringa `dimensions` coincide con
// gs1:inPackageHeight/Width/Depth di rawGs1Data (H × W × D). Sui livelli superiori il
// dataset usa invece L × W × H: lo dimostra il pallet, dichiarato "Pallet EPAL" con
// 1200 x 800 x 1450, dove 1200×800 è l'impronta EPAL e 1450 l'altezza. Il cartone è
// compatibile con entrambe le letture, quindi non smentisce. Si applica L × W × H, e il
// calcolo di stoccaggio prova comunque tutte le orientazioni: un "alto" sbagliato
// cambierebbe l'assunzione dichiarata, non il conteggio.

const UNIT_CODES = { g: 'GRM', kg: 'KGM', ml: 'MLT', l: 'LTR', pz: 'H87' };

/** "2.82 kg" → { value: 2.82, unitCode: "KGM" }; null se non interpretabile. */
function parseQuantity(text) {
  const match = String(text || '').match(/^\s*([\d.,]+)\s*([a-zA-Z]+)\s*$/);
  if (!match) return null;
  const unitCode = UNIT_CODES[match[2].toLowerCase()];
  if (!unitCode) return null;
  return { value: Number(match[1].replace(',', '.')), unitCode };
}

/** "1200 x 800 x 1450 mm" → [1200, 800, 1450] in millimetri. */
function parseDimensions(text) {
  const match = String(text || '').match(
    /^\s*([\d.,]+)\s*[x×]\s*([\d.,]+)\s*[x×]\s*([\d.,]+)\s*mm\s*$/i
  );
  if (!match) return null;
  return match.slice(1, 4).map((n) => Number(n.replace(',', '.')));
}

/** Nodo gs1:QuantitativeValue nella stessa forma usata dalle schede del dataset. */
function quantitativeValue(value, unitCode) {
  return {
    '@type': 'gs1:QuantitativeValue',
    value: { '@value': String(value), '@type': 'xsd:float' },
    unitCode,
  };
}

let levelsWritten = 0;
let productsWithLevels = 0;

for (const p of products) {
  const hierarchy = p.gdsn?.hierarchy;
  if (!p.rawGs1Data || !hierarchy?.length) continue;

  let produced = 0;
  for (const level of hierarchy) {
    // L'unità base ha già la sua scheda completa: qui solo i livelli superiori.
    if (!level.gtin || level.gtin === p.gtin || level.isBaseUnit) continue;

    const doc = {
      '@context': JSON.parse(JSON.stringify(p.rawGs1Data['@context'])),
      '@type': JSON.parse(JSON.stringify(p.rawGs1Data['@type'])),
      // Stesso principio del prodotto base: il Digital Link vive su questo sito, non su
      // id.gs1.org (il resolver di GS1, che non risolverebbe comunque questo dato).
      '@id': `${SITE_URL}/01/${level.gtin}`,
      'gs1:gtin': level.gtin,
      name: `${p.name} — ${level.packagingTypeLabel || level.level}`,
    };

    if (p.rawGs1Data.brand) {
      doc.brand = JSON.parse(JSON.stringify(p.rawGs1Data.brand));
      if (doc.brand['@id']) doc.brand['@id'] = resolveOrigin(doc.brand['@id']);
    }
    if (level.packagingTypeCode) doc['gs1:packagingType'] = level.packagingTypeCode;

    // Quantità contenuta come contenuto netto in pezzi (H87 = piece, UN/ECE Rec 20):
    // "contenuto netto: 12 pezzi". È l'unico modo di esprimere il conteggio restando
    // dentro il vocabolario, che non ha una proprietà per la quantità del livello
    // inferiore (quella vive in GDSN).
    if (level.quantityContained) {
      doc['gs1:netContent'] = quantitativeValue(level.quantityContained, 'H87');
    }

    for (const [field, property] of [
      ['netWeight', 'gs1:netWeight'],
      ['grossWeight', 'gs1:grossWeight'],
    ]) {
      const parsed = parseQuantity(level[field]);
      if (parsed) doc[property] = quantitativeValue(parsed.value, parsed.unitCode);
    }

    const dimensions = parseDimensions(level.dimensions);
    if (dimensions) {
      const [length, width, height] = dimensions;
      doc['gs1:inPackageHeight'] = quantitativeValue(height, 'MMT');
      doc['gs1:inPackageWidth'] = quantitativeValue(width, 'MMT');
      doc['gs1:inPackageDepth'] = quantitativeValue(length, 'MMT');
      // Volume lordo: indipendente dall'ordine degli assi, ed è il numero che serve a
      // una stima di occupazione. mm³ → m³.
      const cubicMetres = (length * width * height) / 1e9;
      doc['gs1:grossVolume'] = quantitativeValue(Number(cubicMetres.toFixed(6)), 'MTQ');
    }

    const dir = path.join(BROWSER_DIR, '01', level.gtin);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.jsonld'), JSON.stringify(doc));
    levelsWritten++;
    produced++;
  }

  if (produced) productsWithLevels++;
}

console.log(`generate-agent-feed: ${levelsWritten} schede di livelli logistici generate per ${productsWithLevels} prodotti (cartoni, pallet…)`);
