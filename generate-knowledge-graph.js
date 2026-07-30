// Script postbuild (dopo generate-agent-feed.js, vedi package.json): genera
// dist/gs1-catalog/browser/knowledge-graph.jsonld — lo stesso catalogo, ma ristrutturato come
// un vero grafo invece che come 47 documenti JSON-LD indipendenti.
//
// Cosa cambia rispetto a rawGs1Data (il JSON-LD già pubblicato per pagina, vedi product.ts):
//   1. Ogni prodotto riceve un @id stabile e dereferenziabile: il suo Digital Link canonico
//      (https://id.gs1.org/01/{gtin}), non solo il valore letterale gtin.
//   2. Le organizzazioni (gs1:manufacturer, identificate da GLN) e i brand (gs1:Brand) non sono
//      più oggetti duplicati inline in ogni prodotto: diventano nodi canonici con un proprio
//      @id, referenziati con {"@id": ...} da chi li usa. In questo dataset ogni GLN produttore è
//      unico per prodotto (nessun accorpamento lì), ma i brand sono realmente condivisi — 6
//      brand coprono tutti i 47 prodotti — quindi qui la deduplicazione produce connessioni
//      vere: più prodotti che puntano allo stesso nodo Brand.
//   3. gs1:certificationAgency resta come da vocabolario (proprietà testuale, non va forzata a
//      riferimento): dove presente si aggiunge però un arco gs1it:certifiedBy verso un nodo
//      Organismo di Certificazione dedicato, che è dove la deduplicazione reale emerge di nuovo
//      (es. "Organismo Notificato 0123" certifica 4 prodotti sanitari diversi).
//
// Il vocabolario resta esattamente quello già in uso nel resto del progetto: gs1: (GS1 Web
// Vocabulary, https://ref.gs1.org/voc/, verificato termine per termine contro la v1.16) e
// schema.org via @vocab, la stessa convenzione di rawGs1Data. gs1it: (https://gs1it.org/voc/) è
// l'estensione italiana già introdotta per la gerarchia GDSN (vedi buildGdsnWebVocabJson in
// product.service.ts): qui si aggiunge solo la singola proprietà certifiedBy, per lo stesso
// motivo — un concetto che il Web Vocabulary non copre.
//
// Perché JSON-LD e non subito Turtle/N-Quads: qualunque motore SPARQL reale (Jena/Fuseki,
// GraphDB, Oxigraph, RDFLib) importa JSON-LD valido direttamente. La conversione ad altre
// sintassi RDF, se mai servirà per un triple store specifico, è una trasformazione meccanica in
// più — non riguarda la correttezza della struttura, che è quello che cambia qui.
const fs = require('fs');
const path = require('path');

const BROWSER_DIR = path.join(__dirname, 'dist', 'gs1-catalog', 'browser');
const PRODUCTS_PATH = path.join(__dirname, 'src', 'app', 'data', 'products.json');

if (!fs.existsSync(BROWSER_DIR)) {
  console.error(`generate-knowledge-graph: ${BROWSER_DIR} non trovato — esegui dopo "ng build".`);
  process.exit(1);
}

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

// gs1it: — namespace dati (istanze), distinto da https://gs1it.org/voc/ (namespace ontologia,
// vedi buildGdsnWebVocabJson): brand e organismi di certificazione non hanno una chiave di
// identificazione GS1, quindi qui si conia un identificatore stabile invece di lasciarli anonimi.
const brandId = (name) => `https://gs1it.org/id/brand/${slugify(name)}`;
const certificationBodyId = (name) => `https://gs1it.org/id/certification-body/${slugify(name)}`;

const organizations = new Map(); // @id -> node
const brands = new Map();
const certificationBodies = new Map();

function registerOrganization(gln, { name, address }) {
  const id = organizationId(gln);
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

function registerBrand(name) {
  const id = brandId(name);
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
  doc['@id'] = productId(p.gtin);
  if (doc.name) doc.name = p.name;
  if (doc.description) doc.description = p.description;
  delete doc['@context']; // sostituito dal contesto unico del grafo, vedi in fondo

  // Brand: nome estratto da gs1:brandName se presente, altrimenti dal name schema.org.
  if (doc.brand) {
    const brandName = doc.brand['gs1:brandName']?.[0]?.['@value'] || doc.brand.name;
    // 4 prodotti non hanno un gs1:manufacturer separato: l'indirizzo e il GLN del produttore
    // sono (impropriamente) annidati dentro il brand stesso. Li recuperiamo come vera
    // organizzazione prima di ridurre il brand al solo nome — altrimenti quel dato andrebbe
    // perso, non solo deduplicato.
    if (!doc.manufacturer && doc.brand['gs1:globalLocationNumber']) {
      const gln = doc.brand['gs1:globalLocationNumber'];
      const orgId = registerOrganization(gln, { name: brandName, address: doc.brand.address });
      doc.manufacturer = { '@id': orgId };
      manufacturerLinksAdded++;
    }
    if (brandName) {
      registerBrand(brandName);
      doc.brand = { '@id': brandId(brandName) };
    }
  }

  // Organizzazione produttrice (gs1:manufacturer / schema:manufacturer).
  if (doc.manufacturer && !doc.manufacturer['@id']) {
    const gln = doc.manufacturer['gs1:globalLocationNumber'];
    if (gln) {
      const orgId = registerOrganization(gln, { name: doc.manufacturer.name, address: doc.manufacturer.address });
      doc.manufacturer = { '@id': orgId };
    }
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
    gs1it: 'https://gs1it.org/voc/',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    '@vocab': 'https://schema.org/',
  },
  '@graph': [...productNodes, ...organizations.values(), ...brands.values(), ...certificationBodies.values()],
};

fs.writeFileSync(path.join(BROWSER_DIR, 'knowledge-graph.jsonld'), JSON.stringify(graph, null, 2));

console.log(
  `generate-knowledge-graph: knowledge-graph.jsonld generato — ${productNodes.length} prodotti, ` +
    `${organizations.size} organizzazioni (${manufacturerLinksAdded} recuperate da brand senza manufacturer separato), ` +
    `${brands.size} brand, ${certificationBodies.size} organismi di certificazione`,
);
