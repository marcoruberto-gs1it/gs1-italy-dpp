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

/**
 * Percorso del file prerenderizzato → rotta pubblica servita da nginx.
 * `01/08032089000017/index.html` → `/01/08032089000017`, `index.html` → `/`.
 * Restituisce null per index.csr.html, che non è una pagina ma la shell client-side.
 */
function routeFromHtmlPath(file) {
  const rel = path.relative(BROWSER_DIR, file).split(path.sep).join('/');
  if (rel === 'index.csr.html') return null;
  const route = rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
  return route === 'index' ? '/' : `/${route}`;
}

const htmlFiles = walkHtmlFiles(BROWSER_DIR);
let fixedFiles = 0;
const missingCanonical = [];
for (const file of htmlFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(SSR_FALLBACK_ORIGIN)) {
    fs.writeFileSync(file, text.split(SSR_FALLBACK_ORIGIN).join(SITE_URL));
    fixedFiles++;
  }

  // Il canonical lo mette già app.ts (effect su navigationEnd → <link id="link-canonical">),
  // quindi qui non si inietta nulla: si verifica soltanto. Una pagina prerenderizzata che ne è
  // priva segnala che quella rotta non è passata dall'effect — un caso che si nota solo
  // leggendo l'HTML costruito, quindi tanto vale dirlo a build time invece di scoprirlo mesi
  // dopo in un audit SEO.
  if (routeFromHtmlPath(file) && !/rel=["']canonical["']/i.test(text)) {
    missingCanonical.push(path.relative(BROWSER_DIR, file));
  }
}
console.log(`generate-seo-files: dominio corretto in ${fixedFiles}/${htmlFiles.length} pagine prerenderizzate`);
if (missingCanonical.length) {
  console.warn(`generate-seo-files: ATTENZIONE — ${missingCanonical.length} pagine senza rel=canonical: ${missingCanonical.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 2. sitemap.xml — home + una entry per prodotto + una per brand owner (GLN, deduplicato:
//    vedi app.routes.server.ts, stessa logica)
// ---------------------------------------------------------------------------
const productUrls = products.map((p) => ({ loc: `/01/${p.gtin}` }));
const brandGlns = [...new Set(products.map((p) => p.brandOwner?.gln).filter(Boolean))];
const brandUrls = brandGlns.map((gln) => ({ loc: `/414/${gln}` }));

function urlEntry({ loc }) {
  return `  <url>\n    <loc>${SITE_URL}${loc}</loc>\n  </url>`;
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[{ loc: '/' }, ...productUrls, ...brandUrls].map(urlEntry).join('\n')}
</urlset>
`;

fs.writeFileSync(path.join(BROWSER_DIR, 'sitemap.xml'), sitemap);
console.log(`generate-seo-files: sitemap.xml generato (${1 + productUrls.length + brandUrls.length} URL, di cui ${brandUrls.length} pagine brand/GLN)`);

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

const robots = `# Digital Product Passport: dati pensati per essere letti da motori di ricerca e agenti AI
# (vedi /01/*), quindi accesso volutamente permissivo.

User-agent: *
Allow: /
Disallow: /admin
Disallow: /registry-api

${AI_AGENTS.map((a) => `User-agent: ${a}\nAllow: /\nDisallow: /admin\nDisallow: /registry-api`).join('\n\n')}

# Content-Signal (bozza IETF, non ancora uno standard consolidato): search = indicizzazione nei
# motori di ricerca; ai-input = uso come contesto da parte di agenti AI in risposta a una
# richiesta (RAG); ai-train = uso per addestrare modelli. Un parser che non riconosce questa
# direttiva la ignora semplicemente, per specifica.
Content-Signal: search=yes, ai-input=yes, ai-train=yes

Sitemap: ${SITE_URL}/sitemap.xml
`;

fs.writeFileSync(path.join(BROWSER_DIR, 'robots.txt'), robots);
console.log('generate-seo-files: robots.txt generato');

// ---------------------------------------------------------------------------
// 4. llms.txt — https://llmstxt.org
// ---------------------------------------------------------------------------
function oneLine(text, maxLen = 140) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxLen ? clean.slice(0, maxLen - 1).trimEnd() + '…' : clean;
}

const productSection = products
  .map((p) => `- [${p.name}](${SITE_URL}/01/${p.gtin}): ${oneLine(p.description)}`)
  .join('\n');

const llmsTxt = `# GS1 DPP

> Il Digital Product Passport di GS1 Italy: identificativi, dati e standard per i settori
> impattati dal regolamento ESPR. ${products.length} prodotti pubblicati.

## Sections

- [Home](${SITE_URL}/): spiegazione del DPP, quadro normativo, settori
- [Sitemap](${SITE_URL}/sitemap.xml)

## Products

${productSection}
`;

fs.writeFileSync(path.join(BROWSER_DIR, 'llms.txt'), llmsTxt);
console.log(`generate-seo-files: llms.txt generato (${(Buffer.byteLength(llmsTxt) / 1024).toFixed(1)} KB, ${products.length} prodotti)`);

// ---------------------------------------------------------------------------
// 4b. llms-full.txt — stessa convenzione llms.txt, ma la versione "exhaustive" prevista dallo
//    stesso standard (https://llmstxt.org/#llms-full.txt): non un indice di link, il contenuto
//    per intero in un solo documento.
// ---------------------------------------------------------------------------
function formatPrice(p) {
  if (!p.price?.amount) return null;
  const unit = p.price.unit ? `/${p.price.unit}` : '';
  return `${p.price.amount} ${p.price.currency || 'EUR'}${unit}`;
}

const productFullSection = products
  .map((p) => {
    const facts = [`GTIN ${p.gtin}`, `brand ${p.brand || '—'}`];
    if (p.category) facts.push(p.category);
    const price = formatPrice(p);
    if (price) facts.push(price);
    return `### ${p.name}\n${facts.join(' — ')}\n${p.description.replace(/\s+/g, ' ').trim()}\n[${SITE_URL}/01/${p.gtin}](${SITE_URL}/01/${p.gtin})`;
  })
  .join('\n\n');

const llmsFullTxt = `# GS1 DPP — full content

> Same catalogue described in llms.txt, expanded: every product's full description and known
> facts inline, not just a link to follow. ${products.length} products.

## Every product, in full

${productFullSection}
`;

fs.writeFileSync(path.join(BROWSER_DIR, 'llms-full.txt'), llmsFullTxt);
console.log(`generate-seo-files: llms-full.txt generato (${(Buffer.byteLength(llmsFullTxt) / 1024).toFixed(1)} KB, ${products.length} prodotti)`);

// ---------------------------------------------------------------------------
// 5. .well-known/agent-skills/index.json — elenco machine-readable delle capacità reali del
//    sito, in un formato pensato per la discovery automatica (a differenza di llms.txt, che è
//    prosa per un LLM). Nessuno standard consolidato definisce ancora questo file: qui si
//    descrivono solo endpoint che esistono davvero e si comportano come descritto.
// ---------------------------------------------------------------------------
const agentSkills = {
  name: 'GS1 DPP',
  description: 'Digital Product Passport: each product page publishes structured data (schema.org + gs1:) via content negotiation.',
  url: SITE_URL,
  skills: [
    {
      id: 'product-lookup',
      name: 'Look up a product',
      description: 'Fetch a product page with Accept: application/ld+json to get its structured record where published.',
      endpoint: `${SITE_URL}/01/{gtin}`,
      method: 'GET',
      requestHeaders: { Accept: 'application/ld+json' },
    },
  ],
};

fs.mkdirSync(path.join(BROWSER_DIR, '.well-known', 'agent-skills'), { recursive: true });
fs.writeFileSync(
  path.join(BROWSER_DIR, '.well-known', 'agent-skills', 'index.json'),
  JSON.stringify(agentSkills, null, 2)
);
console.log(`generate-seo-files: .well-known/agent-skills/index.json generato (${agentSkills.skills.length} skill)`);
