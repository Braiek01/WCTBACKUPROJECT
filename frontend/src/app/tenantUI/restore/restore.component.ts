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
import { CalendarModule } from 'primeng/calendar';

import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressBarModule } from 'primeng/progressbar';

import { MultiSelectModule } from 'primeng/multiselect';
import { ChipModule } from 'primeng/chip';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { SplitButtonModule } from 'primeng/splitbutton';
import { DividerModule } from 'primeng/divider';

@Component({
  selector: 'app-restore',
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
  templateUrl: './restore.component.html',
})
export class RestoreComponent implements OnInit {
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

  // File browser properties
  fileBrowserVisible: boolean = false;
  currentSnapshotFiles: any[] = [];
  selectedFiles: any[] = [];
  loadingFiles: boolean = false;
  currentPath: string = '/';
  pathHistory: string[] = ['/'];
  selectedSnapshotForBrowsing: any = null;

  // File selection properties
  selectAllFiles: boolean = false;
  
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
  console.log('Loading snapshots...');
  
  // First, we need to get all repositories, then load snapshots from each
  this.loadRepositories();
  
  // Load snapshots from all repositories
  this.loadAllSnapshots();
}

loadAllSnapshots() {
  if (this.repositories.length === 0) {
    // If repositories aren't loaded yet, wait and try again
    setTimeout(() => {
      if (this.repositories.length > 0) {
        this.loadAllSnapshots();
      } else {
        console.warn('No repositories found');
        this.loading = false;
      }
    }, 1000);
    return;
  }

  this.loading = true;
  const allSnapshots: any[] = [];
  let loadedRepos = 0;

  this.repositories.forEach((repo: any) => {
    // Use the correct endpoint format: repos/<repo_id>/snapshots/
    const repoId = repo.repository_id || repo.id;
    
    console.log(`Loading snapshots for repository: ${repoId}`);
    
    this.apiService.get(`backrest/repos/${repoId}/snapshots/`).subscribe({
      next: (data) => {
        console.log(`Snapshots for repo ${repoId}:`, data);
        
        // Handle different response formats
        let repoSnapshots = [];
        if (Array.isArray(data)) {
          repoSnapshots = data;
        } else if (
          typeof data === 'object' &&
          data !== null &&
          'snapshots' in data &&
          Array.isArray((data as any).snapshots)
        ) {
          repoSnapshots = (data as any).snapshots;
        } else if (
          typeof data === 'object' &&
          data !== null &&
          'results' in data &&
          Array.isArray((data as any).results)
        ) {
          repoSnapshots = (data.results as any[]);
        }
        
        // Add repository info to each snapshot
        repoSnapshots.forEach((snapshot: any) => {
          snapshot.repository = repo.id;
          snapshot.repository_name = repo.name;
          snapshot.repository_id = repoId;
        });
        
        allSnapshots.push(...repoSnapshots);
        loadedRepos++;
        
        // Check if all repositories have been loaded
        if (loadedRepos === this.repositories.length) {
          // Sort by time descending (newest first)
          allSnapshots.sort((a, b) => {
            const timeA = new Date(a.time || 0).getTime();
            const timeB = new Date(b.time || 0).getTime();
            return timeB - timeA;
          });
          
          this.snapshots = allSnapshots;
          console.log('All snapshots loaded:', this.snapshots);
          console.log('Total snapshots:', this.snapshots.length);
          
          this.applyFilters();
          this.loading = false;
        }
      },
      error: (err) => {
        console.error(`Failed to load snapshots for repo ${repoId}:`, err);
        loadedRepos++;
        
        // Continue even if one repo fails
        if (loadedRepos === this.repositories.length) {
          this.snapshots = allSnapshots;
          console.log('Snapshots loaded (with some errors):', this.snapshots);
          this.applyFilters();
          this.loading = false;
        }
      }
    });
  });

  // Handle case where no repositories exist
  if (this.repositories.length === 0) {
    this.snapshots = [];
    this.filteredSnapshots = [];
    this.loading = false;
  }
}
  
  loadActiveRestores() {
    // Use query parameters to filter for restore operations
    this.apiService.get('backrest/operations/?type=restore&status=running').subscribe({
      next: (data: any) => {
        console.log('Active restores:', data);
        this.activeRestores = Array.isArray(data) ? data : (data.results || []);
      },
      error: (err) => {
        console.error('Failed to load active restores:', err);
        this.activeRestores = [];
      }
    });
  }
  
  applyFilters() {
    console.log('Applying filters...');
    console.log('Filter repository:', this.filterRepository);
    console.log('Filter plan:', this.filterPlan);
    console.log('Filter tags:', this.filterTags);
    console.log('Original snapshots count:', this.snapshots.length);
    
    this.filteredSnapshots = this.snapshots.filter(snapshot => {
      console.log('Processing snapshot:', snapshot);
      
      // Repository filter
      if (this.filterRepository && snapshot.repository !== this.filterRepository.id) {
        console.log(`Filtered out by repository: ${snapshot.repository} !== ${this.filterRepository.id}`);
        return false;
      }
      
      // Plan filter (if the snapshot has a plan attribute)
      if (this.filterPlan && snapshot.plan !== this.filterPlan.id) {
        console.log(`Filtered out by plan: ${snapshot.plan} !== ${this.filterPlan.id}`);
        return false;
      }
      
      // Date range filter
      if (this.filterDateRange && this.filterDateRange.length === 2) {
        const snapshotDate = new Date(snapshot.time);
        if (snapshotDate < this.filterDateRange[0] || snapshotDate > this.filterDateRange[1]) {
          console.log('Filtered out by date range');
          return false;
        }
      }
      
      // Tags filter
      if (this.filterTags.length > 0) {
        if (!snapshot.tags || !Array.isArray(snapshot.tags)) {
          console.log('Filtered out: no tags on snapshot');
          return false;
        }
        
        // Check if snapshot has all the filter tags
        const hasAllTags = this.filterTags.every(tag => snapshot.tags.includes(tag));
        if (!hasAllTags) {
          console.log('Filtered out by tags');
          return false;
        }
      }
      
      console.log('Snapshot passed all filters');
      return true;
    });
    
    console.log('Filtered snapshots count:', this.filteredSnapshots.length);
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
  
  // Update the restore method to call the correct API
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
        
        // Call the correct restore endpoint - matches your URL pattern
        this.apiService.post('backrest/restore/', restoreData).subscribe({
          next: (response) => {
            this.restoreOperationId = (response as any).operation_id || (response as any).operationId;
            
            this.messageService.add({
              severity: 'info',
              summary: 'Restore Initiated',
              detail: 'Your restore operation has started. You can track its progress on this page.'
            });
            
            // Start polling for status if we have an operation ID
            if (this.restoreOperationId) {
              this.pollRestoreStatus();
            }
            
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
              detail: err.error?.detail || err.error?.message || 'Failed to initiate restore operation'
            });
          }
        });
      }
    });
  }
  
  pollRestoreStatus() {
    if (!this.restoreOperationId) return;
    
    const checkStatus = () => {
      // Use the operations endpoint to check status
      this.apiService.get(`backrest/operations/?operation_id=${this.restoreOperationId}`).subscribe({
        next: (response: any) => {
          const operations = Array.isArray(response) ? response : (response.results || []);
          const operation = operations.find((op: any) => op.operation_id === this.restoreOperationId);
          
          if (operation) {
            if (operation.status === 'running') {
              this.restoreProgress = operation.progress || 0;
              setTimeout(checkStatus, 2000); // Check every 2 seconds
            } else if (operation.status === 'completed') {
              this.restoreProgress = 100;
              this.restoreInProgress = false;
              this.messageService.add({
                severity: 'success',
                summary: 'Restore Completed',
                detail: 'Files have been successfully restored'
              });
              this.loadActiveRestores(); // Refresh active restores
            } else if (operation.status === 'failed') {
              this.restoreInProgress = false;
              this.messageService.add({
                severity: 'error',
                summary: 'Restore Failed',
                detail: operation.error || 'Restore operation failed'
              });
            }
          }
        },
        error: (err) => {
          console.error('Failed to check restore progress:', err);
          // Continue checking unless it's a persistent error
          if (this.restoreInProgress) {
            setTimeout(checkStatus, 5000); // Check less frequently on error
          }
        }
      });
    };

    // Start monitoring after a short delay
    setTimeout(checkStatus, 2000);
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

  // Add these new methods for file browsing
  
  showFileBrowser(snapshot: any) {
    this.selectedSnapshotForBrowsing = snapshot;
    this.currentPath = '/';
    this.pathHistory = ['/'];
    this.selectedFiles = [];
    this.fileBrowserVisible = true;
    this.loadSnapshotFiles('/');
  }

  loadSnapshotFiles(path: string) {
    if (!this.selectedSnapshotForBrowsing) return;
    
    this.loadingFiles = true;
    
    const requestData = {
      repoId: this.selectedSnapshotForBrowsing.repository_id || this.selectedSnapshotForBrowsing.repository,
      snapshotId: this.selectedSnapshotForBrowsing.snapshot_id || this.selectedSnapshotForBrowsing.id,
      path: path
    };

    console.log('Loading snapshot files with request:', requestData);

    // Use the ViewSet custom action for file listing
    this.apiService.post('backrest/snapshots/list_files/', requestData).subscribe({
      next: (response: any) => {
        console.log('Files response:', response);
        this.currentSnapshotFiles = this.processFileList(response.entries || []);
        this.loadingFiles = false;
      },
      error: (err) => {
        console.error('Failed to load snapshot files:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load snapshot files'
        });
        this.loadingFiles = false;
      }
    });
  }

  processFileList(entries: any[]): any[] {
    return entries.map(entry => ({
      ...entry,
      isDirectory: entry.type === 'dir',
      isFile: entry.type === 'file',
      selected: false,
      displaySize: this.formatBytes(entry.size || 0),
      displayDate: this.formatDate(entry.mtime || new Date().toISOString())
    })).sort((a, b) => {
      // Sort directories first, then files
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  navigateToDirectory(entry: any) {
    if (!entry.isDirectory) return;
    
    const newPath = this.joinPaths(this.currentPath, entry.name);
    this.currentPath = newPath;
    this.pathHistory.push(newPath);
    this.loadSnapshotFiles(newPath);
  }

  navigateToPath(path: string) {
    this.currentPath = path;
    // Update path history
    const pathIndex = this.pathHistory.indexOf(path);
    if (pathIndex !== -1) {
      this.pathHistory = this.pathHistory.slice(0, pathIndex + 1);
    } else {
      this.pathHistory.push(path);
    }
    this.loadSnapshotFiles(path);
  }

  navigateUp() {
    if (this.currentPath === '/') return;
    
    const parentPath = this.getParentPath(this.currentPath);
    this.navigateToPath(parentPath);
  }

  getParentPath(path: string): string {
    if (path === '/') return '/';
    const parts = path.split('/').filter(p => p);
    if (parts.length <= 1) return '/';
    return '/' + parts.slice(0, -1).join('/');
  }

  joinPaths(basePath: string, fileName: string): string {
    if (basePath === '/') return '/' + fileName;
    return basePath + '/' + fileName;
  }

  getBreadcrumbParts(): string[] {
    if (this.currentPath === '/') return ['/'];
    return ['/'].concat(this.currentPath.split('/').filter(p => p));
  }

  getBreadcrumbPath(index: number): string {
    const parts = this.getBreadcrumbParts();
    if (index === 0) return '/';
    return '/' + parts.slice(1, index + 1).join('/');
  }

  toggleFileSelection(file: any) {
    file.selected = !file.selected;
    this.updateSelectedFiles();
  }

  toggleSelectAll() {
    this.selectAllFiles = !this.selectAllFiles;
    this.currentSnapshotFiles.forEach(file => {
      file.selected = this.selectAllFiles;
    });
    this.updateSelectedFiles();
  }

  updateSelectedFiles() {
    // Get all selected files from current view
    const currentSelected = this.currentSnapshotFiles
      .filter(file => file.selected)
      .map(file => ({
        ...file,
        fullPath: this.joinPaths(this.currentPath, file.name)
      }));

    // Remove files from current path from selection
    this.selectedFiles = this.selectedFiles.filter(
      selected => !selected.fullPath.startsWith(this.currentPath)
    );

    // Add currently selected files
    this.selectedFiles.push(...currentSelected);

    // Update select all checkbox state
    this.selectAllFiles = this.currentSnapshotFiles.length > 0 && 
                         this.currentSnapshotFiles.every(file => file.selected);
  }

  clearFileSelection() {
    this.selectedFiles = [];
    this.currentSnapshotFiles.forEach(file => file.selected = false);
    this.selectAllFiles = false;
  }

  restoreSelectedFiles() {
    if (this.selectedFiles.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'No Files Selected',
        detail: 'Please select files to restore'
      });
      return;
    }

    // Prepare restore options with selected files
    this.restoreOptions = {
      targetPath: '/home/restored_files', // Default target
      includePaths: this.selectedFiles.map(file => file.fullPath),
      excludePatterns: [],
      overwriteExisting: false,
      verify: true
    };

    // Close file browser and show restore dialog
    this.fileBrowserVisible = false;
    this.selectedSnapshot = this.selectedSnapshotForBrowsing;
    this.restoreDialogVisible = true;
  }

  restoreEntireSnapshot(snapshot: any) {
    this.selectedSnapshot = snapshot;
    this.restoreOptions = {
      targetPath: '/home/restored_files',
      includePaths: ['/'],
      excludePatterns: [],
      overwriteExisting: false,
      verify: true
    };
    this.restoreDialogVisible = true;
  }

  getFileIcon(entry: any): string {
    if (entry.isDirectory) return 'pi pi-folder';
    
    const ext = entry.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'txt': case 'log': case 'md': return 'pi pi-file-text';
      case 'pdf': return 'pi pi-file-pdf';
      case 'jpg': case 'jpeg': case 'png': case 'gif': return 'pi pi-image';
      case 'mp3': case 'wav': case 'flac': return 'pi pi-volume-up';
      case 'mp4': case 'avi': case 'mkv': return 'pi pi-video';
      case 'zip': case 'tar': case 'gz': case '7z': return 'pi pi-file-archive';
      case 'js': case 'ts': case 'html': case 'css': case 'py': case 'java': return 'pi pi-code';
      default: return 'pi pi-file';
    }
  }


}
