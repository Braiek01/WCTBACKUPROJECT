import { Component, OnInit, ChangeDetectorRef } from '@angular/core'; // Import ChangeDetectorRef
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common'; // Import CommonModule
import { LoaderComponent } from './startingUI/loader/loader.component'; // Import LoaderComponent

import { ButtonModule } from 'primeng/button';
import {StyleClassModule} from 'primeng/styleclass';
import { NavbarComponent } from '../components/navbar/navbar.component';
import { routeAnimation } from './animations'; // Correct the import name to match the definition

@Component({
    selector: 'app-root',
    standalone: true,
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'], // Corrected property name
    imports: [
        CommonModule, // Add CommonModule
        RouterOutlet,
        LoaderComponent, // Add LoaderComponent
        ButtonModule,
        StyleClassModule,
        NavbarComponent // Use NavbarComponent
    ],
    animations: [ routeAnimation ] // Use the correct trigger name here
})
export class AppComponent implements OnInit { // Implement OnInit
  title = 'backupfront';
  showLoader = true; // Controls if loader is in DOM
  loaderVisible = true; // Controls fade effect via Input
  // Inject ChangeDetectorRef if needed for manual detection (less preferred)
  // constructor(private cdRef: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Simulate loading time
    setTimeout(() => {
      this.loaderVisible = false; // Start fade-out animation

      // Wait for fade-out transition to finish (e.g., 500ms) before removing loader
      setTimeout(() => {
        this.showLoader = false; // Remove loader from DOM
      }, 500); // Match the transition duration in CSS

    }, 2000); // Initial loading delay
  }

  // Updated prepareRoute function to return empty string instead of null
  prepareRoute(outlet: RouterOutlet) {
    if (this.showLoader) {
      return '';
    }
    return outlet?.activatedRouteData?.['animation'] ?? '';
  }

  // Alternative: Trigger change detection manually (Use with caution)
  // getAnimationState(outlet: RouterOutlet) {
  //   const state = outlet?.activatedRouteData ? outlet.activatedRouteData['animation'] : '';
  //   Promise.resolve().then(() => this.cdRef.detectChanges()); // Schedule detection
  //   return state;
  // }
  // In template: [@routeAnimations]="getAnimationState(outlet)"
}
