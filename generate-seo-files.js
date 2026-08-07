// Script postbuild (eseguito dopo `ng build`, vedi package.json): genera sitemap.xml,
// robots.txt, llms.txt e llms-full.txt dentro dist/gs1-catalog/browser, e corregge nell'HTML
// prerenderizzato il dominio segnaposto usato lato server (vedi SiteOriginService) — questo
// è l'unico passaggio realmente necessario per la discoverability: molti crawler AI (GPTBot,
// ClaudeBot, PerplexityBot...) leggono l'HTML statico senza eseguire JavaScript, quindi il
// dominio reale deve essere già corretto nel file prerenderizzato, non solo dopo l'hydration
// nel browser.
const fs = require('fs');
const path = require('path');

const BROWSER_DIR = path.join(__dirname, 'dist', 'gs1-catalog', 'browser');
const PRODUCTS_PATH = path.join(__dirname, 'src', 'app', 'data', 'products.json');

// In produzione (vedi .github/workflows/deploy-pages.yml) SITE_URL è calcolato dinamicamente da
// owner/nome del repository — nessun dominio hardcoded. Il fallback locale serve solo per build
// manuali di sviluppo, dove questi file non vengono comunque pubblicati.
const SITE_URL = (process.env.SITE_URL || 'http://localhost:4200').replace(/\/$/, '');
const SSR_FALLBACK_ORIGIN = 'https://tuodominio-produzione.it';

if (!fs.existsSync(BROWSER_DIR)) {
  console.error(`generate-seo-files: ${BROWSER_DIR} non trovato — esegui dopo "ng build".`);
  process.exit(1);
}

const products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// 1. Corregge nei file prerenderizzati il dominio segnaposto lato server
// ---------------------------------------------------------------------------
function walkHtmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkHtmlFiles(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const htmlFiles = walkHtmlFiles(BROWSER_DIR);
let fixedFiles = 0;
for (const file of htmlFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(SSR_FALLBACK_ORIGIN)) {
    fs.writeFileSync(file, text.split(SSR_FALLBACK_ORIGIN).join(SITE_URL));
    fixedFiles++;
  }
}
console.log(`generate-seo-files: dominio corretto in ${fixedFiles}/${htmlFiles.length} pagine prerenderizzate`);

// ---------------------------------------------------------------------------
// 2. sitemap.xml — pagine statiche + una entry per prodotto (solo rotte prerenderizzate:
//    le varianti lotto/seriale sono client-rendered, potenzialmente infinite, e comunque
//    canonicalizzate sulla pagina prodotto — non hanno senso in una sitemap)
// ---------------------------------------------------------------------------
const sectorIds = [...new Set(products.map((p) => p.sectorId))];

const staticUrls = [
  { loc: '/' },
  { loc: '/validatore' },
  { loc: '/voc' },
  { loc: '/organizzazione' },
  // /assistente non è più una pagina prerenderizzata di questo sito: è il chat-client React
  // (vedi docker-compose.yml), una SPA senza contenuto statico da indicizzare.
  ...sectorIds.map((id) => ({ loc: `/catalog/${id}` })),
];

const productUrls = products.map((p) => ({
  loc: `/01/${p.gtin}`,
  lastmod: p.gdsn?.lastModified ? p.gdsn.lastModified.slice(0, 10) : undefined,
}));

function urlEntry({ loc, lastmod }) {
  const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';
  return `  <url>\n    <loc>${SITE_URL}${loc}</loc>${lastmodTag}\n  </url>`;
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...productUrls].map(urlEntry).join('\n')}
</urlset>
`;

fs.writeFileSync(path.join(BROWSER_DIR, 'sitemap.xml'), sitemap);
console.log(`generate-seo-files: sitemap.xml generato (${staticUrls.length + productUrls.length} URL, ${productUrls.filter((u) => u.lastmod).length} con lastmod)`);

// ---------------------------------------------------------------------------
// 3. robots.txt
// ---------------------------------------------------------------------------
// Elenco verificato al momento della stesura (2026): crawler dei principali motori di ricerca
// e dei principali agenti AI (assistenti conversazionali con retrieval, non solo training).
// Le policy dei singoli crawler cambiano nel tempo — vale la pena ricontrollare periodicamente
// (es. su https://darkvisitors.com/agents, mantenuto e aggiornato più spesso di questo file).
const AI_AGENTS = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', // OpenAI
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', // Anthropic
  'PerplexityBot', 'Perplexity-User', // Perplexity
  'Google-Extended', // Google — training/grounding di Gemini (distinto da Googlebot)
  'Applebot-Extended', // Apple Intelligence (distinto da Applebot)
  'Bingbot', // Microsoft/Copilot
  'CCBot', // Common Crawl — usato come corpus da molti modelli
  'Amazonbot', 'Meta-ExternalAgent', 'Bytespider',
];

const robots = `# Catalogo dimostrativo GS1 Digital Link: dati pensati per essere letti da motori di
# ricerca e agenti AI (vedi /assistente e /01/*), quindi accesso volutamente permissivo.

User-agent: *
Allow: /

${AI_AGENTS.map((a) => `User-agent: ${a}\nAllow: /`).join('\n\n')}

# Content-Signal (bozza IETF, non ancora uno standard consolidato — vedi il messaggio di
# riepilogo): search = indicizzazione nei motori di ricerca; ai-input = uso come contesto da
# parte di agenti AI in risposta a una richiesta (RAG); ai-train = uso per addestrare modelli.
# Un parser che non riconosce questa direttiva la ignora semplicemente, per specifica.
Content-Signal: search=yes, ai-input=yes, ai-train=yes

Sitemap: ${SITE_URL}/sitemap.xml
`;

fs.writeFileSync(path.join(BROWSER_DIR, 'robots.txt'), robots);
console.log('generate-seo-files: robots.txt generato');

// ---------------------------------------------------------------------------
// 4. llms.txt — https://llmstxt.org — in inglese per la massima comprensione da parte di
//    agenti AI generici; i dati del catalogo restano comunque disponibili in IT/EN sul sito.
// ---------------------------------------------------------------------------
const SECTOR_LABELS = {
  fmcg: 'Consumer Goods', foodservice: 'Foodservice', healthcare: 'Healthcare',
  apparel: 'Apparel', 'fresh-foods': 'Fresh Foods', costruzioni: 'Construction',
};

function oneLine(text, maxLen = 140) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxLen ? clean.slice(0, maxLen - 1).trimEnd() + '…' : clean;
}

const sectorSection = sectorIds
  .map((id) => `- [${SECTOR_LABELS[id] || id}](${SITE_URL}/catalog/${id}): ${products.filter((p) => p.sectorId === id).length} products`)
  .join('\n');

const productSection = products
  .map((p) => `- [${p.name}](${SITE_URL}/01/${p.gtin}): ${oneLine(p.description)}`)
  .join('\n');

const llmsTxt = `# GS1 Digital Link Catalog

> Demo catalog showing how GS1 Digital Link turns a GTIN into the gateway to a product's
> data, published as structured JSON-LD (GS1 Web Vocabulary and/or schema.org) so it can be
> read by search engines and AI agents. ${products.length} fictional products across ${sectorIds.length} sectors, brand "GS1 Italy" (company prefix 8032089).

## Sections

- [Home](${SITE_URL}/): sector overview and search
- [GS1 Digital Link Validator](${SITE_URL}/validatore): parses a Digital Link or bracketed AI element string with the real GS1 Barcode Syntax Engine (WASM), with a CTA to validator.schema.org
- [AI Shopping Assistant](${SITE_URL}/assistente): agentic chat (Google ADK + A2A + UCP) that searches the catalog, answers from the GS1 product sheets and can complete an order
- [Knowledge graph](${SITE_URL}/knowledge-graph): the whole catalog as an RDF graph, browsable and queryable with SPARQL
- [gs1it: vocabulary](${SITE_URL}/voc): definitions of the small extension used alongside the official GS1 Web Vocabulary (GDSN packaging hierarchy, certification bodies) — one page per term, each dereferenceable and machine-readable
- [GS1 Italy](${SITE_URL}/organizzazione): the real-world Organization this catalog's standards belong to — not a fictional entity like the brands/products below
- [Sitemap](${SITE_URL}/sitemap.xml)

## Machine-readable endpoints

- [Knowledge graph dataset](${SITE_URL}/knowledge-graph.jsonld): the entire catalog as one JSON-LD document (@context + @graph, ~250 KB). The densest single entry point: it carries what the per-product list below carries, already structured
- [Catalog feed](${SITE_URL}/catalog): lightweight JSON list of every product — gtin, name, brand, price, category, image, description. ~21 KB, for when the full graph is more than you need
- [GS1 product sheet](${SITE_URL}/01/${products[0].gtin}): request any \`/01/{gtin}\` with \`Accept: application/ld+json\` to get the full GS1 Web Vocabulary sheet — the same document embedded in the HTML page. Returns 404 when a product publishes no structured data, which is itself the answer

## Sectors

${sectorSection}

## Optional

Every product page, one by one — the verbose path to what the knowledge graph above already
carries in a single document. Safe to skip when working with a shorter context.

${productSection}
`;

fs.writeFileSync(path.join(BROWSER_DIR, 'llms.txt'), llmsTxt);
console.log(`generate-seo-files: llms.txt generato (${(Buffer.byteLength(llmsTxt) / 1024).toFixed(1)} KB, ${products.length} prodotti)`);

// ---------------------------------------------------------------------------
// 4b. llms-full.txt — stessa convenzione llms.txt, ma la versione "exhaustive" prevista dallo
//    stesso standard (https://llmstxt.org/#llms-full.txt): non un indice di link, il contenuto
//    per intero in un solo documento, cosí un agente non deve seguire 63 link separati per
//    avere l'intero catalogo. Stessa fonte dati di llms.txt (products.json, letto qui sopra),
//    solo con descrizione integrale invece che troncata a 140 caratteri e i campi realmente
//    disponibili (brand, categoria GPC, prezzo) invece del solo nome — niente di nuovo
//    inventato, solo meno tagliato.
// ---------------------------------------------------------------------------
function formatPrice(p) {
  if (!p.price?.amount) return null;
  const unit = p.price.unit ? `/${p.price.unit}` : '';
  return `${p.price.amount} ${p.price.currency || 'EUR'}${unit}`;
}

const productFullSection = products
  .map((p) => {
    const facts = [`GTIN ${p.gtin}`, `brand ${p.brand || 'GS1'}`];
    if (p.category) facts.push(p.category);
    const price = formatPrice(p);
    if (price) facts.push(price);
    if (p.rawGs1Data) {
      const certCount = p.rawGs1Data['gs1:certification']?.length;
      facts.push(p.gdsn ? 'AI-ready, GDSN packaging hierarchy' : 'AI-ready');
      if (certCount) facts.push(`${certCount} certification${certCount > 1 ? 's' : ''}`);
    } else {
      facts.push('no structured data published (demo contrast case)');
    }
    return `### ${p.name}\n${facts.join(' — ')}\n${p.description.replace(/\s+/g, ' ').trim()}\n[${SITE_URL}/01/${p.gtin}](${SITE_URL}/01/${p.gtin})`;
  })
  .join('\n\n');

const llmsFullTxt = `# GS1 Digital Link Catalog — full content

> Same demo described in llms.txt, expanded: every product's full description and known facts
> inline, not just a link to follow. ${products.length} fictional products across ${sectorIds.length} sectors, brand "GS1 Italy" (company prefix 8032089). Real, non-fictional facts (the
> GS1 Italy organization, the gs1: and gs1it: vocabularies) are marked as such below and on
> their own pages — everything else (brands, companies, GLNs, certifications) is invented for
> this demo.

## What this site is

A working demonstration of GS1 Digital Link: a GTIN resolves to a page publishing structured
data (GS1 Web Vocabulary and/or schema.org, content-negotiated via \`Accept: application/ld+json\`)
instead of just a picture and a price. ${sectorSection.split('\n').length} sectors, a GS1 Web
Vocabulary knowledge graph with real deduplicated brand/certification-body nodes, a GDSN
packaging-hierarchy example, and an agentic shopping assistant that reads the same structured
data a crawler would.

## Real-world entities (not fictional)

- [GS1 Italy](${SITE_URL}/organizzazione): the real non-profit organisation whose GS1 Digital
  Link and GS1 Web Vocabulary standards this catalog demonstrates. Address, tax code and
  official website on that page, not invented.
- [gs1it: vocabulary](${SITE_URL}/voc): the small extension this project defines and hosts
  itself (GDSN packaging hierarchy, certification-body class) for the concepts the official
  GS1 Web Vocabulary doesn't cover — one dereferenceable page per term.

## Sectors

${sectorSection}

## Every product, in full

${productFullSection}
`;

fs.writeFileSync(path.join(BROWSER_DIR, 'llms-full.txt'), llmsFullTxt);
console.log(`generate-seo-files: llms-full.txt generato (${(Buffer.byteLength(llmsFullTxt) / 1024).toFixed(1)} KB, ${products.length} prodotti)`);

// ---------------------------------------------------------------------------
// 5. .well-known/agent-skills/index.json — elenco machine-readable delle capacità reali del
//    sito, in un formato pensato per la discovery automatica (a differenza di llms.txt, che è
//    prosa per un LLM). Nessuno standard consolidato definisce ancora questo file: qui si
//    descrivono solo endpoint che esistono davvero e si comportano come descritto — nello
//    stesso spirito del resto del progetto, niente promesse su dati che non ci sono.
// ---------------------------------------------------------------------------
const agentSkills = {
  name: 'GS1 Digital Link Catalog',
  description:
    'Demo catalog: GS1 Digital Link URIs resolve to product pages that publish structured data (GS1 Web Vocabulary / schema.org) via content negotiation.',
  url: SITE_URL,
  skills: [
    {
      id: 'product-lookup',
      name: 'Look up a product’s structured GS1 data',
      description:
        'Resolve a GS1 Digital Link with Accept: application/ld+json to get the full GS1 Web Vocabulary / schema.org record for that product — allergens (with containment level), certifications, nutrition, materials, GDSN packaging hierarchy. Returns 404 when the product publishes no structured data: that absence is itself the answer, not an error to work around.',
      endpoint: `${SITE_URL}/01/{gtin}`,
      method: 'GET',
      requestHeaders: { Accept: 'application/ld+json' },
    },
    {
      id: 'catalog-feed',
      name: 'List every product in the catalog',
      description: `Lightweight JSON list of all ${products.length} products (gtin, name, brand, price, category, image, description) — what exists, before fetching individual sheets.`,
      endpoint: `${SITE_URL}/catalog`,
      method: 'GET',
    },
    {
      id: 'knowledge-graph-query',
      name: 'Query the catalog as an RDF graph',
      description:
        'The whole catalog as one JSON-LD document (@context + @graph): products, brands and certification bodies as deduplicated nodes with stable @id, ready to load into any RDF/SPARQL engine.',
      endpoint: `${SITE_URL}/knowledge-graph.jsonld`,
      method: 'GET',
    },
    {
      id: 'digital-link-validation',
      name: 'Validate a GS1 Digital Link or AI element string',
      description:
        'Parses a GS1 Digital Link URI or a bracketed AI element string with the real GS1 Barcode Syntax Engine (the same library used by official GS1 tools) and returns the extracted identifiers.',
      endpoint: `${SITE_URL}/validatore`,
      method: 'GET',
    },
    {
      id: 'shopping-assistant',
      name: 'Conversational shopping assistant',
      description:
        'An A2A/UCP commerce agent (Gemini) that searches the catalog, answers grounded only in the GS1 product sheets it can read — it states when a product has no structured data instead of guessing — and can complete a checkout. May require a password in this deployment; see the page for details.',
      endpoint: `${SITE_URL}/assistente`,
      protocol: 'A2A',
      protocolVersion: '0.3.0',
    },
  ],
};

fs.mkdirSync(path.join(BROWSER_DIR, '.well-known', 'agent-skills'), { recursive: true });
fs.writeFileSync(
  path.join(BROWSER_DIR, '.well-known', 'agent-skills', 'index.json'),
  JSON.stringify(agentSkills, null, 2)
);
console.log(`generate-seo-files: .well-known/agent-skills/index.json generato (${agentSkills.skills.length} skill)`);
