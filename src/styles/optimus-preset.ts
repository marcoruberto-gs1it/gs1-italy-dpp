import { definePreset } from '@openng/optimus-ui-styled';
import Aura from '@openng/optimus-ui-themes/aura';

/**
 * PrimeNG (pacchetto "primeng") è diventato a pagamento a partire dalla v22 (licenza PrimeUI,
 * vedi https://primeui.dev/nextchapter) — usiamo invece Optimus UI (@openng/optimus-ui),
 * continuazione MIT mantenuta dalla community dell'ultima versione libera (v21), stessa API
 * (selettori `p-*`, direttiva `pButton`, ecc.) e stessa struttura di theming, compatibile con
 * Angular 22 già in uso in questo progetto (nessun downgrade Angular necessario).
 *
 * Il colore "primary" diventa il nostro blu istituzionale GS1 (--brand in tokens.css), non
 * l'emerald di default di Aura. A differenza della vecchia palette indaco, il blu #002c6c di
 * gs1it.org non coincide con nessuno scalino della scala Tailwind integrata di Aura — la scala
 * sotto è quindi costruita a mano con gli hex ufficiali GS1 (blu + "slate", la variante chiara
 * usata per il riempimento in tema scuro), non con riferimenti nominali `{indigo.X}`.
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
 * esatto. Dark primary.color = #3a70bf = --accent (tema scuro) esatto (4.94:1 con testo
 * bianco, il blu #002c6c pieno sarebbe illeggibile su sfondo quasi nero); dark hoverColor =
 * #2f5fa0 = --accent-strong (tema scuro) esatto (6.43:1) — stessi hex già verificati WCAG in
 * questa sessione, nessuna nuova verifica di contrasto necessaria sul riempimento dei bottoni
 * primary.
 */
const primaryScale = {
  50: '#f0f5fa',
  100: '#e5f0fc',
  200: '#c4d7ed',
  300: '#89aadb',
  400: '#5f8ad1',
  500: '#3a70bf',
  600: '#235696',
  700: '#002c6c',
  800: '#001a4d',
  900: '#001335',
  950: '#000a20',
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
        primary: primarySemantics('{primary.500}', '#ffffff', '#2f5fa0', '{primary.600}'),
      },
    },
  },
});
