import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { KnowledgeGraphComponent } from './knowledge-graph';

describe('KnowledgeGraphComponent', () => {
  let component: KnowledgeGraphComponent;
  let fixture: ComponentFixture<KnowledgeGraphComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KnowledgeGraphComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(KnowledgeGraphComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
