// Script postbuild: pubblica il design system del sito come asset statici, a percorsi
// stabili, dentro dist/gs1-catalog/browser.
//
// Serve al chat-client React (/assistente), che gira in un container separato ma sullo
// stesso dominio: caricando questi due file ottiene esattamente i colori, i raggi, le
// ombre, i font e i componenti del sito, senza che nessuno debba tenerne una copia
// allineata a mano. Cambiare i token qui dentro cambia anche la chat.
//
// tokens.css  → variabili CSS e classi condivise (.gs-card, .gs-badge, .gs-btn…)
// chat.css    → il linguaggio visivo della pagina di chat, già disegnato per il sito
//               (shell, bolle, avatar, barra di input, card prodotto in conversazione)
const fs = require('fs');
const path = require('path');

const BROWSER_DIR = path.join(__dirname, 'dist', 'gs1-catalog', 'browser');

// sorgente → nome pubblicato
const ASSETS = [
  ['src/styles/tokens.css', 'tokens.css'],
  ['src/app/pages/chat/chat.css', 'chat.css'],
];

if (!fs.existsSync(BROWSER_DIR)) {
  console.error(`publish-theme: ${BROWSER_DIR} non trovato — esegui dopo "ng build".`);
  process.exit(1);
}

for (const [source, target] of ASSETS) {
  const from = path.join(__dirname, source);
  if (!fs.existsSync(from)) {
    console.error(`publish-theme: sorgente mancante ${source}`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(BROWSER_DIR, target));
}

console.log(`publish-theme: ${ASSETS.length} fogli di stile pubblicati (${ASSETS.map(([, t]) => '/' + t).join(', ')})`);
