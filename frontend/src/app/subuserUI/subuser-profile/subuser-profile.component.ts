import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

// PrimeNG imports
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TabViewModule } from 'primeng/tabview';
import { DropdownModule } from 'primeng/dropdown';
import { CheckboxModule } from 'primeng/checkbox';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { SplitButtonModule } from 'primeng/splitbutton';
import { DividerModule } from 'primeng/divider';

@Component({
  selector: 'app-subuser-profile',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    TabViewModule,
    DropdownModule,
    CheckboxModule,
    CardModule,
    ToastModule,
    ConfirmDialogModule,
    ProgressBarModule,
    SplitButtonModule,
    DividerModule
  ],
  templateUrl: './subuser-profile.component.html',
  styleUrls: ['./subuser-profile.component.css'],
  providers: [MessageService, ConfirmationService]
})
export class SubuserProfileComponent implements OnInit {
  // User and tenant info
  username: string = '';
  tenantName: string = '';
  
  // Split button items for user menu
  splitButtonItems = [
    {
      label: 'Profile',
      icon: 'pi pi-user',
      command: () => {
        this.router.navigate(['/', this.tenantName, 'subuser-profile']);
      }
    },
    {
      label: 'Logout',
      icon: 'pi pi-sign-out',
      command: () => this.logout()
    }
  ];

  // Profile data
  profileData: any = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    username: '',
    role: '',
    lastLogin: 'N/A',
    accountCreated: 'N/A'
  };

  // Password data
  passwordData: any = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  showCurrentPassword: boolean = false;
  showNewPassword: boolean = false;
  showConfirmPassword: boolean = false;
  passwordStrength: number = 0;

  // Preferences
  preferences: any = {
    emailNotifications: true,
    dashboardWidgets: true,
    timezone: null,
    dateFormat: null
  };

  // Dropdown options
  timezones = [
    { name: 'UTC', code: 'UTC' },
    { name: 'America/New_York', code: 'America/New_York' },
    { name: 'Europe/London', code: 'Europe/London' },
    { name: 'Asia/Tokyo', code: 'Asia/Tokyo' },
    { name: 'Australia/Sydney', code: 'Australia/Sydney' }
  ];

  dateFormats = [
    { name: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
    { name: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
    { name: 'YYYY-MM-DD', value: 'YYYY-MM-DD' }
  ];

  // UI state
  saving: boolean = false;

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.tenantName = this.authService.getTenantName() || '';
    this.username = this.authService.getUsername() || '';
    this.loadProfileData();
    this.loadPreferences();
  }

  loadProfileData(): void {
    // In a real app, you would fetch this from an API
    this.apiService.get('users/profile').subscribe({
      next: (data: any) => {
        this.profileData = {
          firstName: data.first_name || '',
          lastName: data.last_name || '',
          email: data.email || '',
          phone: data.phone || '',
          company: data.company || '',
          username: data.username || this.username,
          role: data.role || 'SubUser',
          lastLogin: data.last_login ? new Date(data.last_login).toLocaleString() : 'N/A',
          accountCreated: data.created_at ? new Date(data.created_at).toLocaleString() : 'N/A'
        };
      },
      error: (err) => {
        console.error('Failed to load profile data:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load profile data'
        });
        
        // Fill with dummy data for demo purposes
        this.profileData = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '',
          company: '',
          username: this.username,
          role: 'SubUser',
          lastLogin: 'N/A',
          accountCreated: 'N/A'
        };
      }
    });
  }

  loadPreferences(): void {
    // In a real app, you would fetch this from an API
    this.apiService.get('users/preferences').subscribe({
      next: (data: any) => {
        this.preferences = {
          emailNotifications: data.email_notifications !== undefined ? data.email_notifications : true,
          dashboardWidgets: data.dashboard_widgets !== undefined ? data.dashboard_widgets : true,
          timezone: this.timezones.find(tz => tz.code === data.timezone) || null,
          dateFormat: data.date_format || null
        };
      },
      error: (err) => {
        console.error('Failed to load preferences:', err);
        
        // Set defaults for demo purposes
        this.preferences = {
          emailNotifications: true,
          dashboardWidgets: true,
          timezone: this.timezones[0],
          dateFormat: this.dateFormats[0].value
        };
      }
    });
  }

  saveProfile(): void {
    this.saving = true;
    
    const profileData = {
      first_name: this.profileData.firstName,
      last_name: this.profileData.lastName,
      email: this.profileData.email,
      phone: this.profileData.phone,
      company: this.profileData.company
    };
    
    // In a real app, you would send this to an API
    setTimeout(() => {
      this.saving = false;
      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Profile updated successfully'
      });
    }, 1000);
  }

  updatePassword(): void {
    if (!this.canUpdatePassword()) {
      return;
    }
    
    this.confirmationService.confirm({
      message: 'Are you sure you want to change your password?',
      accept: () => {
        // In a real app, you would send this to an API
        setTimeout(() => {
          this.passwordData = {
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
          };
          
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Password updated successfully'
          });
        }, 1000);
      }
    });
  }

  savePreferences(): void {
    const preferencesData = {
      email_notifications: this.preferences.emailNotifications,
      dashboard_widgets: this.preferences.dashboardWidgets,
      timezone: this.preferences.timezone?.code || null,
      date_format: this.preferences.dateFormat
    };
    
    // In a real app, you would send this to an API
    setTimeout(() => {
      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Preferences saved successfully'
      });
    }, 1000);
  }

  canUpdatePassword(): boolean {
    return (
      !!this.passwordData.currentPassword &&
      !!this.passwordData.newPassword &&
      this.passwordData.newPassword === this.passwordData.confirmPassword &&
      this.passwordData.newPassword.length >= 8
    );
  }

  getPasswordStrength(): number {
    if (!this.passwordData.newPassword) {
      return 0;
    }
    
    const password = this.passwordData.newPassword;
    let strength = 0;
    
    // Length check
    if (password.length >= 8) strength += 20;
    if (password.length >= 12) strength += 10;
    
    // Character type checks
    if (/[a-z]/.test(password)) strength += 10;
    if (/[A-Z]/.test(password)) strength += 20;
    if (/[0-9]/.test(password)) strength += 20;
    if (/[^a-zA-Z0-9]/.test(password)) strength += 20;
    
    return Math.min(strength, 100);
  }

  getPasswordStrengthClass(): string {
    const strength = this.getPasswordStrength();
    this.passwordStrength = strength;
    
    if (strength < 30) return 'danger-progress';
    if (strength < 60) return 'warning-progress';
    return 'success-progress';
  }

  getPasswordStrengthText(): string {
    const strength = this.getPasswordStrength();
    
    if (strength < 30) return 'Weak password';
    if (strength < 60) return 'Moderate password';
    if (strength < 80) return 'Strong password';
    return 'Very strong password';
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/login']);
      },
      error: (err) => {
        console.error('Logout failed:', err);
        this.router.navigate(['/login']); // Navigate anyway
      }
    });
  }
}