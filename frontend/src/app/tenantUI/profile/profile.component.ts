import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

// PrimeNG Modules
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { TabViewModule } from 'primeng/tabview';
import { ToastModule } from 'primeng/toast';
import { CheckboxModule } from 'primeng/checkbox';
import { PasswordModule } from 'primeng/password';
import { InputSwitchModule } from 'primeng/inputswitch';
import { SplitButtonModule } from 'primeng/splitbutton';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    DropdownModule,
    TabViewModule,
    ToastModule,
    CheckboxModule,
    PasswordModule,
    InputSwitchModule,
    SplitButtonModule,
    ConfirmDialogModule,
    CardModule,
    DividerModule,
    TooltipModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
  // User info
  username: string = '';
  tenantName: string = '';
  
  // User profile data
  user: any = {
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    role_in_tenant: '',
    is_active: true,
    last_login: null,
    date_joined: null,
    phone: '',
    company: '',
    allow_admin_reset: true
  };
  
  // Password change data
  passwordData = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  
  // Form state tracking
  formChanged: boolean = false;
  passwordFormChanged: boolean = false;
  
  // Theme and UI preferences
  uiPreferences = {
    darkMode: true,
    compactView: false,
    enableNotifications: true,
    emailAlerts: true
  };
  
  // Split button items for user menu
  splitButtonItems = [
    {
      label: 'Profile',
      icon: 'pi pi-user',
      command: () => {
        // Already on profile page
      }
    },
    {
      label: 'Logout',
      icon: 'pi pi-sign-out',
      command: () => this.logout()
    }
  ];

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Get basic user info
    this.username = this.authService.getUsername() || '';
    this.tenantName = this.authService.getTenantName() || '';
    
    // Load user profile data
    this.loadUserProfile();
  }
  
  loadUserProfile(): void {
    this.apiService.get(`users/sub-users/${this.username}/`).subscribe({
      next: (data: any) => {
        this.user = data;
        console.log('User profile loaded:', this.user);
      },
      error: (err: any) => {
        console.error('Failed to load user profile:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load user profile'
        });
      }
    });
  }
  
  onFormChange(): void {
    this.formChanged = true;
  }
  
  onPasswordFormChange(): void {
    this.passwordFormChanged = true;
  }
  
  saveProfile(): void {
    if (!this.formChanged) return;
    
    this.apiService.put(`users/sub-users/${this.username}/`, this.user).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Profile updated successfully'
        });
        this.formChanged = false;
      },
      error: (err: any) => {
        console.error('Failed to update profile:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.detail || 'Failed to update profile'
        });
      }
    });
  }
  
  changePassword(): void {
    // Validate passwords match
    if (this.passwordData.newPassword !== this.passwordData.confirmPassword) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Passwords do not match'
      });
      return;
    }
    
    // Validate password strength (example)
    if (this.passwordData.newPassword.length < 8) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Password must be at least 8 characters long'
      });
      return;
    }
    
    const passwordChangeData = {
      current_password: this.passwordData.currentPassword,
      new_password: this.passwordData.newPassword
    };
    
    this.apiService.post(`users/sub-users/${this.username}/change-password/`, passwordChangeData).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Password changed successfully'
        });
        
        // Reset form
        this.passwordData = {
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        };
        this.passwordFormChanged = false;
      },
      error: (err: any) => {
        console.error('Failed to change password:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.detail || 'Failed to change password'
        });
      }
    });
  }
  
  savePreferences(): void {
    // This would typically save to a user preferences API
    // For this example, we'll just show a success message
    this.messageService.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Preferences saved successfully'
    });
  }
  
  requestAccountDeletion(): void {
    this.confirmationService.confirm({
      message: 'Are you sure you want to request account deletion? This action cannot be undone.',
      header: 'Confirm Account Deletion Request',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Yes, Delete My Account',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        // Here you would send the deletion request to your API
        this.messageService.add({
          severity: 'info',
          summary: 'Request Submitted',
          detail: 'Your account deletion request has been submitted and will be reviewed by an administrator.'
        });
      }
    });
  }
  
  formatDate(dateStr: string | null): string {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
  }
  
  logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/login']);
      },
      error: (err: any) => {
        console.error('Logout failed:', err);
        this.router.navigate(['/login']); // Navigate anyway
      }
    });
  }
}
