import { isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, PLATFORM_ID, effect, inject, input, viewChild } from '@angular/core';
import type { AnimationItem } from 'lottie-web';

/**
 * Riproduce un'animazione Lottie generata con la skill text-to-lottie (vedi
 * public/animations/) — un solo passaggio, non in loop, pensata per un flourish puntuale (es.
 * l'icona "verificato" nell'hero), non per un loader persistente. lottie-web manipola
 * direttamente il DOM (crea/anima un <svg> dentro il container): come QRCodeComponent altrove
 * in questo sito, va caricato solo lato browser, mai durante SSR/prerender.
 *
 * Il colore è fisso nel file .json (proprietà "slots.accentColor"), non sovrascrivibile a
 * runtime: lottie-web 5.13.0 non implementa ancora setSlot() nonostante il formato Lottie lo
 * preveda (verificato dal vivo — la chiamata lanciava un TypeError a runtime pur comparendo nei
 * sorgenti del pacchetto). Per un colore diverso, generare un secondo file con la skill invece
 * di riprovare l'override a runtime.
 */
@Component({
  selector: 'app-lottie-player',
  standalone: true,
  template: '<div #container [style.width.px]="size()" [style.height.px]="size()"></div>',
  styles: [':host { display: inline-flex; }'],
})
export class LottiePlayerComponent {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private anim: AnimationItem | null = null;

  path = input.required<string>();
  size = input<number>(24);

  constructor() {
    // prefers-reduced-motion: chi lo richiede vede direttamente il fotogramma finale (l'icona
    // "risolta"), non l'intera animazione di disegno — stessa filosofia delle altre animazioni
    // di questo sito (vedi i vari @media (prefers-reduced-motion: reduce) nei fogli di stile).
    effect((onCleanup) => {
      const path = this.path();
      if (!this.isBrowser) return;

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      import('lottie-web').then(({ default: lottie }) => {
        this.anim?.destroy();
        this.anim = lottie.loadAnimation({
          container: this.container().nativeElement,
          renderer: 'svg',
          loop: false,
          autoplay: !reduceMotion,
          path,
        });
        if (reduceMotion) {
          this.anim.addEventListener('DOMLoaded', () => this.anim?.goToAndStop(this.anim!.totalFrames - 1, true));
        }
      });

      onCleanup(() => this.anim?.destroy());
    });
  }
}
