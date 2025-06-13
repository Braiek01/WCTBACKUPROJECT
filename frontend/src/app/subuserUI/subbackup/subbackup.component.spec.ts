import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubbackupComponent } from './subbackup.component';

describe('SubbackupComponent', () => {
  let component: SubbackupComponent;
  let fixture: ComponentFixture<SubbackupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubbackupComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubbackupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
