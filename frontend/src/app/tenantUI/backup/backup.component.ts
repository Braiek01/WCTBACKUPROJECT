import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { MessageService, ConfirmationService } from 'primeng/api';
import { Table } from 'primeng/table';

// PrimeNG Imports
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { DropdownModule } from 'primeng/dropdown';
import { CardModule } from 'primeng/card';
import { ProgressBarModule } from 'primeng/progressbar';
import { MultiSelectModule } from 'primeng/multiselect';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { SplitButtonModule } from 'primeng/splitbutton';

// Services
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-backups',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    RouterLink, 
    HttpClientModule,
    ButtonModule,
    TableModule,
    TagModule,
    ToastModule,
    DropdownModule,
    CardModule,
    ProgressBarModule,
    MultiSelectModule,
    DialogModule,
    ConfirmDialogModule,
    TooltipModule,
    InputTextModule,
    SplitButtonModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './backup.component.html',
})
export class BackupsComponent implements OnInit {
  @ViewChild('dt') dt!: Table;

  backups: any[] = [];
  loading: boolean = true;
  selectedBackups: any[] = [];
  backupDetailDialog: boolean = false;
  selectedBackup: any = null;
  tenantName: string = '';
  username: string = '';
  splitButtonItems: any[] = [];
  
  // Enhanced filters with proper types
  filters = {
    status: null,
    repository: null,
    server: null
  };
  
  // Status options with proper format
  statuses = [
    { label: 'All Statuses', value: null },
    { label: 'Completed', value: 'completed' },
    { label: 'Running', value: 'running' },
    { label: 'Failed', value: 'failed' }
  ];
  
  repositories: any[] = [{ label: 'All Repositories', value: null }];
  servers: any[] = [{ label: 'All Servers', value: null }];
  
  constructor(
    private apiService: ApiService,
    private route: ActivatedRoute,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}
  
  ngOnInit() {
    this.tenantName = localStorage.getItem('tenantName') || '';
    this.username = localStorage.getItem('username') || '';
    
    this.setupNavigation();
    this.loadRepositories();
    this.loadServers();
    // Load backups after loading filters
    setTimeout(() => this.loadBackups(), 100);
  }
  
  setupNavigation() {
    this.splitButtonItems = [
      {
        label: 'Profile',
        icon: 'pi pi-user',
        routerLink: [`/${this.tenantName}/profile`]
      },
      {
        label: 'Logout',
        icon: 'pi pi-sign-out',
        command: () => this.logout()
      }
    ];
  }
  
  logout() {
    // Implement your logout logic here
    console.log('Logging out...');
  }
  
  loadBackups() {
    this.loading = true;
    
    // Build query parameters based on selected filters
    let params = new URLSearchParams();
    if (this.filters.status) {
      params.append('status', this.filters.status);
    }
    if (this.filters.repository) {
      params.append('repository', this.filters.repository);
    }
    if (this.filters.server) {
      params.append('server', this.filters.server);
    }
    
    const queryString = params.toString() ? `?${params.toString()}` : '';
    
    this.apiService.get(`backrest/operations/${queryString}`).subscribe({
      next: (data: any) => {
        this.backups = data.map((backup: any) => {
          return {
            ...backup,
            sizeMB: this.formatSize(backup.size || 0),
            statusSeverity: this.getStatusSeverity(backup.status)
          };
        });
        this.loading = false;
        console.log('Backups loaded with filters:', this.backups);
      },
      error: (err) => {
        console.error('Error loading backups:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load backups'
        });
        this.loading = false;
      }
    });
  }
  
  loadRepositories() {
    this.apiService.get('backrest/repositories/').subscribe({
      next: (data: unknown) => {
        // Start with "All Repositories" option
        this.repositories = [{ label: 'All Repositories', value: null }];
        
        // Add repositories from API
        const repos = data as any[];
        if (repos && repos.length > 0) {
          const repoOptions = repos.map((repo: any) => ({
            label: repo.name,
            value: repo.id
          }));
          this.repositories = [...this.repositories, ...repoOptions];
        }
        
        console.log('Repositories loaded for filtering:', this.repositories);
      },
      error: (err) => {
        console.error('Error loading repositories:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load repository filters'
        });
      }
    });
  }
  
  loadServers() {
    this.apiService.get('backrest/servers/').subscribe({
      next: (data: unknown) => {
        // Start with "All Servers" option
        this.servers = [{ label: 'All Servers', value: null }];
        
        // Add servers from API
        const servers = data as any[];
        if (servers && servers.length > 0) {
          const serverOptions = servers.map((server: any) => ({
            label: server.name || server.hostname,
            value: server.id
          }));
          this.servers = [...this.servers, ...serverOptions];
        }
        
        console.log('Servers loaded for filtering:', this.servers);
      },
      error: (err) => {
        console.error('Error loading servers:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load server filters'
        });
      }
    });
  }
  
  formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  getStatusSeverity(status: string): string {
    switch (status?.toLowerCase()) {
      case 'completed': return 'success';
      case 'running': return 'info';
      case 'failed': return 'danger';
      case 'warning': return 'warning';
      default: return 'info';
    }
  }
  
  showBackupDetails(backup: any) {
    this.selectedBackup = backup;
    this.backupDetailDialog = true;
  }
  
  onFilter() {
    // Apply filters to API request
    this.loadBackups();
  }
  
  clearFilters() {
    this.filters = {
      status: null,
      repository: null,
      server: null
    };
    this.loadBackups();
  }
  
  applyFilter(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (this.dt) {
      this.dt.filterGlobal(target.value, 'contains');
    }
  }
}
