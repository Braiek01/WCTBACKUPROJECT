
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router'; // Import RouterLink
import { FormsModule } from '@angular/forms';

// PrimeNG Modules
import { ButtonModule } from 'primeng/button';
import { SplitButtonModule } from 'primeng/splitbutton';
import { InputTextModule } from 'primeng/inputtext';
import { InputSwitchModule } from 'primeng/inputswitch'; // For toggles
import { DropdownModule } from 'primeng/dropdown';
import { TabViewModule } from 'primeng/tabview'; // For tabs like Profile, Protected Items etc.
import { ConfirmDialogModule } from 'primeng/confirmdialog'; // For confirmation
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api'; // Import ConfirmationService & MessageService
import { ToastModule } from 'primeng/toast'; // To show messages
import { TableModule } from 'primeng/table'; // <-- Add TableModule
import { ToolbarModule } from 'primeng/toolbar'; // <-- Add ToolbarModule
import { CheckboxModule } from 'primeng/checkbox'; // <-- Add CheckboxModule
import { TagModule } from 'primeng/tag'; // <-- Add TagModule for status
import { DialogModule } from 'primeng/dialog'; // <-- Add DialogModule
import { JobReportComponent } from '../job-report/job-report.component';

import { ProgressBarModule } from 'primeng/progressbar'; // <-- Add ProgressBarModule

@Component({
  selector: 'app-user-details',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink, // Add RouterLink
    ButtonModule,
    SplitButtonModule,
    InputTextModule,
    InputSwitchModule,
    DropdownModule,
    TabViewModule,
    ConfirmDialogModule, // Add ConfirmDialogModule
    ToastModule, // Add ToastModule
    TableModule, // <-- Add
    ToolbarModule, // <-- Add
    CheckboxModule, // <-- Add
    TagModule, // <-- Add
    DialogModule, // <-- Add DialogModule
    JobReportComponent, // <-- Add JobReportComponent
    ProgressBarModule // <-- Add ProgressBarModule
  ],
  templateUrl: './user-details.component.html',
  styleUrls: ['./user-details.component.css'],
  providers: [ConfirmationService] // Provide services here
})
export class UserDetailsComponent implements OnInit {

  username: string | null = null;
  userDetails: any = {}; // Placeholder for fetched user data
  actionItems: MenuItem[] = [];

  // Example properties for the form (replace with actual fetched data)
  accountName = '';
  userGroup = 'No Group';
  passwordPlaceholder = '(Hashed with 448-bit bcrypt)';
  allowAdminReset = true;
  requireChangeOnLogin = false;
  createdDate = '';
  autoCreateVaults = 'System default';
  language = 'en';
  timezone = 'Africa/Tunis';
  emailAddress = '';
  emailBackupReports = true;
  emailServiceBulletins = true;

  // Example options
  languageOptions = [{ label: 'English', value: 'en' }, { label: 'French', value: 'fr' }];
  timezoneOptions = [{ label: 'Africa/Tunis', value: 'Africa/Tunis' }, { label: 'UTC', value: 'UTC' }];

  // --- Properties for Job Logs Table ---
  jobLogs: any[] = [];
  selectedJobLogs: any[] = [];
  jobLogRowsPerPageOptions = [
    { label: '10', value: 10 },
    { label: '25', value: 25 },
    { label: '50', value: 50 }
  ];
  selectedJobLogRowsPerPage = 10;
  jobLogExportItems: MenuItem[] = []; // For Export button
  jobLogViewItems: MenuItem[] = []; // For View button
  // --- End Job Logs Properties ---

  // --- Properties for Storage Vaults Table ---
  storageVaults: any[] = [];
  selectedStorageVaults: any[] = []; // If selection is needed
  storageVaultRowsPerPageOptions = [
    { label: '10', value: 10 },
    { label: '25', value: 25 },
    { label: '50', value: 50 }
  ];
  selectedStorageVaultRowsPerPage = 10;
  storageVaultExportItems: MenuItem[] = [];
  storageVaultViewItems: MenuItem[] = [];
  storageVaultFilterValue: string = '';
  // --- End Storage Vaults Properties ---

  // --- Properties for Job Report Dialog ---
  displayJobReportDialog: boolean = false;
  selectedJobForReport: any = null;
  // --- End Job Report Dialog Properties ---

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private confirmationService: ConfirmationService,
    private messageService: MessageService // Inject MessageService
  ) {}

  ngOnInit(): void {
    this.username = this.route.snapshot.paramMap.get('username');
    console.log('Fetching details for user:', this.username);
    // TODO: Fetch actual user details from a service based on this.username
    // this.userService.getUserDetails(this.username).subscribe(data => {
    //   this.userDetails = data;
    //   // Populate form fields from this.userDetails
    // });

    // --- TODO: Fetch actual user details from a service ---
    if (this.username === 'Braiek1') {
        this.accountName = 'Braiek';
        this.createdDate = '2025-04-28 22:04:47';
        this.emailAddress = 'mohamedamine.braiek@polytechnicien.tn';
    } else {
        console.warn('User details not found for:', this.username);
    }
    // --- End TODO ---

    // Define Action Menu Items
    this.actionItems = [
      {
        label: 'Reset password',
        icon: 'pi pi-key',
        command: () => {
          console.log('Reset password clicked');
          this.messageService.add({ severity: 'info', summary: 'Info', detail: 'Reset password action triggered' });
        }
      },
      {
        label: 'Suspend',
        icon: 'pi pi-pause',
        command: () => {
          console.log('Suspend clicked');
          this.messageService.add({ severity: 'info', summary: 'Info', detail: 'Suspend action triggered' });
        }
      },
      {
        separator: true
      },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        command: () => {
          this.confirmDeleteUser(); // Call confirmation method
        }
      }
    ];

    // --- Initialize Job Logs Data (Sample) ---
    // TODO: Fetch actual job logs for the user
    this.jobLogs = [
      {
        id: 'job1', // Unique key for selection
        device: 'Unit-Braiek01',
        protectedItem: `New Protected Item (Fri May 2 21:46:33 2025)`,
        type: 'Backup',
        status: 'Success',
        files: 1,
        size: '28.31 MB',
        uploaded: '4.60 MB',
        downloaded: '978 B',
        started: '2025-05-02 21:48:24', // Use a valid date format if possible
        duration: '0:01:33' // Example H:MM:SS or MM:SS
      }
      // Add more log entries if needed
    ];
    // --- End Job Logs Data ---

    // --- Initialize Job Logs Toolbar Items ---
    this.jobLogExportItems = [
        { label: 'Export CSV', icon: 'pi pi-file', command: () => this.exportJobLogs('csv') },
        { label: 'Export Excel', icon: 'pi pi-file-excel', command: () => this.exportJobLogs('excel') }
    ];
    this.jobLogViewItems = [
        { label: 'Customize Columns', icon: 'pi pi-table', command: () => this.customizeJobLogView() }
    ];
    // --- End Job Logs Toolbar Items ---

    // --- Initialize Storage Vaults Data (Sample) ---
    // TODO: Fetch actual storage vaults for the user
    this.storageVaults = [
      {
        id: 'sv1', // Unique key
        name: 'polytechnicien-Zmanda Cloud Storage-us-east-1',
        type: 'Wasabi', // Or 'Azure Blob', 'Local', etc.
        typeIcon: 'pi pi-cloud', // Example icon based on type
        initialized: 'Yes',
        stored: '4.60 MB',
        quota: '1.00 TB',
        quotaUsage: 0 // Percentage
      }
      // Add more vault entries if needed
    ];
    // --- End Storage Vaults Data ---

    // --- Initialize Storage Vaults Toolbar Items ---
    this.storageVaultExportItems = [
        { label: 'Export CSV', icon: 'pi pi-file', command: () => this.exportStorageVaults('csv') },
        { label: 'Export Excel', icon: 'pi pi-file-excel', command: () => this.exportStorageVaults('excel') }
    ];
    this.storageVaultViewItems = [
        { label: 'Customize Columns', icon: 'pi pi-table', command: () => this.customizeStorageVaultView() }
    ];
    // --- End Storage Vaults Toolbar Items ---
  }

  saveChanges(): void {
    console.log('Saving changes for user:', this.username);
    // TODO: Implement save logic, call a service
    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'User details saved (simulated)' });
  }

  confirmDeleteUser(): void {
    this.confirmationService.confirm({
      message: `Are you sure you want to remove the user '${this.username}'?<br><br>Cluster Manager will clean up any unused buckets.`,
      header: 'Delete User',
      icon: 'pi pi-info-circle', // Use info icon as per image
      acceptButtonStyleClass: 'p-button-danger', // Red delete button
      rejectButtonStyleClass: 'p-button-text',
      accept: () => {
        console.log('Deleting user:', this.username);
        // TODO: Implement actual delete logic (call service)
        this.messageService.add({ severity: 'info', summary: 'Confirmed', detail: `User '${this.username}' deletion initiated (simulated)` });
        // Optionally navigate back to users list
        // this.router.navigate(['/users']);
      },
      reject: () => {
        this.messageService.add({ severity: 'warn', summary: 'Cancelled', detail: 'User deletion cancelled' });
      }
    });
  }

  // --- Placeholder Methods for Job Logs ---
  exportJobLogs(format: string): void {
    console.log(`Exporting selected job logs as ${format}:`, this.selectedJobLogs);
    // TODO: Implement export logic
    this.messageService.add({ severity: 'info', summary: 'Export', detail: `Exporting ${format} (simulated)` });
  }

  customizeJobLogView(): void {
    console.log('Customize Job Log View clicked');
    // TODO: Implement view customization logic
    this.messageService.add({ severity: 'info', summary: 'View', detail: 'Customize columns (simulated)' });
  }

  // --- Updated Method to Show Job Report Dialog ---
  viewJobReport(job: any): void {
    console.log('Viewing report for job:', job);
    this.selectedJobForReport = job; // Store the selected job data
    this.displayJobReportDialog = true; // Show the dialog
    // Removed messageService call here, dialog opening is enough feedback
  }
  // --- End Job Logs Methods ---

  // --- Placeholder Methods for Storage Vaults ---
  addNewVault(): void {
    console.log('Add new vault clicked');
    // TODO: Implement logic to open a dialog/navigate to add vault page
    this.messageService.add({ severity: 'info', summary: 'Action', detail: 'Add new vault (simulated)' });
  }

  exportStorageVaults(format: string): void {
    console.log(`Exporting storage vaults as ${format}`);
    // TODO: Implement export logic
    this.messageService.add({ severity: 'info', summary: 'Export', detail: `Exporting ${format} (simulated)` });
  }

  customizeStorageVaultView(): void {
    console.log('Customize Storage Vault View clicked');
    // TODO: Implement view customization logic
    this.messageService.add({ severity: 'info', summary: 'View', detail: 'Customize columns (simulated)' });
  }

  deleteStorageVault(vault: any): void {
    this.confirmationService.confirm({
        message: `Are you sure you want to delete the Storage Vault '${vault.name}'?`,
        header: 'Delete Storage Vault',
        icon: 'pi pi-exclamation-triangle',
        acceptButtonStyleClass: 'p-button-danger',
        rejectButtonStyleClass: 'p-button-text',
        accept: () => {
          console.log('Deleting storage vault:', vault.name);
          // TODO: Implement actual deletion logic
          this.storageVaults = this.storageVaults.filter(v => v.id !== vault.id); // Basic removal from list
          this.messageService.add({ severity: 'success', summary: 'Deleted', detail: `Storage Vault '${vault.name}' deleted (simulated)` });
        },
        reject: () => {
          this.messageService.add({ severity: 'warn', summary: 'Cancelled', detail: 'Storage Vault deletion cancelled' });
        }
      });
  }

  applyStorageVaultFilter(table: any, event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    table.filterGlobal(inputElement.value, 'contains');
  }
  // --- End Storage Vaults Methods ---
}
