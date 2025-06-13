import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubuserProfileComponent } from './subuser-profile.component';

describe('SubuserProfileComponent', () => {
  let component: SubuserProfileComponent;
  let fixture: ComponentFixture<SubuserProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubuserProfileComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubuserProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
