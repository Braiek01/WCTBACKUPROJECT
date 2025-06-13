import { Component, inject } from '@angular/core'; // Import inject
import { Router, RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AuthService, SignupData } from '../../core/services/auth.service'; // Adjust path, import SignupData
import { FooterComponent } from '../../../components/footer/footer.component';
import { NavbarComponent } from "../../../components/navbar/navbar.component";

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [
    CommonModule,
    InputGroupModule,
    CardModule,
    InputTextModule,
    PasswordModule,
    ButtonModule,
    DividerModule,
    InputGroupAddonModule,
    FormsModule,
    RouterLink,
    ToastModule,
    FooterComponent,
    NavbarComponent
],
  // MessageService needs to be provided, often done in app.config.ts, but can be here too
  // providers: [MessageService], // Already provided in app.config.ts
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css']
})
export class SignupComponent {
  // Inject services
  private authService = inject(AuthService);
  private router = inject(Router);
  private messageService = inject(MessageService);

  // Form fields based on SignupData and backend requirements
  tenantName = ''; // Maps to 'name' (used for schema/subdomain)
  companyName = ''; // Optional
  firstName = ''; // Optional
  lastName = ''; // Required
  email = ''; // Required
  password = ''; // Required
  confirmPassword = ''; // For frontend validation
  username = ''; // <-- Add the missing username property
  isLoading = false;

  signUp(): void {
    this.isLoading = true;
    this.messageService.clear();

    if (this.password !== this.confirmPassword) {
      this.isLoading = false;
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Passwords do not match.' });
      return;
    }

    // Basic validation for required fields
    if (!this.tenantName || !this.lastName || !this.email || !this.password) {
        this.isLoading = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Please fill in all required fields (Tenant Name, Last Name, Email, Password).' });
        return;
    }

    // Prepare data matching the SignupData interface AND TenantSignupSerializer
    const signupData: SignupData & { username: string } = { // Add username to the type temporarily
      name: this.tenantName, // Tenant/Schema name
      company_name: this.companyName || undefined,
      first_name: this.firstName || undefined,
      last_name: this.lastName,
      email: this.email,
      password: this.password,
      username: this.username // <-- ADD the username from the form
    };
    console.log('Calling authService.signup with:', signupData);

    // NOTE: Update SignupData interface if username is permanently required
    this.authService.signup(signupData as any).subscribe({
      next: (response) => {
        this.isLoading = false;
        console.log('Signup successful:', response);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: `Tenant '${response.name}' created successfully! Please log in.` });
        // Redirect to login page after a short delay
        setTimeout(() => this.router.navigate(['/login']), 2000);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Signup failed:', error);
        // Attempt to parse backend error messages
        let detail = 'Signup failed. Please check your details and try again.';
        if (error.error && typeof error.error === 'object') {
            // Flatten backend validation errors into a single string
            detail = Object.entries(error.error)
                           .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                           .join('; ');
        } else if (error.message) {
            detail = error.message;
        }
        this.messageService.add({ severity: 'error', summary: 'Signup Failed', detail: detail });
      }
    });
  }

  signInWithGoogle(): void {
    console.log('Sign in with Google clicked');
    // TODO: Implement actual Google Sign-In logic here
  }
}
