import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubrestoreComponent } from './subrestore.component';

describe('SubrestoreComponent', () => {
  let component: SubrestoreComponent;
  let fixture: ComponentFixture<SubrestoreComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubrestoreComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubrestoreComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
