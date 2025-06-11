import { Component, AfterViewInit, ElementRef, QueryList, ViewChildren, OnDestroy, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core'; // Added Inject, PLATFORM_ID
import { isPlatformBrowser } from '@angular/common'; // Added isPlatformBrowser
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { DashboardComponent } from "../../tenantUI/dashboard/dashboard.component";
import { FooterComponent } from '../../../components/footer/footer.component';
import { NavbarComponent } from "../../../components/navbar/navbar.component";
// Add other necessary imports for PrimeNG modules used in the template

@Component({
  selector: 'app-landingpage',
  standalone: true,
  imports: [
    ButtonModule,
    RippleModule,
    FooterComponent,
    NavbarComponent
],
  templateUrl: './landingpage.component.html',
  styleUrls: ['./landingpage.component.css']
})
export class LandingpageComponent implements AfterViewInit, OnDestroy {

  @ViewChildren('section') sections!: QueryList<ElementRef>;
  private observer?: IntersectionObserver;

  constructor(
    private router: Router,
    private cdRef: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object // Inject PLATFORM_ID
  ) {}

  ngAfterViewInit(): void {
    // Only run observer logic in the browser
    if (isPlatformBrowser(this.platformId)) {
      this.initObserver();
      this.cdRef.detectChanges(); // Ensure sections are available
      this.observeSections();
    }
  }

  ngOnDestroy(): void {
    // Only disconnect if the observer was created (i.e., in the browser)
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  private initObserver(): void {
    // This method will now only be called in the browser context
    const options = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };

    this.observer = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, options);
  }

  private observeSections(): void {
     // This method will now only be called in the browser context
    if (this.observer && this.sections) {
      this.sections.forEach(section => {
        this.observer?.observe(section.nativeElement);
      });
    } else {
        console.warn("Intersection Observer or sections not ready yet (browser check passed).");
    }
  }

  navigateToSignup(): void {
    this.router.navigate(['/signup']);
  }
}
