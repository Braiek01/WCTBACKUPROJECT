import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

// PrimeNG imports
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { TagModule } from 'primeng/tag';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { CalendarModule } from 'primeng/calendar';
import { DividerModule } from 'primeng/divider';
import { ChipModule } from 'primeng/chip';
import { SplitButtonModule } from 'primeng/splitbutton';
import { PaginatorModule } from 'primeng/paginator';

@Component({
  selector: 'app-subjoblogs',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    DropdownModule,
    TagModule,
    CardModule,
    ToastModule,
    TooltipModule,
    ConfirmDialogModule,
    ProgressBarModule,
    CalendarModule,
    DividerModule,
    ChipModule,
    SplitButtonModule,
    PaginatorModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './subjoblogs.component.html',
  styleUrl: './subjoblogs.component.css'
})
export class SubjoblogsComponent implements OnInit {
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

  // Job logs data
  jobLogs: any[] = [];
  loading: boolean = true;
  
  // Filter properties
  dateRange: Date[] = [];
  selectedJobStatus: any = null;
  selectedJobType: any = null;
  searchText: string = '';
  
  // Pagination
  rows: number = 10;
  totalRecords: number = 0;
  first: number = 0;
  
  // Dialog properties
  showJobDetailsDialog: boolean = false;
  selectedJob: any = null;
  
  // Status and type options for filtering
  jobStatuses = [
    { label: 'All Statuses', value: null },
    { label: 'Success', value: 'success' },
    { label: 'Error', value: 'error' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Warning', value: 'warning' }
  ];
  
  jobTypes = [
    { label: 'All Types', value: null },
    { label: 'Backup', value: 'backup' },
    { label: 'Restore', value: 'restore' },
    { label: 'Check', value: 'check' },
    { label: 'Prune', value: 'prune' }
  ];

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Get tenant name and username
    this.tenantName = this.authService.getTenantName() || '';
    this.username = this.authService.getUsername() || '';
    
    // Load job logs
    this.loadJobLogs();
    
    // Auto-refresh logs every 30 seconds
    setInterval(() => {
      if (!this.showJobDetailsDialog) { // Don't refresh if viewing details
        this.loadJobLogs();
      }
    }, 30000);
  }

  loadJobLogs(): void {
    this.loading = true;
    
    // In a real application, you would call an API
    // For this example, we'll use mock data
    setTimeout(() => {
      this.jobLogs = [
        {
          id: 1,
          type: 'backup',
          server: 'database-prod',
          start_time: '2025-05-21T01:40:04',
          end_time: '2025-05-21T02:26:45',
          duration: 2801,
          status: 'success',
          size: 253180000,
          log: 'Started backup at 01:40:04\nScanning directories...\nFound 2341 files (2.3 GB)\nUploading files...\nBackup completed successfully at 02:26:45'
        },
        {
          id: 2,
          type: 'prune',
          server: 'server01.example.com',
          start_time: '2025-05-24T01:40:04',
          status: 'in_progress',
          duration: 0,
          size: 621680000,
          log: 'Started prune operation at 01:40:04\nAnalyzing snapshots...\nPruning in progress...'
        },
        {
          id: 3,
          type: 'prune',
          server: 'server01.example.com',
          start_time: '2025-06-05T01:40:04',
          status: 'in_progress',
          duration: 0,
          size: 649730000,
          log: 'Started prune operation at 01:40:04\nAnalyzing snapshots...\nPruning in progress...'
        },
        {
          id: 4,
          type: 'backup',
          server: 'server01.example.com',
          start_time: '2025-06-13T01:40:04',
          end_time: '2025-06-13T02:08:23',
          duration: 1699,
          status: 'success',
          size: 131730000,
          log: 'Started backup at 01:40:04\nScanning directories...\nFound 853 files (1.2 GB)\nUploading files...\nBackup completed successfully at 02:08:23'
        },
        {
          id: 5,
          type: 'restore',
          server: 'database-prod',
          start_time: '2025-05-21T01:40:04',
          status: 'in_progress',
          duration: 0,
          size: 50980000,
          log: 'Started restore at 01:40:04\nLocating backup snapshot...\nDownloading files...\nRestore in progress...'
        }
      ];
      
      this.totalRecords = this.jobLogs.length;
      this.loading = false;
    }, 500);
  }
  
  onFilter(): void {
    // In a real application, you would filter on the server side
    // For this example, we'll just log the filter criteria
    console.log('Filter criteria:', {
      dateRange: this.dateRange,
      status: this.selectedJobStatus,
      type: this.selectedJobType,
      search: this.searchText
    });
    
    // Normally you would call the API with these filters
    this.loadJobLogs();
  }
  
  resetFilters(): void {
    this.dateRange = [];
    this.selectedJobStatus = null;
    this.selectedJobType = null;
    this.searchText = '';
    
    this.onFilter();
  }
  
  viewJobDetails(job: any): void {
    this.selectedJob = job;
    this.showJobDetailsDialog = true;
  }
  
  getJobTypeIcon(type: string): string {
    switch (type.toLowerCase()) {
      case 'backup': return 'pi-save';
      case 'restore': return 'pi-replay';
      case 'check': return 'pi-check-circle';
      case 'prune': return 'pi-trash';
      default: return 'pi-cog';
    }
  }
  
  getStatusSeverity(status: string): string {
    switch (status.toLowerCase()) {
      case 'success': return 'success';
      case 'error': return 'danger';
      case 'in_progress': return 'info';
      case 'warning': return 'warning';
      default: return 'info';
    }
  }
  
  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  }
  
  formatDuration(seconds: number): string {
    if (!seconds) return 'N/A';
    
    if (seconds < 60) {
      return `${seconds} sec`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours} hr ${minutes} min`;
    }
  }
  
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  onPageChange(event: any): void {
    this.first = event.first;
    this.rows = event.rows;
    // Normally you would load the specific page from the server
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
