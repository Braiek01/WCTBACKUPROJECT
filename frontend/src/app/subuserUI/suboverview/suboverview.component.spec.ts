import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SuboverviewComponent } from './suboverview.component';

describe('SuboverviewComponent', () => {
  let component: SuboverviewComponent;
  let fixture: ComponentFixture<SuboverviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SuboverviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SuboverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
