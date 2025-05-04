import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// PrimeNG Modules
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { ToolbarModule } from 'primeng/toolbar';
import { CheckboxModule } from 'primeng/checkbox';
import { SplitButtonModule } from 'primeng/splitbutton';
import { DialogModule } from 'primeng/dialog'; // Add DialogModule
import { PasswordModule } from 'primeng/password'; // Add PasswordModule
import { MenuItem } from 'primeng/api';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-users',
  standalone: true, // Make sure it's standalone
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    DropdownModule,
    ToolbarModule,
    CheckboxModule,
    SplitButtonModule,
    DialogModule, // Add DialogModule
    PasswordModule,  // Add PasswordModule
    RouterModule
  ],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.css'] // Corrected property name
})
export class UsersComponent implements OnInit {

  users: any[] = []; // To hold user data
  selectedUsers: any[] = []; // To hold selected rows

  // Options for "Show X entries" dropdown
  rowsPerPageOptions = [
    { label: '10', value: 10 },
    { label: '25', value: 25 },
    { label: '50', value: 50 },
    { label: '100', value: 100 }
  ];
  selectedRowsPerPage = 50; // Default value

  filterValue: string = ''; // For the filter input

  // Options for SplitButtons (example)
  bulkActionItems: MenuItem[] = [
    { label: 'Delete Selected', icon: 'pi pi-trash', command: () => this.deleteSelectedUsers() },
    { label: 'Disable Selected', icon: 'pi pi-ban', command: () => this.disableSelectedUsers() }
  ];
  exportItems: MenuItem[] = [
    { label: 'Export CSV', icon: 'pi pi-file', command: () => this.exportData('csv') },
    { label: 'Export Excel', icon: 'pi pi-file-excel', command: () => this.exportData('excel') }
  ];
  viewItems: MenuItem[] = [
    { label: 'Customize Columns', icon: 'pi pi-table', command: () => this.customizeView() }
  ];

  // --- Add User Dialog Properties (Copied back) ---
  addUserDialogVisible = false;
  newUser = {
    accountName: '',
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    selectedPolicy: null,
    selectedProvisioningMode: 'auto',
    selectedTemplate: null,
    allowAdminReset: true,
    requireChangeOnLogin: false
  };
  policyOptions = [
    { name: '(none)', code: 'none' },
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
  ];
  // --- End Add User Dialog Properties ---

  constructor() { }

  ngOnInit(): void {
    // Initialize with sample data matching the image structure
    this.users = [
      {
        name: 'Braiek1',
        accountName: 'Braiek',
        tenant: 0, // Assuming tenant is identified by a number or string ID
        onlineDevices: 0,
        devices: 0,
        emailAddress: 'mohamedamine.braiek@polytechnicien.tn', // Example email
        emailReports: 'Enabled',
        protectedItemsQuota: 'None',
        storageVaultSize: '0 B',
        storageVaultQuota: '1.00 TB',
        policy: 'Custom Policy'
      }
      // Add more sample users if needed
    ];
  }

  // --- Add User Dialog Methods (Copied back) ---
  showAddUserDialog() {
    this.addUserDialogVisible = true;
    // Reset form fields when opening
    this.newUser = {
      accountName: '', username: '', password: '', confirmPassword: '', email: '',
      selectedPolicy: null, selectedProvisioningMode: 'auto', selectedTemplate: null,
      allowAdminReset: true, requireChangeOnLogin: false
    };
  }

  hideAddUserDialog() {
    this.addUserDialogVisible = false;
  }

  addUser() {
    if (this.newUser.password !== this.newUser.confirmPassword) {
      console.error("Passwords do not match!");
      // TODO: Show user-friendly error message
      return;
    }
    console.log('Adding new user:', this.newUser);
    // TODO: Add actual API call to backend
    // TODO: Refresh the user list (e.g., re-fetch or add locally)
    // Example: this.users = [...this.users, { ...this.newUser, /* map fields if needed */ }];
    this.hideAddUserDialog();
  }
  // --- End Add User Dialog Methods ---

  // --- Placeholder methods for button actions ---
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
    // TODO: Implement bulk delete logic
  }

  disableSelectedUsers(): void {
    console.log('Disabling selected users:', this.selectedUsers);
    // TODO: Implement bulk disable logic
  }

  exportData(format: string): void {
    console.log(`Exporting data as ${format}`);
    // TODO: Implement export logic
  }

  customizeView(): void {
    console.log('Customize View clicked');
    // TODO: Implement view customization logic
  }

  // Method to apply filter globally on the table
  applyFilter(table: any, event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    table.filterGlobal(filterValue, 'contains');
  }
}
