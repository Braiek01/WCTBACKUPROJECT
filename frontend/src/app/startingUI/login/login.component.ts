import { Component } from '@angular/core';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { FormsModule } from '@angular/forms'; // Import FormsModule for ngModel binding
import { CommonModule } from '@angular/common'; // Import CommonModule for ngIf, ngFor, etc.
import { RouterLink } from '@angular/router'; // Import RouterLink for navigation

@Component({
  selector: 'app-login',
  imports: [
    CommonModule, // Import CommonModule for ngIf, ngFor, etc.
    InputGroupModule,
    CardModule,
    InputTextModule,
    PasswordModule,
    ButtonModule,
    DividerModule,
    InputGroupModule,
    InputGroupAddonModule,
    FormsModule, // Import FormsModule to enable ngModel binding
    RouterLink

  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  username = '';
  password = '';
  login(): void {
    console.log('Standard Sign Up clicked', {
      username: this.username,
      password: this.password,
      // Don't log password in real apps
    });
    // TODO: Implement standard signup logic (call backend API)
  }
  // --- ADDED METHOD ---
  signInWithGoogle(): void {
    console.log('Sign in with Google clicked');
    // TODO: Implement actual Google Sign-In logic here
    // This typically involves using a library like @abacritt/angularx-social-login
    // or Google Identity Services (GSI) library, configuring it with your
    // Google Cloud Client ID, and handling the authentication flow.
  }
  // --- END ADDED METHOD ---

}
