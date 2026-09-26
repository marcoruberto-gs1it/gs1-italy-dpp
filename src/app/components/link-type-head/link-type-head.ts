import { Component, computed, inject, input } from '@angular/core';
import { IconComponent } from '../icon/icon';
import { DppLinkTypeId, linkTypeById } from '../../data/dpp-link-types';
import { I18nService } from '../../services/i18n.service';
import { ResolverOriginService } from '../../services/resolver-origin.service';

/**
 * Intestazione di una sezione del passaporto legata a uno specifico link type del GS1 Web
 * Vocabulary: icona, titolo, descrizione, il CURIE (`gs1:sustainabilityInfo`…) e il link che
 * apre QUELLA sezione passando dal resolver (`{resolver}/01/{gtin}?linkType=gs1:xxx`) — lo
 * stesso URL che un client GS1 userebbe per chiedere solo quella risorsa.
 */
@Component({
  selector: 'app-link-type-head',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './link-type-head.html',
  styleUrl: './link-type-head.css',
})
export class LinkTypeHeadComponent {
  protected t = inject(I18nService).t;
  private resolver = inject(ResolverOriginService);

  type = input.required<DppLinkTypeId>();
  gtin = input.required<string>();

  protected def = computed(() => linkTypeById(this.type()));
  protected resolverUrl = computed(() => this.resolver.digitalLink(this.gtin(), this.def().curie));
}
