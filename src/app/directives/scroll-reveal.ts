import { Directive, ElementRef, Input, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Fa comparire in modo animato un blocco (o i suoi figli, in sequenza) quando entra nel
 * viewport durante lo scroll. Uso:
 *
 *   <section appScrollReveal>...</section>                        — l'intero blocco
 *   <div appScrollReveal="stagger">...</div>                      — figli diretti in sequenza
 *   <div appScrollReveal="stagger" revealSelector=".card">...</div> — figli scelti da selettore
 *   <div appScrollReveal="stagger" revealGrid>...</div>           — sequenza "a onda" su griglia
 *
 * Non fa nulla lato server/prerender (guardia isPlatformBrowser) e non fa nulla se l'utente ha
 * richiesto prefers-reduced-motion: reduce — in entrambi i casi il contenuto resta semplicemente
 * visibile da subito, mai nascosto in attesa di uno script che non parte.
 */
@Directive({
  selector: '[appScrollReveal]',
  standalone: true,
})
export class ScrollRevealDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly platformId = inject(PLATFORM_ID);

  @Input('appScrollReveal') mode: '' | 'stagger' = '';
  @Input() revealSelector = ':scope > *';
  @Input() revealGrid = false;
  @Input() revealDistance = 20;
  @Input() revealDuration = 0.5;
  @Input() revealStagger = 0.08;
  /** Ritardo (s) prima che il primo elemento inizi — utile per il primo blocco sopra la piega,
   * che deve comparire al caricamento invece che aspettare uno scroll che l'utente non farà. */
  @Input() revealDelay = 0;

  private ctx?: gsap.Context;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // matchMedia non esiste in jsdom (ambiente dei test unitari) — trattarlo come assente
    // equivale a "niente animazione", stessa scelta di reduced-motion: il contenuto resta
    // comunque visibile, non c'è nulla da rompere saltando l'animazione qui.
    if (typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const host = this.el.nativeElement;
    const targets = this.mode === 'stagger' ? Array.from(host.querySelectorAll(this.revealSelector) as NodeListOf<HTMLElement>) : [host];
    if (targets.length === 0) return;

    this.ctx = gsap.context(() => {
      gsap.from(targets, {
        opacity: 0,
        y: this.revealDistance,
        duration: this.revealDuration,
        delay: this.revealDelay,
        ease: 'power2.out',
        stagger: this.revealGrid ? { each: this.revealStagger, from: 'start', grid: 'auto' } : this.revealStagger,
        scrollTrigger: {
          trigger: host,
          start: 'top 85%',
          toggleActions: 'play none none reverse',
        },
      });
    }, host);
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
  }
}
