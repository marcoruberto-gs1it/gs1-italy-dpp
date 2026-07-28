import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SECTORS, Sector, localizeSector } from '../../data/sectors';
import { UiStateService } from '../../services/ui-state.service';
import { LanguageService } from '../../services/language.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-home',
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected uiState = inject(UiStateService);
  private languageService = inject(LanguageService);
  protected t = inject(I18nService).t;

  sectors = computed<Sector[]>(() => SECTORS.map((s) => localizeSector(s, this.languageService.lang())));
}
