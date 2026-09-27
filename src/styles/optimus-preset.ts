import { definePreset } from '@openng/optimus-ui-styled';
import Aura from '@openng/optimus-ui-themes/aura';

/**
 * PrimeNG (pacchetto "primeng") è diventato a pagamento a partire dalla v22 (licenza PrimeUI,
 * vedi https://primeui.dev/nextchapter) — usiamo invece Optimus UI (@openng/optimus-ui),
 * continuazione MIT mantenuta dalla community dell'ultima versione libera (v21), stessa API
 * (selettori `p-*`, direttiva `pButton`, ecc.) e stessa struttura di theming, compatibile con
 * Angular 22 già in uso in questo progetto (nessun downgrade Angular necessario).
 *
 * Il colore "primary" diventa il nostro indaco (--brand in tokens.css, redesign 2026-09-27),
 * non l'emerald di default di Aura. A differenza del blu istituzionale GS1 usato prima, questo
 * indaco COINCIDE esattamente con la scala Tailwind `indigo` integrata di Aura — la scala sotto
 * è quindi quella ufficiale Tailwind, non hex costruiti a mano come nella versione precedente.
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
 * Valori verificati contro tokens.css: light primary.color = primary.700 = #4338ca = --brand
 * esatto (7.90:1 con testo bianco); light hoverColor = primary.800 = #3730a3 = --brand-strong
 * esatto (9.93:1). Dark primary.color = primary.600 = #4f46e5 = --accent (tema scuro) esatto
 * (6.29:1 con testo bianco, il --brand pieno sarebbe troppo scuro sul canvas quasi nero); dark
 * hoverColor = primary.700 = #4338ca = --accent-strong (tema scuro) esatto (7.90:1) — stessi hex
 * già verificati WCAG in tokens.css, nessuna nuova verifica di contrasto necessaria qui.
 */
const primaryScale = {
  50: '#eef2ff',
  100: '#e0e7ff',
  200: '#c7d2fe',
  300: '#a5b4fc',
  400: '#818cf8',
  500: '#6366f1',
  600: '#4f46e5',
  700: '#4338ca',
  800: '#3730a3',
  900: '#312e81',
  950: '#1e1b4b',
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
