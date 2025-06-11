import { Component, OnInit, inject } from '@angular/core'; // Import inject
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { ToolbarModule } from 'primeng/toolbar';
import { CheckboxModule } from 'primeng/checkbox';
import { SplitButtonModule } from 'primeng/splitbutton';
import { DialogModule } from 'primeng/dialog';
import { PasswordModule } from 'primeng/password';
import { MenuItem } from 'primeng/api';

import { UserService, TenantUser, CreateTenantUserData } from '../../core/services/user.service'; // Adjust path
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule, FormsModule, TableModule, ButtonModule, InputTextModule,
    DropdownModule, ToolbarModule, CheckboxModule, SplitButtonModule,
    DialogModule, PasswordModule, RouterModule
  ],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.css']
})
export class UsersComponent implements OnInit {
  private userService = inject(UserService); // Inject UserService
  private authService = inject(AuthService); // Inject AuthService if needed for checks

  users: TenantUser[] = [];
  selectedUsers: TenantUser[] = [];
  loading = false;
  errorMessage: string | null = null;

  // ... other existing properties (rowsPerPageOptions, filterValue, etc.) ...
  rowsPerPageOptions = [ { label: '10', value: 10 }, { label: '25', value: 25 }, { label: '50', value: 50 }, { label: '100', value: 100 } ];
  selectedRowsPerPage = 50;
  filterValue: string = '';
  bulkActionItems: MenuItem[] = [
    { label: 'Delete', icon: 'pi pi-trash', command: () => this.deleteSelectedUsers() },
    { label: 'Disable', icon: 'pi pi-ban', command: () => this.disableSelectedUsers() }
  ];
  exportItems: MenuItem[] = [
    { label: 'Export CSV', icon: 'pi pi-file', command: () => this.exportData('csv') },
    { label: 'Export Excel', icon: 'pi pi-file-excel', command: () => this.exportData('excel') }
  ];
  viewItems: MenuItem[] = [
    { label: 'Customize Columns', icon: 'pi pi-table', command: () => this.customizeView() }
  ];

  // --- Add User Dialog Properties ---
  addUserDialogVisible = false;
  // --- Update the type definition for newUser to include all form fields ---
  newUser: CreateTenantUserData & {
    confirmPassword?: string;
    accountName?: string;
    selectedPolicy?: string | null; // Add this
    selectedProvisioningMode?: string | null; // Add this
    selectedTemplate?: string | null; // Add this
    allowAdminReset?: boolean; // Add this
    requireChangeOnLogin?: boolean; // Add this
  } = {
    // Initialize with defaults matching CreateTenantUserData and the new fields
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    role_in_tenant: 'operator',
    accountName: '',
    selectedPolicy: null, // Default value
    selectedProvisioningMode: 'auto', // Default value based on dropdown options
    selectedTemplate: 'default', // Default value based on dropdown options
    allowAdminReset: true, // Default value
    requireChangeOnLogin: false, // Default value
  };

  // Options for dropdowns in the dialog
  policyOptions = [
    { name: '(none)', code: null }, // Use null for 'none'
    { name: 'Default User Policy', code: 'default_user' },
    { name: 'Admin Policy', code: 'admin' }
  ];
  provisioningModeOptions = [
    { name: 'Provision Storage Vaults automatically, when new devices are registered to this user (recommended)', code: 'auto' },
    { name: 'Do not provision Storage Vaults automatically', code: 'manual' },
  ];
  templateOptions = [
    { name: 'System Default [Currently: None]', code: 'default' },
    { name: 'Azure Blob Template', code: 'azure_blob' },
    // Add other templates if available
  ];
  // --- End Add User Dialog Properties ---

  tenantDomain: string = '';
  tenantName: string = ''; // Add tenantName property

  ngOnInit(): void {
    // Optional: Check if tenant context is available before loading
    if (!this.authService.getCurrentTenantDomain()) {
        this.errorMessage = "Tenant context not found. Please log in again.";
        this.loading = false;
        // Optionally redirect to login
        // this.authService.logout();
        return;
    }
    this.loadUsers();

    // Get tenant domain and name from the auth service
    this.tenantDomain = this.authService.getTenantDomain() || '';
    this.tenantName = this.authService.getTenantName() || ''; // Get tenant name
    console.log('Tenant domain in users list:', this.tenantDomain);
    console.log('Tenant name:', this.tenantName); // Log tenant name
  }

  loadUsers(): void {
    this.loading = true;
    this.errorMessage = null;
    this.userService.getUsers().subscribe({
      next: (data) => {
        // Map backend data if needed, e.g., user.email to user.emailAddress
        this.users = data.map(user => ({
            ...user,
            name: user.username || user.email, // Use username or email as display name
            accountName: user.accountName || '', // Provide default if missing
            tenant: this.authService.getCurrentTenantDomain()?.split('.')[0] || 'N/A', // Example: Extract tenant name
            onlineDevices: user.onlineDevices ?? 0, // Provide default
            devices: user.devices ?? 0, // Provide default
            emailAddress: user.email, // Map email
            emailReports: user.emailReports ?? 'N/A', // Provide default
            protectedItemsQuota: user.protectedItemsQuota ?? 'N/A', // Provide default
            storageVaultSize: user.storageVaultSize ?? 'N/A', // Provide default
            storageVaultQuota: user.storageVaultQuota ?? 'N/A', // Provide default
            policy: user.policy ?? '(none)' // Provide default
        }));
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load users', err);
        this.errorMessage = 'Could not load users. Please try again later.';
        if (err.status === 401) { // Example: Handle unauthorized
            this.errorMessage = 'Your session may have expired. Please log in again.';
            // Consider redirecting to login: this.authService.logout();
        }
        this.loading = false;
      }
    });
  }

  // --- Add User Dialog Methods ---
  showAddUserDialog() {
    this.newUser = {
        username: '',
        password: '',
        confirmPassword: '', // If you have this
        email: '',
        accountName: '', // If you have this
        // *** Ensure role_in_tenant is initialized, likely to 'operator' ***
        role_in_tenant: 'operator',
        // Initialize other form fields
        selectedPolicy: null, // Example
        selectedProvisioningMode: null, // Example
        selectedTemplate: null, // Example
        allowAdminReset: false, // Example
        requireChangeOnLogin: false // Example
    };
    this.addUserDialogVisible = true;
    this.errorMessage = null; // Clear previous errors
  }

  hideAddUserDialog() {
    this.addUserDialogVisible = false;
  }

  addUser() {
    if (this.newUser.password !== this.newUser.confirmPassword) {
      this.errorMessage = "Passwords do not match!";
      return;
    }
    if (!this.newUser.username) {
         this.errorMessage = "Username is required.";
         return;
    }
     if (!this.newUser.password) {
         this.errorMessage = "Password is required.";
         return;
    }

    // ADD Password Length Check (keep this)
    if (this.newUser.password.length < 8) {
        this.errorMessage = "Password must be at least 8 characters long.";
        this.loading = false; // Stop loading
        return;
    }

    this.loading = true; // Indicate loading state

    const userData: CreateTenantUserData = {
        username: this.newUser.username,
        password: this.newUser.password,
        email: this.newUser.email || undefined,
        role_in_tenant: this.newUser.role_in_tenant,
        // Ensure no extra fields are being sent unless the backend expects them
    };

    // *** Log the exact data being sent to the backend ***
    console.log('UsersComponent: Sending userData to backend:', userData);

    this.userService.createUser(userData).subscribe({
      next: (createdUser) => {
        console.log('UsersComponent: Successfully created user (API response):', createdUser);
        // ... mapping logic ...
        const mappedUser = {
            ...createdUser,
            name: createdUser.username || createdUser.email,
            accountName: this.newUser.accountName || '', // Use form value if backend doesn't return it
            tenant: this.authService.getCurrentTenantDomain()?.split('.')[0] || 'N/A',
            onlineDevices: 0, // Default for new user
            devices: 0, // Default for new user
            emailAddress: createdUser.email,
            emailReports: 'N/A', // Default
            protectedItemsQuota: 'N/A', // Default
            storageVaultSize: 'N/A', // Default
            storageVaultQuota: 'N/A', // Default
            policy: this.newUser.selectedPolicy || '(none)' // Use form value
        };
        this.users = [...this.users, mappedUser]; // Add mapped user to list locally
        this.loading = false;
        this.hideAddUserDialog();
        console.log('UsersComponent: User added to local list and dialog hidden.');
      },
      error: (err) => {
         console.error('UsersComponent: Failed to add user (API error object):', err); // Log the whole error object
         // *** Log the detailed validation errors from the backend response body ***
         console.error('UsersComponent: Backend validation errors:', err.error);
         this.errorMessage = 'Failed to add user. Please check the details.';
         // Optionally format the backend errors for display
         if (err.error && typeof err.error === 'object') {
             this.errorMessage = Object.entries(err.error)
                                      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                                      .join('; ');
         } else if (err.message) {
             this.errorMessage = err.message;
         }
         this.loading = false;
      }
    });
  }
  // --- End Add User Dialog Methods ---

  // --- Placeholder methods ---
  addUserGroup(): void {
    console.log('Add User Group clicked');
    // TODO: Implement logic
  }

  sendBulletin(): void {
    console.log('Send Client Bulletin clicked');
    // TODO: Implement logic
  }

  deleteSelectedUsers(): void {
    console.log('Deleting selected users:', this.selectedUsers);
    // TODO: Implement bulk delete logic using confirmation service and userService.deleteUser
  }

  disableSelectedUsers(): void {
    console.log('Disabling selected users:', this.selectedUsers);
    // TODO: Implement bulk disable logic (likely involves userService.updateUser)
  }

  exportData(format: string): void {
    console.log(`Exporting data as ${format}`);
    // TODO: Implement export logic (e.g., using a library like xlsx or papaparse)
  }

  customizeView(): void {
    console.log('Customize View clicked');
    // TODO: Implement column customization logic (e.g., using a dialog with checkboxes)
  }

  // Method to apply filter globally on the table
  applyFilter(table: any, event: Event) {
    const inputElement = event.target as HTMLInputElement;
    table.filterGlobal(inputElement.value, 'contains');
  }
}
