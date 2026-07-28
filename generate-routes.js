const fs = require('fs');
const path = require('path');

// Percorsi dei file
const productsPath = path.join(__dirname, 'src', 'app', 'data', 'products.json');
const routesPath = path.join(__dirname, 'routes.txt');

try {
  // 1. Legge il database JSON
  const rawData = fs.readFileSync(productsPath, 'utf8');
  const products = JSON.parse(rawData);

  // 2. Usiamo un Set per evitare rotte duplicate (es. più prodotti nello stesso settore)
  const routes = new Set();
  
  // Aggiungiamo la home page
  routes.add('/');

  products.forEach(product => {
    // Aggiungiamo la rotta del catalogo di appartenenza
    if (product.sectorId) {
      routes.add(`/catalog/${product.sectorId}`);
    }
    // Aggiungiamo la rotta del prodotto (Digital Link)
    if (product.gtin) {
      routes.add(`/01/${product.gtin}`);
    }
  });

  // 3. Scrive il file routes.txt
  fs.writeFileSync(routesPath, Array.from(routes).join('\n'));
  console.log(`✅ File routes.txt generato con successo! (Trovate ${routes.size} rotte)`);
  
} catch (error) {
  console.error('❌ Errore durante la generazione delle rotte:', error);
  process.exit(1);
}