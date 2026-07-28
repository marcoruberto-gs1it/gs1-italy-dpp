// Script postbuild (eseguito dopo `ng build`, vedi package.json): genera sitemap.xml,
// robots.txt e llms.txt dentro dist/gs1-catalog/browser, e corregge nell'HTML
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
  { loc: '/assistente' },
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
- [AI Catalog Assistant](${SITE_URL}/assistente): natural-language search over the catalog's structured data
- [Sitemap](${SITE_URL}/sitemap.xml)

## Sectors

${sectorSection}

## Products

${productSection}
`;

fs.writeFileSync(path.join(BROWSER_DIR, 'llms.txt'), llmsTxt);
console.log(`generate-seo-files: llms.txt generato (${(Buffer.byteLength(llmsTxt) / 1024).toFixed(1)} KB, ${products.length} prodotti)`);
