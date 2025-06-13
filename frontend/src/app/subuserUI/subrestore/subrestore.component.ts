import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

// PrimeNG Modules
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { CalendarModule } from 'primeng/calendar';
import { MultiSelectModule } from 'primeng/multiselect';
import { ChipModule } from 'primeng/chip';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { SplitButtonModule } from 'primeng/splitbutton';
import { DividerModule } from 'primeng/divider';

@Component({
  selector: 'app-subrestore',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    DialogModule,
    DropdownModule,
    InputTextModule,
    TagModule,
    CardModule,
    ToastModule,
    TooltipModule,
    ConfirmDialogModule,
    ProgressBarModule,
    CalendarModule,
    MultiSelectModule,
    ChipModule,
    TextareaModule,
    CheckboxModule,
    SplitButtonModule,
    DividerModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './subrestore.component.html',
  styleUrl: './subrestore.component.css'
})
export class SubrestoreComponent implements OnInit {
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

  // Data management
  snapshots: any[] = [];
  filteredSnapshots: any[] = [];
  repositories: any[] = [];
  plans: any[] = [];
  loading: boolean = false;
  selectedSnapshot: any = null;
  
  // Filter properties
  filterRepository: any = null;
  filterPlan: any = null;
  filterDateRange: Date[] = [];
  filterTagInput: string = '';
  filterTags: string[] = [];
  
  // Restore dialog properties
  restoreDialogVisible: boolean = false;
  restoreOptions: any = {
    targetPath: '/',
    includePaths: ['/'],
    excludePatterns: [],
    overwriteExisting: false,
    verify: true
  };
  restoreInProgress: boolean = false;
  restoreProgress: number = 0;
  restoreOperationId: string = '';
  
  // Active restore operations
  activeRestores: any[] = [];

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Get tenant name directly from authService
    this.tenantName = this.authService.getTenantName() || '';
    
    // Get username directly from authService
    this.username = this.authService.getUsername() || '';
    
    // Load data
    this.loadRepositories();
    this.loadSnapshots();
    this.loadPlans();
    this.loadActiveRestores();
  }
  
  loadRepositories(): void {
    this.apiService.get('backrest/repositories/').subscribe({
      next: (data: any) => {
        this.repositories = data as any[];
        console.log('Repositories loaded:', this.repositories);
      },
      error: (err: any) => {
        console.error('Failed to load repositories:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load repositories'
        });
      }
    });
  }
  
  loadPlans() {
    this.apiService.get('backrest/plans/').subscribe({
      next: (data) => {
        this.plans = data as any[];
        console.log('Plans loaded:', this.plans);
      },
      error: (err) => {
        console.error('Failed to load plans:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load plans'
        });
      }
    });
  }
  
  loadSnapshots() {
    this.loading = true;
    this.apiService.get('backrest/snapshots/').subscribe({
      next: (data) => {
        this.snapshots = data as any[];
        this.applyFilters();
        this.loading = false;
        console.log('Snapshots loaded:', this.snapshots);
      },
      error: (err) => {
        console.error('Failed to load snapshots:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load snapshots'
        });
        this.loading = false;
      }
    });
  }
  
  loadActiveRestores() {
    this.apiService.get('backrest/operations/?operation_type=restore&status=running').subscribe({
      next: (data) => {
        this.activeRestores = data as any[];
        console.log('Active restores:', this.activeRestores);
        
        // If we have active restores, poll for status updates
        if (this.activeRestores.length > 0) {
          this.pollRestoreStatus();
        }
      },
      error: (err) => {
        console.error('Failed to load active restores:', err);
      }
    });
  }
  
  applyFilters() {
    this.filteredSnapshots = this.snapshots.filter(snapshot => {
      // Repository filter
      if (this.filterRepository && snapshot.repository !== this.filterRepository.id) {
        return false;
      }
      
      // Plan filter (if the snapshot has a plan attribute)
      if (this.filterPlan && snapshot.plan !== this.filterPlan.id) {
        return false;
      }
      
      // Date range filter
      if (this.filterDateRange && this.filterDateRange.length === 2) {
        const snapshotDate = new Date(snapshot.time);
        if (snapshotDate < this.filterDateRange[0] || snapshotDate > this.filterDateRange[1]) {
          return false;
        }
      }
      
      // Tags filter
      if (this.filterTags.length > 0) {
        if (!snapshot.tags || !Array.isArray(snapshot.tags)) {
          return false;
        }
        
        // Check if snapshot has all the filter tags
        return this.filterTags.every(tag => snapshot.tags.includes(tag));
      }
      
      return true;
    });
  }
  
  resetFilters() {
    this.filterRepository = null;
    this.filterPlan = null;
    this.filterDateRange = [];
    this.filterTags = [];
    this.applyFilters();
  }
  
  addFilterTag() {
    if (this.filterTagInput && !this.filterTags.includes(this.filterTagInput)) {
      this.filterTags.push(this.filterTagInput);
      this.filterTagInput = '';
      this.applyFilters();
    }
  }
  
  removeFilterTag(tag: string) {
    this.filterTags = this.filterTags.filter(t => t !== tag);
    this.applyFilters();
  }
  
  showRestoreDialog(snapshot: any) {
    this.selectedSnapshot = snapshot;
    
    // Prepare default restore options
    this.restoreOptions = {
      targetPath: '/',
      includePaths: ['/'],
      excludePatterns: [],
      overwriteExisting: false,
      verify: true
    };
    
    this.restoreDialogVisible = true;
  }
  
  addIncludePath() {
    this.restoreOptions.includePaths.push('');
  }
  
  removeIncludePath(index: number) {
    this.restoreOptions.includePaths.splice(index, 1);
  }
  
  addExcludePattern() {
    this.restoreOptions.excludePatterns.push('');
  }
  
  removeExcludePattern(index: number) {
    this.restoreOptions.excludePatterns.splice(index, 1);
  }
  
  initiateRestore() {
    if (!this.selectedSnapshot) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No snapshot selected'
      });
      return;
    }
    
    this.confirmationService.confirm({
      message: `Are you sure you want to restore from snapshot "${this.selectedSnapshot.snapshot_id || this.selectedSnapshot.id}"? This may overwrite existing files at the target location.`,
      accept: () => {
        this.restoreInProgress = true;
        this.restoreProgress = 0;
        
        // Clean up includePaths and excludePatterns
        const includePaths = this.restoreOptions.includePaths.filter((path: string) => path.trim() !== '');
        const excludePatterns = this.restoreOptions.excludePatterns.filter((pattern: string) => pattern.trim() !== '');
        
        const restoreData = {
          snapshot_id: this.selectedSnapshot.snapshot_id || this.selectedSnapshot.id,
          repository_id: this.selectedSnapshot.repository_id || this.selectedSnapshot.repository,
          target_path: this.restoreOptions.targetPath,
          include_paths: includePaths.length > 0 ? includePaths : ['/'],
          exclude_patterns: excludePatterns,
          overwrite_existing: this.restoreOptions.overwriteExisting,
          verify: this.restoreOptions.verify
        };
        
        console.log('Initiating restore with data:', restoreData);
        
        this.apiService.post(`backrest/snapshots/${this.selectedSnapshot.id}/restore/`, restoreData).subscribe({
          next: (response) => {
            this.restoreOperationId = (response as any).operation_id;
            
            this.messageService.add({
              severity: 'info',
              summary: 'Restore Initiated',
              detail: 'Your restore operation has started. You can track its progress on this page.'
            });
            
            // Start polling for status
            this.pollRestoreStatus();
            
            // Close the dialog but keep progress visible
            this.restoreDialogVisible = false;
            
            // Reload active restores
            this.loadActiveRestores();
          },
          error: (err) => {
            this.restoreInProgress = false;
            console.error('Failed to initiate restore:', err);
            this.messageService.add({
              severity: 'error',
              summary: 'Restore Failed',
              detail: err.error?.detail || 'Failed to initiate restore operation'
            });
          }
        });
      }
    });
  }
  
  pollRestoreStatus() {
    // First, sync operations to get latest status
    this.apiService.post('backrest/operations/sync_operations/', {}).subscribe({
      next: () => {
        // Now get active restores again
        this.apiService.get('backrest/operations/?operation_type=restore').subscribe({
          next: (data) => {
            this.activeRestores = data as any[];
            
            // Check if our operation is still running
            if (this.restoreOperationId) {
              const currentOp = this.activeRestores.find(op => op.operation_id === this.restoreOperationId);
              
              if (currentOp) {
                if (currentOp.status === 'running') {
                  // Still running, update progress if available
                  if (currentOp.stats && currentOp.stats.progress) {
                    this.restoreProgress = currentOp.stats.progress;
                  }
                  
                  // Poll again in 2 seconds
                  setTimeout(() => this.pollRestoreStatus(), 2000);
                } else if (currentOp.status === 'completed') {
                  // Restore completed
                  this.restoreProgress = 100;
                  this.restoreInProgress = false;
                  
                  this.messageService.add({
                    severity: 'success',
                    summary: 'Restore Complete',
                    detail: 'Your files have been successfully restored.'
                  });
                  
                  // Clear operation ID
                  this.restoreOperationId = '';
                } else if (currentOp.status === 'failed') {
                  // Restore failed
                  this.restoreInProgress = false;
                  
                  this.messageService.add({
                    severity: 'error',
                    summary: 'Restore Failed',
                    detail: currentOp.error || 'The restore operation failed. Please check logs for details.'
                  });
                  
                  // Clear operation ID
                  this.restoreOperationId = '';
                }
              }
            }
            
            // If we have any active restore operations, continue polling
            const runningRestores = this.activeRestores.filter(op => op.status === 'running');
            if (runningRestores.length > 0) {
              setTimeout(() => this.pollRestoreStatus(), 2000);
            }
          },
          error: (err) => {
            console.error('Failed to load active restores:', err);
            // Retry polling in case of error
            setTimeout(() => this.pollRestoreStatus(), 5000);
          }
        });
      }
    });
  }
  
  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString();
  }
  
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  getSnapshotSize(snapshot: any): string {
    let size = 0;
    
    // Try to extract size from different properties based on your data structure
    if (snapshot.summary && snapshot.summary.totalSize) {
      size = snapshot.summary.totalSize;
    } else if (snapshot.size_bytes) {
      size = snapshot.size_bytes;
    } else if (snapshot.size) {
      size = snapshot.size;
    }
    
    return this.formatBytes(size);
  }
  
  getRepositoryName(repoId: number): string {
    const repo = this.repositories.find(r => r.id === repoId);
    return repo ? repo.name : `Repository #${repoId}`;
  }
  
  getPlanName(planId: number): string {
    const plan = this.plans.find(p => p.id === planId);
    return plan ? plan.name : `Plan #${planId}`;
  }

  // Clear and explicit logout function
  logout(): void {
    console.log('Logout method called');
    
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/login']);
      },
      error: (err) => {
        console.error('Logout failed:', err);
        this.router.navigate(['/login']); // Navigate anyway
      }
    });
  }
}