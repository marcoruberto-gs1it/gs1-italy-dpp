// Script eseguito prima di "ng build" e prima di "ng serve" (vedi package.json: "build" e
// "prestart"): genera public/knowledge-graph.jsonld — lo stesso catalogo, ma ristrutturato come
// un vero grafo invece che come 47 documenti JSON-LD indipendenti. Scrive in public/ (non in
// dist/) perché è l'unica cartella servita sia da "ng serve" sia, via l'asset glob di
// angular.json, copiata dentro dist/browser durante "ng build" — stesso meccanismo già usato per
// public/web_bg.wasm.
//
// Cosa cambia rispetto a rawGs1Data (il JSON-LD già pubblicato per pagina, vedi product.ts):
//   1. Prodotto, brand e manufacturer arrivano già con un @id proprio in rawGs1Data (vedi
//      products.json): questo script lo LEGGE, non lo inventa — le stesse identità pubblicate
//      nella pagina canonica del prodotto, non una struttura parallela con ID propri.
//   2. Le organizzazioni (gs1:manufacturer, identificate da GLN) e i brand (gs1:Brand) non sono
//      più oggetti duplicati inline in ogni prodotto: diventano nodi canonici con un proprio
//      @id, referenziati con {"@id": ...} da chi li usa. In questo dataset ogni GLN produttore è
//      unico per prodotto (nessun accorpamento lì), ma i brand sono realmente condivisi — 6
//      brand coprono tutti i 47 prodotti — quindi qui la deduplicazione produce connessioni
//      vere: più prodotti che puntano allo stesso nodo Brand.
//   3. gs1:certificationAgency resta come da vocabolario (proprietà testuale, non va forzata a
//      riferimento): dove presente si aggiunge però un arco gs1it:certifiedBy verso un nodo
//      Organismo di Certificazione dedicato, che è dove la deduplicazione reale emerge di nuovo
//      (es. "Organismo Notificato 0123" certifica 4 prodotti sanitari diversi). Gli organismi di
//      certificazione non hanno una chiave GS1 propria né un @id in rawGs1Data: qui restano
//      l'unica identità coniata da questo script, non letta dalla fonte.
//
// Il vocabolario resta esattamente quello già in uso nel resto del progetto: gs1: (GS1 Web
// Vocabulary, https://ref.gs1.org/voc/, verificato termine per termine contro la v1.16) e
// schema.org via @vocab, la stessa convenzione di rawGs1Data. gs1it: (SITE_URL/voc/, vedi
// VOCABULARY_TERMS in src/app/data/vocabulary.ts) è l'estensione italiana già introdotta per la
// gerarchia GDSN (vedi buildGdsnWebVocabJson in product.service.ts): qui si aggiunge solo la
// singola proprietà certifiedBy, per lo stesso motivo — un concetto che il Web Vocabulary non
// copre.
//
// Perché JSON-LD e non subito Turtle/N-Quads: qualunque motore SPARQL reale (Jena/Fuseki,
// GraphDB, Oxigraph, RDFLib) importa JSON-LD valido direttamente. La conversione ad altre
// sintassi RDF, se mai servirà per un triple store specifico, è una trasformazione meccanica in
// più — non riguarda la correttezza della struttura, che è quello che cambia qui.
const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, 'public', 'knowledge-graph.jsonld');
const PRODUCTS_PATH = path.join(__dirname, 'src', 'app', 'data', 'products.json');

// Stessa convenzione di generate-seo-files.js/generate-agent-feed.js: nessun dominio hardcoded,
// in produzione SITE_URL arriva dall'ambiente di build (vedi webshop/Dockerfile, ARG impostato
// prima di "npm run build" — quindi disponibile anche qui, che gira prima di "ng build").
const SITE_URL = (process.env.SITE_URL || 'http://localhost:4200').replace(/\/$/, '');
// Stesso placeholder di SiteOriginService (src/app/services/site-origin.service.ts,
// SSR_FALLBACK_ORIGIN): è il dominio salvato in products.json per rawGs1Data.brand['@id'] finché
// non si conosce l'origine reale — va sostituito qui, non fidandosi del dominio salvato nel dato
// sorgente.
const PLACEHOLDER_ORIGIN = 'https://tuodominio-produzione.it';
const resolveOrigin = (id) => (id.startsWith(PLACEHOLDER_ORIGIN) ? SITE_URL + id.slice(PLACEHOLDER_ORIGIN.length) : id);

const products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));

const productId = (gtin) => `https://id.gs1.org/01/${gtin}`;
// AI 417 = Party GLN (https://ref.gs1.org/ai/417): identifica l'organizzazione come parte,
// distinto da AI 414 (GLN di una località fisica) già usato altrove nel progetto per i
// readPoint EPCIS — stesso numero di GLN, ruolo semantico diverso, URI diversa.
const organizationId = (gln) => `https://id.gs1.org/417/${gln}`;

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// gs1it: — namespace dati (istanze), distinto da SITE_URL/voc/ (namespace ontologia, vedi
// buildGdsnWebVocabJson): brand e organismi di certificazione non hanno una chiave di
// identificazione GS1, quindi qui si conia un identificatore stabile invece di lasciarli anonimi.
// Sul dominio del progetto (vedi SITE_URL sopra), non più su gs1it.org — quello è il sito reale
// di GS1 Italy, non qualcosa che questo progetto controlla o può far dereferenziare a qualcosa di
// coerente.
const brandId = (name) => `${SITE_URL}/id/brand/${slugify(name)}`;
const certificationBodyId = (name) => `${SITE_URL}/id/certification-body/${slugify(name)}`;

const organizations = new Map(); // @id -> node
const brands = new Map();
const certificationBodies = new Map();

// id passato esplicitamente (letto da rawGs1Data quando presente) invece di ricavato qui: la
// fonte di verità per l'identità di un'organizzazione è la pagina prodotto che la pubblica, non
// questo script — vedi la migrazione in products.json.
function registerOrganization(id, { name, address, gln }) {
  if (!organizations.has(id)) {
    const node = {
      '@id': id,
      '@type': ['Organization', 'gs1:Organization'],
      name,
      'gs1:organizationName': [{ '@value': name, '@language': 'it' }],
      'gs1:globalLocationNumber': gln,
    };
    if (address) node.address = address;
    organizations.set(id, node);
  }
  return id;
}

function registerBrand(id, name) {
  if (!brands.has(id)) {
    brands.set(id, {
      '@id': id,
      '@type': ['Brand', 'gs1:Brand'],
      name,
      'gs1:brandName': [{ '@value': name, '@language': 'it' }],
    });
  }
  return id;
}

function registerCertificationBody(name) {
  const id = certificationBodyId(name);
  if (!certificationBodies.has(id)) {
    certificationBodies.set(id, {
      '@id': id,
      '@type': 'gs1it:CertificationBody',
      'gs1:organizationName': [{ '@value': name, '@language': 'it' }],
    });
  }
  return id;
}

const productNodes = [];
let manufacturerLinksAdded = 0;

for (const p of products) {
  if (!p.rawGs1Data) continue; // stessa regola del resto del progetto: niente dati sintetici per i prodotti non AI-ready

  const doc = JSON.parse(JSON.stringify(p.rawGs1Data));
  // Preferisce l'@id già pubblicato in rawGs1Data (vedi migrazione in products.json); il
  // fallback resta per robustezza, non dovrebbe scattare sui 47 prodotti AI-ready attuali.
  doc['@id'] = doc['@id'] || productId(p.gtin);
  if (doc.name) doc.name = p.name;
  if (doc.description) doc.description = p.description;
  // Stessa correzione di generate-agent-feed.js: in products.json l'immagine è relativa alla
  // pagina, ma questo grafo viaggia come documento a sé (knowledge-graph.jsonld, caricato in un
  // triple store) dove non esiste nessun base URL su cui risolverla.
  if (typeof doc.image === 'string' && !/^https?:\/\//i.test(doc.image)) {
    doc.image = `${SITE_URL}/${doc.image.replace(/^\//, '')}`;
  }
  delete doc['@context']; // sostituito dal contesto unico del grafo, vedi in fondo

  // Brand: nome estratto da gs1:brandName se presente, altrimenti dal name schema.org.
  if (doc.brand) {
    const brandName = doc.brand['gs1:brandName']?.[0]?.['@value'] || doc.brand.name;
    // 4 prodotti non hanno un gs1:manufacturer separato: l'indirizzo e il GLN del produttore
    // sono (impropriamente) annidati dentro il brand stesso. Li recuperiamo come vera
    // organizzazione prima di ridurre il brand al solo nome — altrimenti quel dato andrebbe
    // perso, non solo deduplicato. Nessun @id da leggere per questo nodo: non esiste come
    // oggetto manufacturer separato in rawGs1Data, va coniato qui come prima.
    if (!doc.manufacturer && doc.brand['gs1:globalLocationNumber']) {
      const gln = doc.brand['gs1:globalLocationNumber'];
      const orgId = registerOrganization(organizationId(gln), { name: brandName, address: doc.brand.address, gln });
      doc.manufacturer = { '@id': orgId };
      manufacturerLinksAdded++;
    }
    if (brandName) {
      const id = doc.brand['@id'] ? resolveOrigin(doc.brand['@id']) : brandId(brandName);
      registerBrand(id, brandName);
      doc.brand = { '@id': id };
    }
  }

  // Organizzazione produttrice (gs1:manufacturer / schema:manufacturer). Se il ramo precedente
  // ha già ridotto doc.manufacturer a un riferimento {"@id": ...} (caso GLN-nel-brand), qui non
  // resta più gs1:globalLocationNumber da leggere e il blocco non fa nulla — è già risolto.
  if (doc.manufacturer && doc.manufacturer['gs1:globalLocationNumber']) {
    const gln = doc.manufacturer['gs1:globalLocationNumber'];
    const id = doc.manufacturer['@id'] || organizationId(gln);
    registerOrganization(id, { name: doc.manufacturer.name, address: doc.manufacturer.address, gln });
    doc.manufacturer = { '@id': id };
  }

  // Organismo di certificazione: gs1:certificationAgency resta testo (è il suo range dichiarato
  // nel Web Vocabulary), l'arco verso il nodo dedicato è un'aggiunta, non una sostituzione.
  if (Array.isArray(doc['gs1:certification'])) {
    for (const cert of doc['gs1:certification']) {
      const agencyIt = cert['gs1:certificationAgency']?.find((v) => v['@language'] === 'it');
      if (agencyIt) {
        cert['gs1it:certifiedBy'] = { '@id': registerCertificationBody(agencyIt['@value']) };
      }
    }
  }

  productNodes.push(doc);
}

const graph = {
  '@context': {
    schema: 'https://schema.org/',
    gs1: 'https://ref.gs1.org/voc/',
    gs1it: `${SITE_URL}/voc/`,
    xsd: 'http://www.w3.org/2001/XMLSchema#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    '@vocab': 'https://schema.org/',
  },
  '@graph': [...productNodes, ...organizations.values(), ...brands.values(), ...certificationBodies.values()],
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(graph, null, 2));

console.log(
  `generate-knowledge-graph: knowledge-graph.jsonld generato — ${productNodes.length} prodotti, ` +
    `${organizations.size} organizzazioni (${manufacturerLinksAdded} recuperate da brand senza manufacturer separato), ` +
    `${brands.size} brand, ${certificationBodies.size} organismi di certificazione`,
);
