import { Component, inject, signal } from '@angular/core'; // Import inject and signal
import { Router, RouterLink } from '@angular/router'; // Import Router
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
// --- Import singular MessageModule ---
import { MessageModule } from 'primeng/message';
// Remove MessagesModule import if not used elsewhere
// Remove Message interface import if not used elsewhere
import { AuthService } from '../../core/services/auth.service'; // Adjust path as needed
import { FooterComponent } from '../../../components/footer/footer.component';
import { LoaderComponent } from "../loader/loader.component";
import { NavbarComponent } from "../../../components/navbar/navbar.component";
import { RoleRedirectService } from '../../core/services/role-redirect.service';
import { MessageService } from 'primeng/api'; // Import MessageService
import { ToastModule } from 'primeng/toast';

// Define Severity type manually
type Severity = 'success' | 'info' | 'warn' | 'error';

@Component({
  selector: 'app-login',
  standalone: true, // Ensure standalone is true if using standalone components
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
    MessageModule, // Use singular MessageModule
    FooterComponent,
    NavbarComponent,
    ToastModule,
],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  // Inject services
  private authService = inject(AuthService);
  private router = inject(Router);
  private roleRedirectService = inject(RoleRedirectService);
  private messageService = inject(MessageService); // Inject MessageService

  // Form fields
  username = '';
  password = '';

  // State management for a single message
  loading = signal(false);
  // Signals to hold properties for a single <p-message>
  messageSeverity = signal<Severity | undefined>(undefined); // e.g., 'error', 'success', 'info', 'warn'
  messageSummary = signal<string | undefined>(undefined);
  messageDetail = signal<string | undefined>(undefined);

  login(): void {
    this.loading.set(true);
    // Clear previous message state
    this.messageSeverity.set(undefined);
    this.messageSummary.set(undefined);
    this.messageDetail.set(undefined);

    this.authService.login({ email: this.username, password: this.password }).subscribe({
      next: (response) => {
        this.loading.set(false);
        
        // Show success toast
        this.messageService.add({
          severity: 'success',
          summary: 'Login Successful',
          detail: `Welcome back, ${response.user?.username || this.username}!`
        });
        
        // Use the role redirect service
        this.roleRedirectService.redirectBasedOnRole();
      },
      error: (error) => {
        this.loading.set(false);
        const detail = error?.message || 'Invalid credentials or server error.';
        this.messageSeverity.set('error');
        this.messageSummary.set('Login Failed');
        this.messageDetail.set(detail);
        console.error('Login error:', error);
      },
    });
  }

  signInWithGoogle(): void {
    console.log('Sign in with Google clicked');
    // TODO: Implement actual Google Sign-In logic here
  }
}
