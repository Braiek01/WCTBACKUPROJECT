import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

// PrimeNG Imports
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
import { ConfirmationService, MessageService } from 'primeng/api';

@Component({
  selector: 'app-user-details',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    HttpClientModule,
    ButtonModule,
    InputTextModule,
    DropdownModule,
    TabViewModule,
    ToastModule,
    CheckboxModule,
    PasswordModule,
    InputSwitchModule,
    SplitButtonModule,
    ConfirmDialogModule
  ],
  providers: [
    MessageService,
    ConfirmationService
  ],
  templateUrl: './user-details.component.html',
  styleUrl: './user-details.component.css'
})
export class UserDetailsComponent implements OnInit {
  // Current user properties
  username: string = '';
  tenantName: string = '';

  // User being edited
  user: any = {};
  userId: string = '';
  originalUser: any = {};
  formChanged: boolean = false;

  // Password form data
  passwordData = {
    newPassword: '',
    confirmPassword: ''
  };

  // UI Controls
  roleOptions = [
    { name: 'Administrator', code: 'admin' },
    { name: 'Operator', code: 'operator' },
  ];

  splitButtonItems = [
    {
      label: 'Profile',
      icon: 'pi pi-user',
      command: () => {
        this.router.navigate(['/', this.tenantName, 'profile']);
      }
    },
    {
      label: 'Logout',
      icon: 'pi pi-sign-out',
      command: () => this.logout()
    }
  ];

  // Add selected role property
  selectedRole: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private apiService: ApiService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    // Get authenticated user info
    this.username = this.authService.getCurrentUser()?.username || 'User';
    this.tenantName = this.authService.getTenantName() || '';

    // Get user ID from route params - FIX THE PARAMETER NAME
    this.route.paramMap.subscribe(params => {
      this.userId = params.get('username') || ''; // Changed from 'id' to 'userId'
      console.log('Got userId from route:', this.username);
      if (this.userId) {
        this.loadUserDetails();
      }
    });
  }

  loadUserDetails(): void {
    console.log(`Attempting to load user details for: ${this.userId}`);
    
    this.apiService.get(`users/sub-users/${this.userId}/`).subscribe({
      next: (data) => {
        console.log('User data loaded successfully:', data);
        this.user = data as any;
        this.originalUser = Object.assign({}, data);
        
        // Set selected role based on user data
        const userData = data as { role_in_tenant?: string };
        this.selectedRole = this.roleOptions.find(r => r.code === userData.role_in_tenant) || null;
        
        this.formChanged = false;
      },
      error: (err) => {
        console.error('Error loading user details:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to load user details: ${err.status}`
        });
      }
    });
  }

  // Helper to check if string is UUID format
  isUUID(str: string): boolean {
    const uuidPattern = 
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(str);
  }

  // Extract username from the current route if present
  extractUsernameFromRoute(): string {
    // Try to get 'username' param from the route, fallback to empty string
    return this.route.snapshot.paramMap.get('username') || '';
  }

  // Update the browser URL without navigating (cosmetic only)
  updateUrlWithUsername(): void {
    const url = this.router.url.replace(this.userId, this.user.username);
    window.history.replaceState({}, '', url);
  }

  onFormChange(): void {
    console.log('Form changed. Comparing current state with original state.');
    const currentJSON = JSON.stringify(this.user);
    const originalJSON = JSON.stringify(this.originalUser);
    this.formChanged = currentJSON !== originalJSON;
    console.log('Form changed?', this.formChanged);
  }

  onPasswordFormChange(): void {
    // Any password change means the form has changed
    this.formChanged = !!this.passwordData.newPassword;
  }

  // Update the user model when dropdown changes
  updateRole(): void {
    console.log('Role dropdown changed. Selected role:', this.selectedRole);
    if (this.selectedRole) {
      console.log('Setting user.role_in_tenant from', this.user.role_in_tenant, 'to', this.selectedRole.code);
      this.user.role_in_tenant = this.selectedRole.code;
      console.log('After update, user.role_in_tenant =', this.user.role_in_tenant);
      this.onFormChange();
    }
  }

  saveChanges(): void {
    // Make sure role is set from selectedRole before sending
    if (this.selectedRole) {
      this.user.role_in_tenant = this.selectedRole.code;
    }
    
    const updateData = {
      email: this.user.email,
      first_name: this.user.first_name,
      last_name: this.user.last_name || '',
      is_active: this.user.is_active,
      role_in_tenant: this.user.role_in_tenant
    };
    
    console.log('Sending update with payload:', updateData);
    
    // Use PATCH instead of PUT
    this.apiService.patch(`users/sub-users/${this.userId}/`, updateData).subscribe({
      next: (response: any) => {
        console.log('User updated successfully:', response);
        
        // Update original state to match current
        this.originalUser = { ...this.user };
        this.formChanged = false;
        
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'User details updated successfully'
        });
      },
      error: (err) => {
        console.error('Error updating user:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.detail || err.message || 'Failed to update user'
        });
      }
    });
  }

  resetPassword(): void {
    if (this.passwordData.newPassword !== this.passwordData.confirmPassword) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Passwords do not match'
      });
      return;
    }

    this.confirmationService.confirm({
      message: 'Are you sure you want to reset this user\'s password?',
      accept: () => {
        const passwordData = {
          password: this.passwordData.newPassword
        };

        // Use PATCH method with the correct endpoint
        this.apiService.patch(`users/sub-users/${this.userId}/reset-password/`, passwordData).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Password has been reset successfully'
            });
            
            // Reset password form
            this.passwordData = {
              newPassword: '',
              confirmPassword: ''
            };
            this.formChanged = false;
          },
          error: (err) => {
            console.error('Error resetting password:', err);
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: err.error?.detail || err.message || 'Failed to reset password'
            });
          }
        });
      }
    });
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Logged Out',
          detail: 'You have been successfully logged out'
        });
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 1000); // Give time for the toast to be visible
      },
      error: (err) => {
        console.error('Error during logout:', err);
        this.router.navigate(['/login']);
      }
    });
  }
}
