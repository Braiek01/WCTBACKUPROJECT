import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router'; // Import RouterLink

// PrimeNG Modules
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { TimelineModule } from 'primeng/timeline';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextarea } from 'primeng/inputtextarea'; // Correct import for textarea
import { CheckboxModule } from 'primeng/checkbox'; // Import CheckboxModule
import { PasswordModule } from 'primeng/password'; // Import PasswordModule
import { InputGroupModule } from 'primeng/inputgroup'; // Import InputGroupModule
import { InputGroupAddonModule } from 'primeng/inputgroupaddon'; // Import InputGroupAddonModule
// ... other imports if needed

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink, // Add RouterLink
    ButtonModule,
    AccordionModule,
    TagModule,
    DividerModule,
    TimelineModule,
    CardModule,
    ChartModule,
    DialogModule,
    InputTextModule,
    DropdownModule,
    InputTextarea, // Use InputTextareaModule
    CheckboxModule, // Add CheckboxModule
    PasswordModule, // Add PasswordModule
    InputGroupModule, // Add InputGroupModule
    InputGroupAddonModule // Add InputGroupAddonModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {

  // --- Existing Properties ---
  buckets: any[] = []; // Example data structure
  recentActions: any[] = []; // Example data structure
  chartData: any;
  chartOptions: any;
  backupDialogVisible = false;
  backupName = '';
  targetHosts = '';
  playbookPath = '/etc/ansible/playbooks/backup_playbook.yml';
  extraVars = '';
  backupTypes = [
      { label: 'Full', value: 'full' },
      { label: 'Differential', value: 'diff' },
      { label: 'Incremental (Restic)', value: 'restic' }
  ];
  selectedBackupType = 'restic'; // Default selection

  // --- New Properties for Add User Dialog ---
  addUserDialogVisible = false;
  newUser = {
    accountName: '',
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    selectedPolicy: null, // Or default code like 'none'
    selectedProvisioningMode: 'auto', // Default based on image
    selectedTemplate: null, // Or default code
    allowAdminReset: true, // Default based on image
    requireChangeOnLogin: false // Default based on image
  };
  policyOptions = [
    { name: '(none)', code: 'none' },
    // Add other policy options here
    { name: 'Default User Policy', code: 'default_user' },
    { name: 'Admin Policy', code: 'admin' }
  ];
  provisioningModeOptions = [
    { name: 'Provision Storage Vaults automatically, when new devices are registered to this user (recommended)', code: 'auto' },
    { name: 'Do not provision Storage Vaults automatically', code: 'manual' },
    // Add other modes if applicable
  ];
  templateOptions = [
    { name: 'System Default [Currently: None]', code: 'default' },
    // Add other template options here
    { name: 'Azure Blob Template', code: 'azure_blob' },
  ];

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {
    // --- Existing ngOnInit logic ---
    // Example data initialization
    this.buckets = [
      { id: 'bkp-a1b2c3d4', name: 'Web Server Backup', status: 'Completed', created: '2025-05-01', type: 'Restic', size: '15.2 GB', lifecycle: 'Standard', encryption: 'AES-256', icon: 'pi pi-server' },
      { id: 'bkp-e5f6g7h8', name: 'Database Backup', status: 'Running', created: '2025-05-02', type: 'Full', size: '5.8 GB', lifecycle: 'Standard', encryption: 'AES-256', icon: 'pi pi-database' }
    ];
    this.recentActions = [
        { description: 'Backup "Web Server Backup" completed', date: '15 minutes ago', icon: 'pi pi-check-circle', color: '#689F38', by: 'System' },
        { description: 'User "admin" logged in', date: '1 hour ago', icon: 'pi pi-sign-in', color: '#0288D1', by: 'admin' },
        { description: 'Backup "Database Backup" started', date: '2 hours ago', icon: 'pi pi-spin pi-spinner', color: '#0288D1', by: 'Scheduler' },
    ];
    this.initChart();
    // --- End Existing ngOnInit logic ---
  }

  initChart(): void {
    if (isPlatformBrowser(this.platformId)) {
      const documentStyle = getComputedStyle(document.documentElement);
      const textColor = documentStyle.getPropertyValue('--text-color');
      const textColorSecondary = documentStyle.getPropertyValue('--text-color-secondary');
      const surfaceBorder = documentStyle.getPropertyValue('--surface-border');

      this.chartData = {
          labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
          datasets: [
              {
                  label: 'Successful Backups',
                  data: [65, 59, 80, 81, 56, 55, 40],
                  fill: false,
                  borderColor: documentStyle.getPropertyValue('--primary-500'), // Use theme color
                  tension: .4
              },
              {
                  label: 'Failed Backups',
                  data: [2, 1, 3, 0, 4, 1, 2],
                  fill: false,
                  borderColor: documentStyle.getPropertyValue('--red-500'), // Use red for failures
                  tension: .4
              }
          ]
      };

      this.chartOptions = {
          maintainAspectRatio: false,
          aspectRatio: 0.9, // Adjust aspect ratio
          plugins: {
              legend: {
                  labels: {
                      color: textColor
                  }
              }
          },
          scales: {
              x: {
                  ticks: {
                      color: textColorSecondary
                  },
                  grid: {
                      color: surfaceBorder,
                      drawBorder: false
                  }
              },
              y: {
                  ticks: {
                      color: textColorSecondary
                  },
                  grid: {
                      color: surfaceBorder,
                      drawBorder: false
                  }
              }
          }
      };
    } else {
      this.chartData = {};
      this.chartOptions = {};
    }
  }

  // --- Backup Dialog Methods ---
  showBackupDialog() {
    this.backupDialogVisible = true;
    // Reset fields if needed
    this.backupName = '';
    this.targetHosts = '';
    this.playbookPath = '/etc/ansible/playbooks/backup_playbook.yml';
    this.extraVars = '';
    this.selectedBackupType = 'restic';
  }

  hideBackupDialog() {
    this.backupDialogVisible = false;
  }

  runBackupPlaybook() {
    console.log('Running backup playbook with:', {
      name: this.backupName,
      hosts: this.targetHosts,
      playbook: this.playbookPath,
      type: this.selectedBackupType,
      extraVars: this.parseExtraVars(this.extraVars)
    });
    // TODO: Add actual API call to backend to trigger Ansible playbook
    this.hideBackupDialog();
    // Optionally show a success/loading message
  }

  parseExtraVars(varsString: string): { [key: string]: string } {
      const vars: { [key: string]: string } = {};
      if (varsString) {
          varsString.split(',').forEach(pair => {
              const parts = pair.split('=');
              if (parts.length === 2) {
                  vars[parts[0].trim()] = parts[1].trim();
              }
          });
      }
      return vars;
  }
  // --- End Backup Dialog Methods ---

  // --- Add User Dialog Methods ---
  showAddUserDialog() {
    this.addUserDialogVisible = true;
    // Reset form fields when opening
    this.newUser = {
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
  }

  hideAddUserDialog() {
    this.addUserDialogVisible = false;
  }

  addUser() {
    // Basic validation example
    if (this.newUser.password !== this.newUser.confirmPassword) {
        console.error("Passwords do not match!");
        // TODO: Show user-friendly error message (e.g., using PrimeNG Messages/Toast)
        return;
    }

    console.log('Adding new user:', this.newUser);
    // TODO: Add actual API call to backend to create the user
    this.hideAddUserDialog();
    // Optionally show a success message
  }
  // --- End Add User Dialog Methods ---
}
