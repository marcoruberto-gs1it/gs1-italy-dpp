import { definePreset } from '@openng/optimus-ui-styled';
import Aura from '@openng/optimus-ui-themes/aura';

/**
 * PrimeNG (pacchetto "primeng") è diventato a pagamento a partire dalla v22 (licenza PrimeUI,
 * vedi https://primeui.dev/nextchapter) — usiamo invece Optimus UI (@openng/optimus-ui),
 * continuazione MIT mantenuta dalla community dell'ultima versione libera (v21), stessa API
 * (selettori `p-*`, direttiva `pButton`, ecc.) e stessa struttura di theming, compatibile con
 * Angular 22 già in uso in questo progetto (nessun downgrade Angular necessario).
 *
 * Il colore "primary" diventa il nostro blu istituzionale GS1 Italy (--brand in tokens.css,
 * palette 2026-09-27 v2), non l'emerald di default di Aura. #002c6c non è un valore di una
 * scala Tailwind integrata (è l'hex ufficiale gs1it.org): la scala sotto è quindi costruita a
 * mano, stessa tinta (hue ≈216°, saturazione piena) del brand a ogni passo, ancorata
 * esattamente a #002c6c al gradino 700 — non presa da una palette Tailwind pre-esistente come
 * nella versione precedente (quell'indaco coincideva per puro caso con `indigo` di Tailwind).
 *
 * `colorScheme.light`/`.dark` invece di un'unica CSS `light-dark(...)` inline: provato prima
 * con `color: 'light-dark({primary.700}, {primary.600})'` in un solo blocco `primary`, ma
 * `darkModeSelector` (vedi app.config.ts) genera un blocco `:root[data-theme="dark"]`
 * SEPARATO che ricalcola `color`/`hoverColor`/`activeColor` con la propria formula di
 * default (`{primary.400}` ecc.) quando non trova un override esplicito per il tema scuro —
 * `light-dark()` in un unico valore veniva quindi ignorato lì, e il bottone risultava di un
 * peso sbagliato in tema scuro (verificato con uno smoke test: colore giusto in chiaro,
 * sbagliato in scuro). La struttura `colorScheme` sotto è quella che il generatore si aspetta
 * davvero per personalizzare entrambi i temi esplicitamente.
 *
 * Valori verificati contro tokens.css: light primary.color = primary.700 = #002c6c = --brand
 * esatto (13.32:1 con testo bianco); light hoverColor = primary.800 = #001a4d = --brand-strong
 * esatto (16.73:1). Dark primary.color = primary.600 = #005be0 = --accent (tema scuro) esatto
 * (5.85:1 con testo bianco, il --brand pieno sarebbe troppo scuro sul canvas quasi nero: 1.48:1,
 * quasi invisibile); dark hoverColor = primary.700 = #002c6c = --accent-strong (tema scuro)
 * esatto (13.32:1, ammissibile perché stato transitorio) — stessi hex già verificati WCAG in
 * tokens.css, nessuna nuova verifica di contrasto necessaria qui.
 */
const primaryScale = {
  50: '#f6f8fb',
  100: '#e9f0f9',
  200: '#c9dcf7',
  300: '#8bb8f9',
  400: '#2b80fd',
  500: '#0068ff',
  600: '#005be0',
  700: '#002c6c',
  800: '#001a4d',
  900: '#001533',
  950: '#010d1e',
};

// A questa posizione (semantic.colorScheme.light/dark.primary) il tipo si aspetta SOLO i 4
// campi semantici sotto — non la scala 0-950, che va invece nel `primary:` di primo livello
// qui sopra (verificato dal messaggio d'errore TS2559 di un tentativo precedente, che elencava
// esattamente questa forma come quella attesa).
function primarySemantics(color: string, contrastColor: string, hoverColor: string, activeColor: string) {
  return { color, contrastColor, hoverColor, activeColor };
}

export const GS1OptimusPreset = definePreset(Aura, {
  semantic: {
    primary: primaryScale,
    colorScheme: {
      light: {
        primary: primarySemantics('{primary.700}', '#ffffff', '{primary.800}', '{primary.900}'),
      },
      dark: {
        primary: primarySemantics('{primary.600}', '#ffffff', '{primary.700}', '{primary.800}'),
      },
    },
  },
});
