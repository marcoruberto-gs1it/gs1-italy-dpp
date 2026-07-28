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
  | 'inbox';

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
