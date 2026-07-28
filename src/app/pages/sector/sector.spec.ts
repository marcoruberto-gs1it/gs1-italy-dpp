import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Sector } from './sector';

describe('Sector', () => {
  let component: Sector;
  let fixture: ComponentFixture<Sector>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sector],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Sector);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
