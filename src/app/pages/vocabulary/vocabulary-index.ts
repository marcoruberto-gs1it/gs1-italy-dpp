import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { I18nService } from '../../services/i18n.service';
import { LanguageService } from '../../services/language.service';
import { VOCABULARY_TERMS, VocabTerm } from '../../data/vocabulary';

@Component({
  selector: 'app-vocabulary-index',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './vocabulary-index.html',
  styleUrl: './vocabulary-index.css',
})
export class VocabularyIndexComponent implements OnInit {
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private languageService = inject(LanguageService);
  protected t = inject(I18nService).t;

  protected classes: VocabTerm[] = VOCABULARY_TERMS.filter((v) => v.kind === 'Class');
  protected properties: VocabTerm[] = VOCABULARY_TERMS.filter((v) => v.kind === 'Property');

  protected label(term: VocabTerm): string {
    return this.languageService.lang() === 'en' ? term.labelEn : term.labelIt;
  }

  protected comment(term: VocabTerm): string {
    return this.languageService.lang() === 'en' ? term.commentEn : term.commentIt;
  }

  ngOnInit(): void {
    this.titleService.setTitle(this.t('voc.pageTitle'));
    this.metaService.updateTag({ name: 'description', content: this.t('voc.metaDescription') });
  }
}
