import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JoblogsComponent } from './joblogs.component';

describe('JoblogsComponent', () => {
  let component: JoblogsComponent;
  let fixture: ComponentFixture<JoblogsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JoblogsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JoblogsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
