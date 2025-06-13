import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';

// PrimeNG imports
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { DialogModule } from 'primeng/dialog';
import { ToolbarModule } from 'primeng/toolbar';
import { CheckboxModule } from 'primeng/checkbox';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { SplitButtonModule } from 'primeng/splitbutton';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

// Services
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    HttpClientModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    DropdownModule,
    DialogModule,
    ToolbarModule,
    CheckboxModule,
    PasswordModule,
    ToastModule,
    SplitButtonModule,
    TagModule,
    TooltipModule,
    ConfirmDialogModule
  ],
  providers: [
    ConfirmationService,  // Add this provider
    MessageService        // Add this if not already provided
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.css'
})
export class UsersComponent implements OnInit {
  // Add properties to match the template
  users: any[] = [];
  selectedUsers: any[] = [];
  newUser: any = {
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    accountName: '',
    role: 'user',
    selectedRole: null,  // Add this property
    selectedPolicy: null,
    allowAdminReset: false,
    requireChangeOnLogin: false
  };
  
  username: string = '';
  tenantName: string = '';
  addUserDialogVisible: boolean = false;
  selectedRowsPerPage: number = 10;
  rowsPerPageOptions = [
    { label: '10', value: 10 },
    { label: '25', value: 25 },
    { label: '50', value: 50 },
    { label: '100', value: 100 }
  ];
  filterValue: string = '';
  
  roleOptions = [
    { name: 'Administrator', code: 'admin' },
    { name: 'Operator', code: 'operator' },

  ];
  
  policyOptions = [
    { name: 'Default Policy', code: 'default' },
    { name: 'Strict Policy', code: 'strict' }
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

  constructor(
    private router: Router,
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    private authService: AuthService,
    private apiService: ApiService
  ) {}

  ngOnInit() {
    this.username = this.authService.getCurrentUser()?.username || 'User';
    this.tenantName = this.authService.getTenantName() || '';
    this.loadUsers();
  }

  loadUsers() {
    this.apiService.get('users/sub-users/').subscribe({
      next: (data: any) => {
        // Process users to ensure consistent properties
        this.users = data.map((user: any) => {
          return {
            ...user,
            // If name display logic needs adjustment
            name: user.first_name && user.last_name 
              ? `${user.first_name} ${user.last_name}`
              : user.username
          };
        });
        console.log('Loaded users:', this.users);
      },
      error: (error) => {
        console.error('Error loading users:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load users'
        });
      }
    });
  }

  showAddUserDialog() {
    this.addUserDialogVisible = true;
  }

  hideAddUserDialog() {
    this.addUserDialogVisible = false;
    this.resetNewUser();
  }

  resetNewUser() {
    this.newUser = {
      username: '',
      password: '',
      confirmPassword: '',
      email: '',
      accountName: '',
      role: 'user',
      selectedRole: null,
      selectedPolicy: null,
      allowAdminReset: false,
      requireChangeOnLogin: false
    };
  }

  addUser() {
    // Basic validation
    if (!this.newUser.username || !this.newUser.password) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Username and password are required'
      });
      return;
    }

    if (this.newUser.password !== this.newUser.confirmPassword) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Passwords do not match'
      });
      return;
    }

    // Map the role properly - ensure admin is assigned correctly
    let tenantRole = 'operator'; // default
    if (this.newUser.selectedRole === 'admin') {
      tenantRole = 'admin';
    } 

    // Prepare data for API
    const userData = {
      username: this.newUser.username,
      password: this.newUser.password,
      email: this.newUser.email,
      first_name: this.newUser.accountName,
      tenant_role: tenantRole, // Use the mapped role
      require_password_change: this.newUser.requireChangeOnLogin,
      allow_admin_reset: this.newUser.allowAdminReset,
      policy_id: this.newUser.selectedPolicy
    };

    console.log('Creating user with data:', userData);

    // Make API call
    this.apiService.post('users/create/', userData).subscribe({
      next: (response) => {
        this.messageService.add({
          severity: 'success',
          summary: 'User Created',
          detail: `User ${this.newUser.username} was created successfully`
        });
        
        // Close dialog and refresh list
        this.addUserDialogVisible = false;
        this.resetNewUser();
        this.loadUsers();
      },
      error: (err) => {
        console.error('Failed to create user:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.detail || err.message || 'Failed to create user'
        });
      }
    });
  }

  confirmDeleteUser(user: any) {
    this.confirmationService.confirm({
      message: `Are you sure you want to delete the user "${user.name}"?`,
      accept: () => {
        this.deleteUser(user);
      }
    });
  }

  deleteUser(user: any) {
    this.apiService.delete(`users/sub-users/${user.id}/`).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success', 
          summary: 'User Deleted', 
          detail: `User ${user.name} was deleted successfully`
        });
        this.loadUsers();
      },
      error: (err) => {
        console.error('Failed to delete user:', err);
        this.messageService.add({
          severity: 'error', 
          summary: 'Error', 
          detail: `Failed to delete user: ${err.error?.detail || err.message || 'Unknown error'}`
        });
      }
    });
  }

  applyFilter(table: any, event: any) {
    table.filterGlobal(event.target.value, 'contains');
  }

  addUserGroup() {
    // Implementation placeholder
  }

  sendBulletin() {
    // Implementation placeholder
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
        }, 500);
      },
      error: (err) => {
        console.error('Error during logout:', err);
        this.router.navigate(['/login']);
      }
    });
  }

  getRoleDisplayName(role: string): string {
    switch(role) {
      case 'tenant_owner': return 'Owner';
      case 'tenant_admin': return 'Admin';
      case 'tenant_member': return 'Operator';
      default: return role || 'Unknown';
    }
  }
}
