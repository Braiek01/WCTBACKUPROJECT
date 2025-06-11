import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuicksetupComponent } from './quicksetup.component';

describe('QuicksetupComponent', () => {
  let component: QuicksetupComponent;
  let fixture: ComponentFixture<QuicksetupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuicksetupComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuicksetupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
