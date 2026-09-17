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
  | 'cpu';

@Component({
  selector: 'app-icon',
  standalone: true,
  templateUrl: './icon.html',
  styleUrl: './icon.css',
})
export class IconComponent {
  name = input.required<IconName>();
  size = input<number>(18);
}
