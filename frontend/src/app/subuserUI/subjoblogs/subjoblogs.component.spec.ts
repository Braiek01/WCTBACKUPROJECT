import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubjoblogsComponent } from './subjoblogs.component';

describe('SubjoblogsComponent', () => {
  let component: SubjoblogsComponent;
  let fixture: ComponentFixture<SubjoblogsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubjoblogsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubjoblogsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
