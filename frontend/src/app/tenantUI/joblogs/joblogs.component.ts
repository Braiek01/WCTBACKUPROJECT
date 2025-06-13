import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
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
import { TextareaModule } from 'primeng/textarea';

@Component({
  selector: 'app-joblogs',
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
    TextareaModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './joblogs.component.html',
  styleUrl: './joblogs.component.css'
})
export class JobLogsComponent implements OnInit {
  // User and tenant info
  username: string = '';
  tenantName: string = '';
  
  // Split button items for user menu
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

  // Job logs data
  jobLogs: any[] = [];
  filteredLogs: any[] = [];
  loading: boolean = true;
  
  // Filter properties
  filterDateRange: Date[] = [];
  filterStatus: string | null = null;
  filterType: string | null = null;
  
  // Dialog properties
  detailsDialogVisible: boolean = false;
  selectedLog: any = null;
  
  // Status and type options for filtering
  statusOptions = [
    { label: 'All Statuses', value: null },
    { label: 'Completed', value: 'completed' },
    { label: 'Failed', value: 'failed' },
    { label: 'Running', value: 'running' },
    { label: 'Pending', value: 'pending' }
  ];
  
  typeOptions = [
    { label: 'All Types', value: null },
    { label: 'Backup', value: 'backup' },
    { label: 'Restore', value: 'restore' },
    { label: 'Verification', value: 'verify' },
    { label: 'Maintenance', value: 'maintenance' }
  ];

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private route: ActivatedRoute,
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
      if (!this.detailsDialogVisible) { // Don't refresh if viewing details
        this.loadJobLogs();
      }
    }, 30000);
  }

  loadJobLogs(): void {
    this.loading = true;
    this.apiService.get('backrest/operations/').subscribe({
      next: (data: any) => {
        this.jobLogs = data as any[];
        this.applyFilters();
        this.loading = false;
        console.log('Job logs loaded:', this.jobLogs);
      },
      error: (err: any) => {
        console.error('Error loading job logs:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load job logs'
        });
        this.loading = false;
      }
    });
  }
  
  applyFilters(): void {
    this.filteredLogs = this.jobLogs.filter(log => {
      // Status filter
      if (this.filterStatus && log.status !== this.filterStatus) {
        return false;
      }
      
      // Type filter
      if (this.filterType && log.operation_type !== this.filterType) {
        return false;
      }
      
      // Date range filter
      if (this.filterDateRange && this.filterDateRange.length === 2) {
        const logDate = new Date(log.start_time);
        if (logDate < this.filterDateRange[0] || logDate > this.filterDateRange[1]) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  resetFilters(): void {
    this.filterStatus = null;
    this.filterType = null;
    this.filterDateRange = [];
    this.applyFilters();
  }
  
  showDetailsDialog(log: any): void {
    this.selectedLog = log;
    
    // Load detailed information if needed
    this.apiService.get(`backrest/operations/${log.id}/`).subscribe({
      next: (data: any) => {
        this.selectedLog = data;
        this.detailsDialogVisible = true;
      },
      error: (err: any) => {
        console.error('Error loading log details:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load log details'
        });
      }
    });
  }
  
  formatDate(dateStr: string): string {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString();
  }
  
  getStatusSeverity(status: string): string {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'danger';
      case 'running':
        return 'info';
      case 'pending':
        return 'warning';
      default:
        return 'secondary';
    }
  }
  
  getOperationTypeIcon(type: string): string {
    switch (type) {
      case 'backup':
        return 'pi pi-save';
      case 'restore':
        return 'pi pi-replay';
      case 'verify':
        return 'pi pi-check-circle';
      case 'maintenance':
        return 'pi pi-wrench';
      default:
        return 'pi pi-cog';
    }
  }
  
  getDuration(log: any): string {
    if (!log.start_time) return 'N/A';
    
    const start = new Date(log.start_time);
    const end = log.end_time ? new Date(log.end_time) : new Date();
    
    const durationMs = end.getTime() - start.getTime();
    const seconds = Math.floor(durationMs / 1000);
    
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
