import { Component, input } from '@angular/core';

/** Nomi delle icone disponibili — un unico set coerente riusato in tutta l'app. */
export type IconName =
  | 'droplet'
  | 'zap'
  | 'cloud'
  | 'flask'
  | 'refresh'
  | 'shield-check'
  | 'weight'
  | 'ruler'
  | 'layers'
  | 'tag'
  | 'swatch'
  | 'flame'
  | 'box'
  | 'building'
  | 'truck'
  | 'map-pin'
  | 'flag'
  | 'check-circle'
  | 'wrench'
  | 'hash'
  | 'globe'
  | 'calendar'
  | 'braces'
  | 'file-text'
  | 'send'
  | 'inbox'
  | 'alert-triangle'
  | 'chart-bar'
  | 'award'
  | 'thermometer'
  | 'leaf'
  | 'battery'
  | 'qr-code'
  | 'link'
  | 'play'
  | 'pause'
  | 'chevron-left'
  | 'chevron-right'
  | 'wheel'
  | 'sofa'
  | 'bed'
  | 'cpu'
  | 'save'
  | 'loader';

@Component({
  selector: 'app-icon',
  standalone: true,
  templateUrl: './icon.html',
  styleUrl: './icon.css',
})
export class IconComponent {
  name = input.required<IconName>();
  size = input<number>(18);
  /** Ruota continuamente l'icona (vedi .app-icon--spin in icon.css) — usata al posto di un
   * testo che spiega perché un'azione sta impiegando più del solito (vedi RegistryApiService),
   * così l'attesa resta un'icona che gira invece di un discorso da leggere. */
  spin = input<boolean>(false);
}
