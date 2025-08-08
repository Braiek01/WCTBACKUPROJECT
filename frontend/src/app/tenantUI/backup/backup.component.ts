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
import { SidebarModule } from 'primeng/sidebar';
// Services
import { ApiService } from '../../core/services/api.service';
import { BackrestService } from '../../core/services/backrest.service';

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
    SplitButtonModule,
    SidebarModule
    
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
    private confirmationService: ConfirmationService,
    private backrestService: BackrestService  // Add this line
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
    this.backups = [];
    
    // First load repositories
    this.backrestService.getRepositories().subscribe({
      next: (repoResponse) => {
        const repositories = repoResponse.repositories || [];
        
        if (repositories.length === 0) {
          this.loading = false;
          return;
        }
        
        // Create promises array for loading snapshots from each repository
        const promises: Promise<any>[] = [];
        
        // For each repository, get its snapshots
        repositories.forEach((repo: any) => {
          if (this.filters.repository && repo.repository_id !== this.filters.repository) {
            return; // Skip if filter is applied and doesn't match
          }
          
          promises.push(
            new Promise<any[]>((resolve) => {
              this.backrestService.getSnapshots(repo.repository_id).subscribe({
                next: (response) => {
                  const snapshots = response.snapshots || [];
                  
                  // Convert snapshots to backup display format
                  const convertedBackups = snapshots.map((snapshot: any) => {
                    // Calculate duration if available
                    let duration = 'N/A';
                    if (snapshot.summary && snapshot.summary.totalDuration) {
                      const durationSeconds = parseFloat(snapshot.summary.totalDuration);
                      duration = this.formatDuration(durationSeconds);
                    }
                    
                    // Get backup size
                    const size = snapshot.summary?.dataAdded || 0;
                    
                    // Determine backup type and name
                    let backupName = 'Backup';
                    let backupType = 'manual_backup';
                    if (snapshot.tags && snapshot.tags.length > 0) {
                      const planTag = snapshot.tags.find((tag: string) => tag.startsWith('plan:'));
                      if (planTag) {
                        backupType = planTag.replace('plan:', '');
                        backupName = backupType.replace(/_/g, ' ');
                      }
                    }
                    
                    // Create timestamp from unixTimeMs
                    const timestamp = snapshot.unixTimeMs ? new Date(parseInt(snapshot.unixTimeMs)) : new Date();
                    
                    return {
                      id: snapshot.id,
                      snapshot_id: snapshot.id,
                      name: backupName,
                      repository: repo.name,
                      repository_id: repo.repository_id,
                      storage_type: repo.uri?.startsWith('s3:') ? 's3' : 
                                   repo.uri?.startsWith('azure:') ? 'azure' : 'local',
                      server: snapshot.hostname || 'Unknown',
                      size: size,
                      sizeMB: this.formatSize(size),
                      status: 'completed',
                      statusSeverity: 'success',
                      created_at: timestamp,
                      duration: duration,
                      paths: snapshot.paths || [],
                      tags: snapshot.tags || []
                    };
                  });
                  
                  resolve(convertedBackups);
                },
                error: () => resolve([])
              });
            })
          );
        });
        
        // Process all promises
        Promise.all(promises).then(allBackups => {
          // Flatten and filter backups
          let backups = allBackups.flat();
          
          // Apply additional filters
          if (this.filters.status) {
            backups = backups.filter(backup => backup.status === this.filters.status);
          }
          if (this.filters.server) {
            backups = backups.filter(backup => backup.server === this.filters.server);
          }
          
          // Sort by creation date (newest first)
          backups.sort((a, b) => {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          
          this.backups = backups;
          this.loading = false;
        });
      },
      error: (err) => {
        console.error('Failed to load repositories:', err);
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
  console.log('Opening backup details for:', backup);
  this.selectedBackup = { ...backup }; // Create a copy to avoid reference issues
  this.backupDetailDialog = true;
  
  // Debug log to verify
  console.log('Dialog should be visible:', this.backupDetailDialog);
  console.log('Selected backup:', this.selectedBackup);
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
  
  // Add this helper method to format duration
  formatDuration(seconds: number): string {
    if (!seconds && seconds !== 0) return 'N/A';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    let result = '';
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0 || hours > 0) result += `${minutes}m `;
    if (secs > 0 || (hours === 0 && minutes === 0)) result += `${secs}s`;
    
    return result.trim();
  }




// Add these new methods
closeBackupDetails() {
  this.backupDetailDialog = false;
  this.selectedBackup = null;
}

downloadBackup(backup: any) {
  // Implement download functionality
  this.messageService.add({
    severity: 'info',
    summary: 'Download',
    detail: `Download functionality for ${backup.name} is not yet implemented`
  });
}

restoreBackup(backup: any) {
  // Navigate to restore page with this backup selected
  this.messageService.add({
    severity: 'info',
    summary: 'Restore',
    detail: `Restore functionality for ${backup.name} is not yet implemented`
  });
}
}
