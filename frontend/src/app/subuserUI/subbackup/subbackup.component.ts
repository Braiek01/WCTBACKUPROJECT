import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { MessageService, ConfirmationService } from 'primeng/api';

// PrimeNG Imports
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea'; // Fixed import
import { SplitButtonModule } from 'primeng/splitbutton';
import { ToastModule } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TabViewModule } from 'primeng/tabview';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';

import { ViewChild } from '@angular/core';
import { Table } from 'primeng/table';

@Component({
  selector: 'app-subbackup',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    CardModule,
    DialogModule,
    DropdownModule,
    InputTextModule,
    TextareaModule, // Fixed import
    SplitButtonModule,
    ToastModule,
    TableModule,
    TagModule,
    TabViewModule,
    ConfirmDialogModule,
    TooltipModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './subbackup.component.html',
  styleUrl: './subbackup.component.css'
})
export class SubbackupComponent implements OnInit {
  // Reference to the PrimeNG Table
  @ViewChild('dt') dt!: Table;

  // User info
  username: string = '';
  tenantName: string = '';
  
  // Backup dialog
  backupDialogVisible = false;
  backupName = '';
  targetHosts = '';
  extraVars = '';
  publickey = '';
  selectedBackupType = 'restic';
  backupTypes = [
    { label: 'Full', value: 'full' },
    { label: 'Differential', value: 'diff' },
    { label: 'Incremental (Restic)', value: 'restic' }
  ];
  
  // Backup data
  backups: any[] = [];
  selectedBackups: any[] = [];
  loading = false;
  
  // Split button menu
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

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private router: Router,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    // Get user info
    this.username = this.authService.getUsername() || '';
    this.tenantName = this.authService.getTenantName() || '';
    
    // Load backups
    this.loadBackups();
  }
  
  loadBackups(): void {
    this.loading = true;
    
    // Simulated data - in a real app, this would come from an API
    setTimeout(() => {
      this.backups = [
        {
          id: 1,
          name: 'MySQL Database',
          type: 'restic',
          repository: 'Azure Blob Storage',
          target: 'server01.example.com',
          created_at: '2025-05-02T21:46:33',
          status: 'completed',
          size: '2.3 MB'
        },
        {
          id: 2,
          name: 'User Files',
          type: 'full',
          repository: 'S3 Storage',
          target: 'server01.example.com',
          created_at: '2025-05-01T15:20:10',
          status: 'completed',
          size: '1.8 MB'
        },
        {
          id: 3,
          name: 'Config Files',
          type: 'diff',
          repository: 'Local Storage',
          target: 'server02.example.com',
          created_at: '2025-04-30T09:15:22',
          status: 'warning',
          size: '0.5 MB'
        }
      ];
      this.loading = false;
    }, 500);
  }
  
  showBackupDialog(): void {
    this.backupDialogVisible = true;
    this.backupName = '';
    this.targetHosts = '';
    this.extraVars = '';
    this.publickey = '';
    this.selectedBackupType = 'restic';
  }
  
  hideBackupDialog(): void {
    this.backupDialogVisible = false;
  }
  
  runBackupPlaybook(): void {
    const jobData = {
      name: this.backupName,
      target_hosts: this.targetHosts,
      backup_type: this.selectedBackupType,
      extra_vars: this.parseExtraVars(this.extraVars),
      publickey: this.publickey
    };
    
    console.log('Sending job request to backend:', jobData);
    
    // Simulate successful API call
    this.messageService.add({
      severity: 'success',
      summary: 'Backup Initiated',
      detail: `Backup job ${this.backupName} has been started`
    });
    
    this.hideBackupDialog();
    
    // Add new backup to the list
    const newBackup = {
      id: this.backups.length + 1,
      name: this.backupName,
      type: this.selectedBackupType,
      repository: 'Azure Blob Storage',
      target: this.targetHosts,
      created_at: new Date().toISOString(),
      status: 'running',
      size: '0 MB'
    };
    
    this.backups = [newBackup, ...this.backups];
  }
  
  parseExtraVars(extraVars: string): { [key: string]: string } {
    if (!extraVars) return {};
    return extraVars.split(',')
      .map(pair => pair.trim())
      .filter(pair => pair.includes('='))
      .reduce((acc, pair) => {
        const [key, value] = pair.split('=').map(s => s.trim());
        acc[key] = value;
        return acc;
      }, {} as { [key: string]: string });
  }
  
  // Define the applyFilter method and other missing methods
  applyFilter(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (this.dt) {
      this.dt.filterGlobal(target.value, 'contains');
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }
  
  getStatusSeverity(status: string): string {
    switch (status) {
      case 'completed': return 'success';
      case 'running': return 'info';
      case 'warning': return 'warning';
      case 'failed': return 'danger';
      default: return 'info';
    }
  }
  
  getStatusLabel(status: string): string {
    switch (status) {
      case 'completed': return 'Completed';
      case 'running': return 'Running';
      case 'warning': return 'Warning';
      case 'failed': return 'Failed';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  }
  
  // Added the missing method for downloading backups
  downloadBackup(job: any): void {
    console.log('Downloading backup:', job);
    
    this.messageService.add({
      severity: 'info',
      summary: 'Download Started',
      detail: `Downloading backup: ${job.name}`
    });
    
    // Example API call (uncomment when API is ready)
    /*
    this.apiService.get(`backups/${job.id}/download`).subscribe({
      next: (response) => {
        // Create a temporary link and trigger download
        const url = window.URL.createObjectURL(new Blob([response]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `backup-${job.name}.zip`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      },
      error: (error) => {
        console.error('Error downloading backup:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to download backup'
        });
      }
    });
    */
  }
  
  // Add this method to maintain compatibility with template
  confirmDeleteBackup(job: any): void {
    this.deleteBackup(job);
  }
  
  deleteBackup(backup: any): void {
    this.confirmationService.confirm({
      message: `Are you sure you want to delete the backup "${backup.name}"?`,
      header: 'Confirm Deletion',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        // Simulate API call
        this.backups = this.backups.filter(b => b.id !== backup.id);
        this.messageService.add({
          severity: 'success',
          summary: 'Backup Deleted',
          detail: `Backup "${backup.name}" has been deleted`
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
        }, 1000);
      },
      error: (err) => {
        console.error('Error during logout:', err);
        this.router.navigate(['/login']);
      }
    });
  }
}
