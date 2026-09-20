import { definePreset } from '@openng/optimus-ui-styled';
import Aura from '@openng/optimus-ui-themes/aura';

/**
 * PrimeNG (pacchetto "primeng") è diventato a pagamento a partire dalla v22 (licenza PrimeUI,
 * vedi https://primeui.dev/nextchapter) — usiamo invece Optimus UI (@openng/optimus-ui),
 * continuazione MIT mantenuta dalla community dell'ultima versione libera (v21), stessa API
 * (selettori `p-*`, direttiva `pButton`, ecc.) e stessa struttura di theming, compatibile con
 * Angular 22 già in uso in questo progetto (nessun downgrade Angular necessario).
 *
 * Il colore "primary" diventa il nostro indaco (--brand in tokens.css), non l'emerald di
 * default di Aura. Usiamo i riferimenti nominali di Aura ({indigo.700} ecc., la stessa scala
 * Tailwind che tokens.css già usa) invece di ripetere gli hex a mano — meno rischio di
 * battitura, e la scala completa 50-950 resta disponibile a chi in futuro estende questo
 * preset (es. stati hover di componenti non ancora coperti da questa migrazione).
 *
 * `colorScheme.light`/`.dark` invece di un'unica CSS `light-dark(...)` inline: provato prima
 * con `color: 'light-dark({primary.700}, {primary.600})'` in un solo blocco `primary`, ma
 * `darkModeSelector` (vedi app.config.ts) genera un blocco `:root[data-theme="dark"]`
 * SEPARATO che ricalcola `color`/`hoverColor`/`activeColor` con la propria formula di
 * default (`{primary.400}` ecc.) quando non trova un override esplicito per il tema scuro —
 * `light-dark()` in un unico valore veniva quindi ignorato lì, e il bottone risultava
 * indigo-400 invece del nostro indigo-600 in tema scuro (verificato con uno smoke test:
 * colore giusto in chiaro, sbagliato in scuro). La struttura `colorScheme` sotto è quella che
 * il generatore si aspetta davvero per personalizzare entrambi i temi esplicitamente.
 *
 * Valori verificati contro tokens.css: light primary.color = indigo.700 = #4338ca = --brand
 * esatto; dark primary.color = indigo.600 = #4f46e5 = --accent (tema scuro) esatto; dark
 * hoverColor = indigo.700 = #4338ca = --accent-strong (tema scuro) esatto — stessi hex già
 * verificati WCAG in questa sessione, nessuna nuova verifica di contrasto necessaria sul
 * riempimento dei bottoni primary.
 */
const primaryScale = {
  50: '{indigo.50}',
  100: '{indigo.100}',
  200: '{indigo.200}',
  300: '{indigo.300}',
  400: '{indigo.400}',
  500: '{indigo.500}',
  600: '{indigo.600}',
  700: '{indigo.700}',
  800: '{indigo.800}',
  900: '{indigo.900}',
  950: '{indigo.950}',
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
