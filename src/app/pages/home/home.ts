import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { QRCodeComponent } from 'angularx-qrcode';
import { IconComponent } from '../../components/icon/icon';
import { LottiePlayerComponent } from '../../components/lottie-player/lottie-player';
import { ScrollRevealDirective } from '../../directives/scroll-reveal';
import { Sector, SECTORS, localizeSector } from '../../data/sectors';
import { I18nService } from '../../services/i18n.service';
import { LanguageService } from '../../services/language.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { StructuredDataService } from '../../services/structured-data.service';
import { isValidGtin } from '../../utils/gs1-validators';
import { setSocialMeta } from '../../utils/social-meta';

const AUTOPLAY_INTERVAL_MS = 5000;

/** Date vere dei quattro momenti della sezione #normativa — le stesse citate nel testo
 * (regulation.item1Date ecc. in translations.ts, se una cambia va aggiornata in entrambi i
 * posti) — usate per calcolare da sole, rispetto a oggi, sia lo stato "urgenza" di ogni nodo
 * sia la posizione del marcatore "oggi" sulla timeline (vedi buildSpine/toDecimalYear più
 * sotto): un "In preparazione" diventa "In vigore" da sé quando la data passa, niente da
 * ritoccare a mano col passare del tempo. */
const REGULATION_MILESTONES: { key: 1 | 2 | 3 | 4; date: Date }[] = [
  { key: 1, date: new Date('2024-07-18') },
  { key: 2, date: new Date('2026-07-20') },
  { key: 3, date: new Date('2027-02-18') },
  // "Fino al 2029": la coda della roadmap ESPR per gli ultimi settori (vedi sectors.ts) — fine
  // 2029 come riferimento per lo status, non una data ufficiale singola.
  { key: 4, date: new Date('2029-12-31') },
];

type MilestoneStatus = 'done' | 'soon' | 'later';

/** Stato "urgenza" di un nodo timeline dalla distanza in mesi da oggi (entrambi in anni
 * decimali, vedi toDecimalYear) — condiviso tra la timeline normativa (4 nodi) e quella dei
 * settori (10 nodi, vedi sectorsSpine): stessa soglia dei 12 mesi per entrambe. */
function statusFromMonthsAway(monthsAway: number): MilestoneStatus {
  if (monthsAway <= 0) return 'done';
  return monthsAway <= 12 ? 'soon' : 'later';
}

/** "2026-09-21T..." → 2026.72 circa: anno più la frazione dell'anno trascorsa. Unità comune a
 * REGULATION_MILESTONES (Date vere) e Sector.roadmapYear (già un anno decimale in sectors.ts)
 * così buildSpine può posizionare entrambe le timeline con la stessa matematica. */
function toDecimalYear(date: Date): number {
  return date.getFullYear() + (date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / (365.25 * 24 * 3600 * 1000);
}

interface SpineNode<T> {
  item: T;
  /** Posizione orizzontale del nodo lungo la linea, 0-100 — nodi equidistanti (non
   * proporzionali alla data reale): con scarti molto diversi (mesi tra un settore e l'altro,
   * anni tra un momento normativo e l'altro) una scala proporzionale schiaccerebbe i nodi
   * vicini fino a farli sovrapporre. Solo il marcatore "oggi" resta proporzionale, interpolato
   * *localmente* tra i due nodi che lo racchiudono (vedi sotto) — stessa idea di origovero.com,
   * il riferimento visivo da cui parte questo componente. */
  percent: number;
}

/** Costruisce una timeline "a spina" (vedi .spine-timeline in home.css) da una lista già
 * ordinata cronologicamente: nodi equidistanti sulla linea, marcatore "oggi" posizionato per
 * interpolazione lineare tra i due nodi reali che racchiudono la data odierna — o, se oggi cade
 * prima del primo nodo (caso comune: la timeline mostra anche il prossimo futuro), estrapolato
 * all'indietro con la stessa pendenza del primo tratto, così il marcatore compare comunque
 * invece di sparire subito prima dell'inizio della linea. Oltre `maxExtrapolationYears` dal
 * primo nodo, o dopo l'ultimo, il marcatore semplicemente non c'è: la timeline è già "chiusa". */
function buildSpine<T>(items: T[], valueOf: (item: T) => number, todayYear: number, maxExtrapolationYears = 1): { nodes: SpineNode<T>[]; todayPercent: number | null } {
  const n = items.length;
  const nodes: SpineNode<T>[] = items.map((item, i) => ({ item, percent: n <= 1 ? 50 : (i / (n - 1)) * 100 }));
  if (n < 2) return { nodes, todayPercent: null };

  const values = items.map(valueOf);
  let todayPercent: number | null = null;

  if (todayYear < values[0]) {
    if (values[0] - todayYear <= maxExtrapolationYears) {
      const slope = (nodes[1].percent - nodes[0].percent) / (values[1] - values[0]);
      todayPercent = Math.max(0, nodes[0].percent - (values[0] - todayYear) * slope);
    }
  } else if (todayYear <= values[n - 1]) {
    for (let i = 0; i < n - 1; i++) {
      if (todayYear >= values[i] && todayYear <= values[i + 1]) {
        const frac = values[i + 1] === values[i] ? 0 : (todayYear - values[i]) / (values[i + 1] - values[i]);
        todayPercent = nodes[i].percent + frac * (nodes[i + 1].percent - nodes[i].percent);
        break;
      }
    }
  }
  // todayYear > values[n - 1]: resta null, la timeline è già conclusa.

  return { nodes, todayPercent };
}

@Component({
  selector: 'app-home',
  imports: [CommonModule, RouterLink, IconComponent, QRCodeComponent, ScrollRevealDirective, LottiePlayerComponent],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnDestroy {
  protected t = inject(I18nService).t;
  private languageService = inject(LanguageService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  protected siteOrigin = inject(SiteOriginService);
  private structuredData = inject(StructuredDataService);
  private platformId = inject(PLATFORM_ID);
  private router = inject(Router);
  /** angularx-qrcode manipola direttamente il DOM (canvas/SVG): non è compatibile col
   * rendering lato server, quindi il codice QR reale compare solo dopo l'idratazione. */
  protected isBrowser = isPlatformBrowser(this.platformId);

  /** I settori target del progetto DPP, nella lingua corrente — anche fonte delle card del
   * carosello di anteprima nella hero (un settore = una card), niente dati duplicati. */
  sectors = computed<Sector[]>(() => SECTORS.map((s) => localizeSector(s, this.languageService.lang())));

  /** Campo "Verifica un passaporto digitale" nell'hero: accetta un GTIN (8/12/13/14 cifre, cifra
   * di controllo GS1 verificata con lo stesso isValidGtin() del form admin) e porta alla pagina
   * pubblica /01/:gtin, la stessa che il resolver GS1 risolve. Nessuna chiamata di rete qui:
   * se il GTIN non ha una scheda pubblicata lo dice la pagina di destinazione. */
  protected gtinQuery = signal('');
  protected gtinError = signal(false);

  protected onGtinInput(event: Event): void {
    this.gtinQuery.set((event.target as HTMLInputElement).value);
    this.gtinError.set(false);
  }

  protected submitGtin(event: Event): void {
    event.preventDefault();
    const gtin = this.gtinQuery().replace(/\s+/g, '');
    if (!isValidGtin(gtin)) {
      this.gtinError.set(true);
      return;
    }
    void this.router.navigate(['/01', gtin]);
  }

  /** I tre settori con la data ESPR più vicina, per il banner "scadenzario" sotto i KPI —
   * stessi dati (roadmapYear/dateShort) della roadmap più in basso, nessun valore duplicato. */
  protected nextDeadlines = computed(() =>
    [...this.sectors()].sort((a, b) => a.roadmapYear - b.roadmapYear).slice(0, 3)
  );

  private static readonly STATUS_KEY: Record<MilestoneStatus, string> = { done: 'Done', soon: 'Soon', later: 'Later' };

  protected statusLabel(status: MilestoneStatus): string {
    return this.t(`regulation.status${Home.STATUS_KEY[status]}Label`);
  }

  protected statusHint(status: MilestoneStatus): string {
    return this.t(`regulation.status${Home.STATUS_KEY[status]}Hint`);
  }

  /** Oggi, in anni decimali — calcolato una sola volta per rendering invece che dentro ogni
   * computed che ne ha bisogno (regulationSpine, sectorsSpine): stessa istantanea per
   * entrambe le timeline della pagina. */
  private todayYear = computed(() => toDecimalYear(new Date()));

  /** Timeline "a spina" dei 4 momenti normativi (sezione #normativa in home.html) — vedi
   * buildSpine per la posizione dei nodi e del marcatore "oggi", statusFromMonthsAway per lo
   * stato di ciascuno. */
  protected regulationSpine = computed(() => {
    const today = this.todayYear();
    const { nodes, todayPercent } = buildSpine(REGULATION_MILESTONES, (m) => toDecimalYear(m.date), today);
    return {
      nodes: nodes.map((n) => ({ ...n, status: statusFromMonthsAway((toDecimalYear(n.item.date) - today) * 12) })),
      todayPercent,
    };
  });

  /** Stessa timeline "a spina", questa volta per i 10 settori (sezione #settori) — sostituisce
   * il precedente grafico SVG con lo stesso componente HTML/CSS già usato per la normativa,
   * solo con nodi più compatti (vedi .spine-timeline--compact in home.css). Posizionata su
   * `roadmapYear` (anno decimale, stesso significato di toDecimalYear ma già pronto in
   * sectors.ts) invece che su una Date vera. */
  protected sectorsSpine = computed(() => {
    const today = this.todayYear();
    const sorted = [...this.sectors()].sort((a, b) => a.roadmapYear - b.roadmapYear);
    const { nodes, todayPercent } = buildSpine(sorted, (s) => s.roadmapYear, today);
    return {
      nodes: nodes.map((n) => ({ ...n, status: statusFromMonthsAway((n.item.roadmapYear - today) * 12) })),
      todayPercent,
    };
  });

  protected activeIndex = signal(0);
  protected activeCard = computed(() => this.sectors()[this.activeIndex()]);
  protected autoplay = signal(true);
  protected qrValue = computed(() => `${this.siteOrigin.value}/01/${this.activeCard().exampleGtin}`);
  /** Stessa URL del QR, senza protocollo — per la barra indirizzi decorativa sopra il
   * carosello di anteprima (vedi .preview-chrome in home.css): i browser reali nascondono
   * "https://" di default, replichiamo la stessa convenzione invece di mostrarlo per intero. */
  protected previewUrlDisplay = computed(() => this.qrValue().replace(/^https?:\/\//, ''));
  /** Element string GS1 mostrato nella card — AI (01) più l'eventuale AI aggiuntivo (es. lotto). */
  protected elementString = computed(() => {
    const card = this.activeCard();
    return card.exampleExtraElement ? `(01) ${card.exampleGtin}\n${card.exampleExtraElement}` : `(01) ${card.exampleGtin}`;
  });

  private autoplayTimer?: ReturnType<typeof setInterval>;

  // Identità del sito come schema:WebSite — non presente altrove, e la home è l'unica pagina
  // dove ha senso pubblicarla una volta sola (le pagine prodotto/brand hanno già il proprio
  // schema:Product/Organization più specifico).
  websiteJsonLd = computed(() => ({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: this.t('hero.pageTitle'),
    url: this.siteOrigin.value,
  }));

  constructor() {
    // effect, non chiamata diretta nel costruttore: this.t() legge il segnale della lingua
    // corrente, quindi titolo/meta restano corretti anche se l'utente cambia lingua restando
    // sulla home, invece di restare quelli della lingua attiva al primo caricamento.
    effect(() => {
      const title = this.t('hero.pageTitle');
      const description = this.t('hero.subtitle');
      this.titleService.setTitle(title);
      this.metaService.updateTag({ name: 'description', content: description });
      setSocialMeta(this.metaService, { title, description, url: this.siteOrigin.value });
    });

    effect(() => {
      this.structuredData.apply('website-jsonld', this.websiteJsonLd());
    });

    // Il carosello avanza da solo solo lato browser: durante il prerendering (Node, nessun
    // event loop persistente da servire) un setInterval non serve e non andrebbe mai ripulito.
    if (isPlatformBrowser(this.platformId)) {
      this.autoplayTimer = setInterval(() => {
        if (this.autoplay()) this.next();
      }, AUTOPLAY_INTERVAL_MS);
    }
  }

  next(): void {
    this.activeIndex.update((i) => (i + 1) % this.sectors().length);
  }

  prev(): void {
    this.activeIndex.update((i) => (i - 1 + this.sectors().length) % this.sectors().length);
  }

  toggleAutoplay(): void {
    this.autoplay.update((v) => !v);
  }

  ngOnDestroy(): void {
    this.structuredData.remove('website-jsonld');
    if (this.autoplayTimer) clearInterval(this.autoplayTimer);
  }
}
