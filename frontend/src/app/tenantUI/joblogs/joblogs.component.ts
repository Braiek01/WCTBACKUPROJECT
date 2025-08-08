import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { BackrestService } from '../../core/services/backrest.service';

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
import { TabViewModule } from 'primeng/tabview';
import { ChartModule } from 'primeng/chart';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

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
    TextareaModule,
    TabViewModule,
    ChartModule,
    ProgressSpinnerModule
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
  logs: any[] = [];
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
    { label: 'Index', value: 'index' },
    { label: 'Restore', value: 'restore' },
    { label: 'Maintenance', value: 'maintenance' },
    { label: 'Cleanup', value: 'cleanup' },
    { label: 'Stats', value: 'stats' },
    { label: 'Check', value: 'check' },
    { label: 'Prune', value: 'prune' }
  ];

  // Add new properties for dashboard data
  dashboardData: any = null;
  operationsData: any[] = [];
  logAnalysisData: any = null;
  
  // Chart data
  operationsByTypeData: any;
  operationsByStatusData: any;
  operationsByDateData: any;
  
  // Tab state
  activeTabIndex: number = 0;

  // New property for filtered operations
  filteredOperations: any[] = [];
  
  // Property to indicate if debug is available in details dialog
  debugAvailable: boolean = false;
  
  // Track retry attempts to prevent infinite loops
  private retryAttempts: number = 0;
  private maxRetryAttempts: number = 2;
  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private route: ActivatedRoute,
    private router: Router,
    private backrestService: BackrestService
  ) {}


  ngOnInit(): void {
    // Get tenant name and username
    this.tenantName = this.authService.getTenantName() || '';
    this.username = this.authService.getUsername() || '';
    
    // Check if we have a valid token
    const token = this.authService.getAccessToken();
    if (!token) {
      this.messageService.add({
        severity: 'error',
        summary: 'Authentication Error',
        detail: 'Not authenticated. Please login again.',
        life: 5000
      });
      
      // Redirect to login after a short delay
      setTimeout(() => {
        this.router.navigate(['/login']);
      }, 2000);
      return;
    }
    
    // Load job logs
    this.loadJobLogs();
    
    // Auto-refresh logs every 30 seconds
    setInterval(() => {
      if (!this.detailsDialogVisible) { // Don't refresh if viewing details
        this.loadJobLogs();
      }
    }, 30000);
    
    // Load all data sources
    this.loadDashboard();
    this.loadStructuredOperations();
    // Only load analysis when needed
  }

  // Add missing logout method
  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  // Add missing methods
  loadDashboard(): void {
    // Set loading state
    this.loading = true;
    
    this.apiService.get('backrest/operations/dashboard/').subscribe({
      next: (response: any) => {
        console.log('Dashboard data loaded:', response);
        
        // Store the dashboard data
        this.dashboardData = response;
        
        // Prepare chart data after dashboard data is loaded
        this.prepareChartData();
        
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading dashboard:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Dashboard Error',
          detail: 'Failed to load dashboard data',
          life: 5000
        });
        
        // Create empty dashboard data to prevent further errors
        this.dashboardData = {
          by_type: {},
          by_status: { completed: 0, failed: 0, running: 0, pending: 0 },
          by_date: {}
        };
        
        // Still prepare charts with empty data
        this.prepareChartData();
        
        this.loading = false;
      }
    });
  }
// Fix the dashboard data calculation
loadDashboardData(): void {
  if (this.logs.length === 0) {
    this.dashboardData = {
      total_operations: 0,
      by_status: { completed: 0, failed: 0, running: 0 },
      by_type: {},
      by_plan: {},
      avg_duration_seconds: 0,
      recent_failures: []
    };
    return;
  }

  // Calculate total operations
  const totalOps = this.logs.length;
  
  // Group by status
  const byStatus = this.logs.reduce((acc: any, log: any) => {
    const status = log.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  
  // Group by type
  const byType = this.logs.reduce((acc: any, log: any) => {
    const type = log.type || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  
  // Group by plan
  const byPlan = this.logs.reduce((acc: any, log: any) => {
    const plan = log.plan || 'N/A';
    acc[plan] = (acc[plan] || 0) + 1;
    return acc;
  }, {});
  
  // Calculate average duration (only for completed operations with valid duration)
  const completedOpsWithDuration = this.logs.filter(log => 
    log.status === 'completed' && log.duration && log.duration > 0
  );
  
  const avgDuration = completedOpsWithDuration.length > 0 ? 
    completedOpsWithDuration.reduce((sum, log) => sum + log.duration, 0) / completedOpsWithDuration.length : 0;
  
  // Get recent failures
  const recentFailures = this.logs
    .filter(log => log.status === 'failed' || log.error)
    .slice(0, 5)
    .map(log => ({
      type: log.type,
      repository: log.repository,
      plan: log.plan,
      started_at: log.startTime,
      error: log.error || log.message
    }));

  this.dashboardData = {
    total_operations: totalOps,
    by_status: byStatus,
    by_type: byType,
    by_plan: byPlan,
    avg_duration_seconds: avgDuration, // This is now in seconds, not minutes
    recent_failures: recentFailures
  };
  
  // Update chart data
  this.updateChartData();
}

// Update chart data with proper colors
updateChartData(): void {
  if (!this.dashboardData) return;
  
  // Operations by Type with colors
  this.operationsByTypeData = {
    labels: Object.keys(this.dashboardData.by_type),
    datasets: [{
      data: Object.values(this.dashboardData.by_type),
      backgroundColor: [
        '#3B82F6', // blue for backup
        '#10B981', // green for restore  
        '#F59E0B', // amber for prune
        '#06B6D4', // cyan for check
        '#EAB308', // yellow for index
        '#8B5CF6', // purple for maintenance
        '#F97316', // orange for cleanup
        '#6366F1', // indigo for stats
        '#10B981', // emerald for init
        '#EF4444', // red for expire
        '#14B8A6', // teal for verify
        '#6B7280'  // gray for others
      ]
    }]
  };
  
  // Operations by Status with colors
  this.operationsByStatusData = {
    labels: Object.keys(this.dashboardData.by_status),
    datasets: [{
      data: Object.values(this.dashboardData.by_status),
      backgroundColor: [
        '#10B981', // green for completed
        '#EF4444', // red for failed
        '#3B82F6', // blue for running
        '#F59E0B', // amber for pending
        '#6B7280'  // gray for unknown
      ]
    }]
  };
}


loadJobLogs(): void {
  this.loading = true;
  this.logs = [];
  
  console.log('Starting to load job logs from all sources...');
  
  // Load server configurations first
  this.backrestService.getServers().subscribe({
    next: (serverResponse: any) => {
      console.log('Server configurations:', serverResponse);
      const servers = serverResponse.servers || serverResponse.results || [];
      
      // Load ALL THREE data sources in parallel
      const snapshotPromise = this.loadSnapshotsAsOperations(servers);
      const operationsPromise = this.loadStructuredOperations(servers);
      const rawLogsPromise = this.loadRawLogsAsOperations(servers); // NEW: Add raw logs
      
      Promise.all([snapshotPromise, operationsPromise, rawLogsPromise]).then(([snapshots, operations, rawLogOps]) => {
        console.log('Snapshots loaded:', snapshots.length);
        console.log('Structured operations loaded:', operations.length);
        console.log('Raw log operations loaded:', rawLogOps.length);
        
        // Combine ALL THREE data sources
        const allOperations = [...snapshots, ...operations, ...rawLogOps];
        
        // Remove duplicates (prioritize snapshots for backups, keep unique operations)
        const uniqueOperations = this.removeDuplicateOperations(allOperations);
        
        // Sort by start time (newest first)
        uniqueOperations.sort((a, b) => {
          const timeA = new Date(a.startTime).getTime();
          const timeB = new Date(b.startTime).getTime();
          return timeB - timeA;
        });
        
        this.logs = uniqueOperations;
        this.filteredLogs = [...this.logs];
        this.jobLogs = [...this.logs];
        
        // Update dashboard data
        this.loadDashboardData();
        
        this.loading = false;
        
        console.log('Total unique operations:', uniqueOperations.length);
        console.log('Operation types found:', [...new Set(uniqueOperations.map(op => op.type))]);
      });
    },
    error: (error) => {
      console.error('Error loading server configurations:', error);
      // Fallback to load without server configs
      this.loadJobLogsWithoutServerConfigs();
    }
  });
}
private loadJobLogsWithoutServerConfigs(): void {
  const snapshotPromise = this.loadSnapshotsAsOperations([]);
  const operationsPromise = this.loadStructuredOperations([]);
  
  Promise.all([snapshotPromise, operationsPromise]).then(([snapshots, operations]) => {
    const allOperations = [...snapshots, ...operations];
    const uniqueOperations = this.removeDuplicateOperations(allOperations);
    
    uniqueOperations.sort((a, b) => {
      const timeA = new Date(a.startTime).getTime();
      const timeB = new Date(b.startTime).getTime();
      return timeB - timeA;
    });
    
    this.logs = uniqueOperations;
    this.filteredLogs = [...this.logs];
    this.jobLogs = [...this.logs];
    this.loadDashboardData();
    this.loading = false;
  });
}
private findServerByIdentifiers(servers: any[], hostname: string, repoId: string, ipAddress?: string): any {
  if (!servers || servers.length === 0) return null;
  
  // Try multiple matching strategies
  let server = servers.find(s => 
    s.hostname === hostname || 
    s.name === hostname ||
    s.display_name === hostname ||
    s.server_name === hostname
  );
  
  // Try by IP address if provided
  if (!server && ipAddress) {
    server = servers.find(s => 
      s.ip_address === ipAddress ||
      s.host === ipAddress
    );
  }
  
  // Try by repository assignment
  if (!server && repoId) {
    server = servers.find(s => 
      (s.repositories && s.repositories.includes(repoId)) ||
      (s.repository_ids && s.repository_ids.includes(repoId))
    );
  }
  
  // Try partial matches as last resort
  if (!server && hostname) {
    server = servers.find(s => 
      hostname.includes(s.hostname) ||
      s.hostname.includes(hostname) ||
      (s.ip_address && hostname.includes(s.ip_address))
    );
  }
  
  return server;
}
private loadSnapshotsAsOperations(servers: any[] = []): Promise<any[]> {
  return new Promise((resolve) => {
    this.backrestService.getRepositories().subscribe({
      next: (repoResponse: any) => {
        const repositories = repoResponse.repositories || [];
        
        if (repositories.length === 0) {
          console.log('No repositories found for snapshots');
          resolve([]);
          return;
        }
        
        const snapshotPromises = repositories.map((repo: any) => {
          return new Promise<any[]>((resolveRepo) => {
            this.backrestService.getSnapshots(repo.repository_id).subscribe({
              next: (snapResponse: any) => {
                const snapshots = snapResponse.snapshots || [];
                const snapshotsWithRepo = snapshots.map((snapshot: any) => ({
                  ...snapshot,
                  repository_id: repo.repository_id,
                  repository_name: repo.name || repo.repository_id,
                  // IMPORTANT FIX: Find matching server configuration
                  serverConfig: this.findServerByIdentifiers(
                    servers, 
                    snapshot.hostname, 
                    repo.repository_id,
                    snapshot.ip_address // Pass IP if available
                  )
                }));
                resolveRepo(snapshotsWithRepo);
              },
              error: (error) => {
                console.error(`Error loading snapshots for repo ${repo.repository_id}:`, error);
                resolveRepo([]);
              }
            });
          });
        });
        
        Promise.all(snapshotPromises).then((allSnapshots) => {
          const flatSnapshots = allSnapshots.flat();
          const operations = this.processSnapshotsIntoOperations(flatSnapshots);
          resolve(operations);
        });
      },
      error: (error) => {
        console.error('Error loading repositories:', error);
        resolve([]);
      }
    });
  });
}

private loadStructuredOperations(servers: any[] = []): Promise<any[]> {
  return new Promise((resolve) => {
    this.apiService.get('backrest/operations/structured/').subscribe({
      next: (response: any) => {
        if (response && response.results) {
          console.log('Structured operations response:', response);
          const operations = response.results.map((op: any) => this.processStructuredOperation(op));
          resolve(operations);
        } else {
          console.log('No structured operations found');
          resolve([]);
        }
      },
      error: (error) => {
        console.error('Error loading structured operations:', error);
        resolve([]);
      }
    });
  });
}
private processStructuredOperation(op: any, servers: any[] = []): any {
  const startTime = new Date(op.started_at);
  const endTime = op.completed_at ? new Date(op.completed_at) : null;
  const duration = endTime ? (endTime.getTime() - startTime.getTime()) / 1000 : 0;
  
  // Find server configuration for consistent naming
  const serverConfig = this.findServerByHostnameOrRepo(servers, op.hostname || op.server_name, op.repository_id);
  const serverName = serverConfig ? 
    (serverConfig.display_name || serverConfig.name || serverConfig.hostname) :
    (op.hostname || op.server_name || 'Unknown Server');
  
  return {
    id: op.id,
    type: op.type || 'unknown',
    startTime: startTime,
    endTime: endTime,
    duration: duration,
    status: op.status || 'unknown',
    repository: op.repository || 'Unknown',
    repository_id: op.repository_id,
    repository_name: op.repository || op.repository_name,
    hostname: serverName, // Use consistent server name
    server_name: serverName, // Use consistent server name
    plan: op.plan || 'N/A',
    message: op.message || this.generateOperationMessage(op),
    level: op.level || 'info',
    error: op.error || null,
    // Mark as structured operation (not snapshot)
    isStructuredOperation: true,
    originalData: op,
    serverConfig: serverConfig // Keep reference for details
  };
}
private generateOperationMessage(op: any): string {
  switch (op.type?.toLowerCase()) {
    case 'index':
      return `Index operation for repository ${op.repository || 'unknown'}`;
    case 'maintenance':
      return `Maintenance operation - ${op.message || 'system maintenance'}`;
    case 'cleanup':
      return `Cleanup operation for repository ${op.repository || 'unknown'}`;
    case 'stats':
      return `Statistics calculation for repository ${op.repository || 'unknown'}`;
    case 'check':
      return `Repository check for ${op.repository || 'unknown'}`;
    case 'prune':
      return `Prune operation for repository ${op.repository || 'unknown'}`;
    default:
      return op.message || `${op.type || 'Unknown'} operation`;
  }
}

// Remove duplicate operations (prefer snapshots for backups, keep others)
private removeDuplicateOperations(operations: any[]): any[] {
  const seen = new Set<string>();
  const unique: any[] = [];
  
  // Sort by priority: snapshots > structured > raw logs
  operations.sort((a, b) => {
    if (a.snapshotData && !b.snapshotData) return -1;
    if (!a.snapshotData && b.snapshotData) return 1;
    if (a.isStructuredOperation && !b.isStructuredOperation && !b.snapshotData) return -1;
    if (!a.isStructuredOperation && b.isStructuredOperation && !a.snapshotData) return 1;
    return 0;
  });
  
  for (const op of operations) {
    let key = '';
    
    if (op.type === 'backup' && op.plan && op.startTime) {
      // For backup operations, use plan + time (rounded to minute)
      const timeKey = new Date(op.startTime).toISOString().slice(0, 16);
      key = `backup-${op.plan}-${timeKey}`;
    } else if (['index', 'stats', 'maintenance'].includes(op.type) && op.repository && op.startTime) {
      // For system operations, use type + repository + time (rounded to hour)
      const timeKey = new Date(op.startTime).toISOString().slice(0, 13);
      key = `${op.type}-${op.repository}-${timeKey}`;
    } else if (op.id) {
      // For other operations, use the actual ID
      key = op.id;
    } else {
      // Fallback: use type + timestamp
      key = `${op.type}-${new Date(op.startTime).getTime()}`;
    }
    
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(op);
    } else {
      console.log(`Filtered duplicate operation: ${key}`);
    }
  }
  
  return unique;
}
processSnapshotsIntoOperations(snapshots: any[]): any[] {
  const operations: any[] = [];
  
  snapshots.sort((a, b) => {
    const timeA = parseInt(a.unixTimeMs || '0');
    const timeB = parseInt(b.unixTimeMs || '0');
    return timeB - timeA;
  });
  
  snapshots.forEach((snapshot: any) => {
    if (!snapshot.id || !snapshot.unixTimeMs) return;
    
    const startTime = new Date(parseInt(snapshot.unixTimeMs));
    let endTime = new Date(startTime);
    let duration = 0;
    
    if (snapshot.summary && snapshot.summary.totalDuration) {
      duration = parseFloat(snapshot.summary.totalDuration);
      endTime = new Date(startTime.getTime() + (duration * 1000));
    }
    
    let planName = 'Unknown';
    let operationType = 'backup';
    
    if (snapshot.tags && snapshot.tags.length > 0) {
      const planTag = snapshot.tags.find((tag: string) => tag.startsWith('plan:'));
      if (planTag) {
        planName = planTag.replace('plan:', '');
      }
    }
    
    let status = 'completed';
    if (!snapshot.summary || Object.keys(snapshot.summary).length === 0) {
      status = 'failed';
    }
    
    // Use server configuration for consistent naming - FIX HERE
    const serverName = snapshot.serverConfig ? 
      (snapshot.serverConfig.display_name || snapshot.serverConfig.server_name || snapshot.serverConfig.name || snapshot.serverConfig.hostname) :
      (snapshot.hostname || 'Unknown Server');
    
    const operation = {
      id: snapshot.id,
      type: operationType,
      startTime: startTime,
      endTime: endTime,
      duration: duration,
      status: status,
      repository: snapshot.repository_name || snapshot.repository_id,
      repository_id: snapshot.repository_id,
      repository_name: snapshot.repository_name || snapshot.repository_id,
      hostname: serverName, // Use server display name instead of raw hostname
      server_name: serverName,
      plan: planName,
      message: this.generateSnapshotMessage(snapshot),
      level: 'info',
      error: null,
      snapshotData: snapshot,
      summary: this.processSnapshotSummary(snapshot.summary),
      serverConfig: snapshot.serverConfig
    };
    
    operations.push(operation);
  });
  
  return operations;
}

  // Helper method to generate a descriptive message for the snapshot
  private generateSnapshotMessage(snapshot: any): string {
    if (!snapshot.summary) {
      return 'Snapshot created';
    }
    
    const summary = snapshot.summary;
    let message = 'Backup completed';
    
    // Add file count info
    if (summary.totalFilesProcessed) {
      message += ` - ${parseInt(summary.totalFilesProcessed).toLocaleString()} files processed`;
    } else if (summary.filesNew) {
      message += ` - ${parseInt(summary.filesNew).toLocaleString()} new files`;
    }
    
    // Add size info
    if (summary.totalBytesProcessed) {
      const sizeGB = parseInt(summary.totalBytesProcessed) / (1024 * 1024 * 1024);
      message += `, ${sizeGB.toFixed(2)} GB processed`;
    }
    
    // Add duration info
    if (summary.totalDuration) {
      const duration = parseFloat(summary.totalDuration);
      if (duration < 60) {
        message += ` in ${duration.toFixed(1)}s`;
      } else {
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        message += ` in ${minutes}m ${seconds}s`;
      }
    }
    
    return message;
  }

  // Helper method to process snapshot summary into our expected format
  private processSnapshotSummary(snapshotSummary: any): any {
    if (!snapshotSummary) return {};
    
    // Convert string values to numbers and standardize field names
    const summary: any = {};
    
    // Map snapshot summary fields to our expected format
    if (snapshotSummary.filesNew) summary.files_new = parseInt(snapshotSummary.filesNew);
    if (snapshotSummary.filesChanged) summary.files_changed = parseInt(snapshotSummary.filesChanged);
    if (snapshotSummary.filesUnmodified) summary.files_unmodified = parseInt(snapshotSummary.filesUnmodified);
    if (snapshotSummary.dirsNew) summary.dirs_new = parseInt(snapshotSummary.dirsNew);
    if (snapshotSummary.dirsChanged) summary.dirs_changed = parseInt(snapshotSummary.dirsChanged);
    if (snapshotSummary.dirsUnmodified) summary.dirs_unmodified = parseInt(snapshotSummary.dirsUnmodified);
    if (snapshotSummary.dataBlobs) summary.data_blobs = parseInt(snapshotSummary.dataBlobs);
    if (snapshotSummary.treeBlobs) summary.tree_blobs = parseInt(snapshotSummary.treeBlobs);
    if (snapshotSummary.dataAdded) summary.data_added = parseInt(snapshotSummary.dataAdded);
    if (snapshotSummary.totalFilesProcessed) summary.total_files_processed = parseInt(snapshotSummary.totalFilesProcessed);
    if (snapshotSummary.totalBytesProcessed) summary.total_bytes_processed = parseInt(snapshotSummary.totalBytesProcessed);
    if (snapshotSummary.totalDuration) summary.total_duration = parseFloat(snapshotSummary.totalDuration);
    
    // Calculate efficiency if we have the data
    if (summary.total_bytes_processed && summary.data_added && summary.total_bytes_processed > 0) {
      summary.efficiency = ((summary.total_bytes_processed - summary.data_added) / summary.total_bytes_processed) * 100;
    }
    
    return summary;
  }

  // Rename the original loadJobLogs to use as fallback
  loadJobLogsOriginal(): void {
    this.loading = true;
    this.logs = [];
    
    // Try fetching operations directly first
    this.apiService.get('backrest/operations/').subscribe({
      next: (response: any) => {
        if (response && response.results && response.results.length > 0) {
          console.log('Found operations:', response.results.length);
          this.processOperations(response);
        } else {
          console.log('No operations found, trying to process logs into operations');
          // If no operations, try to get raw logs and convert them
          this.apiService.get('backrest/logs/').subscribe({
            next: (logsResponse: any) => {
              console.log('Raw logs response:', logsResponse);
              
              // Check if response is an array (direct logs) or has results property
              const logItems = Array.isArray(logsResponse) 
                ? logsResponse 
                : (logsResponse.results || []);
              
              if (logItems.length > 0) {
                console.log('Found logs:', logItems.length);
                this.logs = this.processLogsIntoOperations(logItems);
                this.filteredLogs = [...this.logs];
                this.jobLogs = [...this.logs];
              } else {
                console.log('No logs found');
            
              }
              this.loading = false;
            },
            error: (error) => {
              console.error('Error loading logs:', error);
       
              this.loading = false;
            }
          });
        }
      },
      error: (error) => {
        console.error('Error loading operations:', error);
   
        this.loading = false;
      }
    });
  }


  

  // Process raw logs into operation-like objects for display
 processLogsIntoOperations(logs: any[], servers: any[] = []): any[] {
  const operations: any[] = [];
  const operationMap = new Map();
  
  // Sort logs by timestamp (newest first)
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  for (const log of logs) {
    const logMessage = log.message || '';
    const loggerName = log.logger_name || '';
    const timestamp = new Date(log.timestamp);
    
    // Extract server information
    const serverConfig = this.findServerByHostnameOrRepo(servers, log.server?.hostname, '');
    const serverName = serverConfig ? 
      (serverConfig.display_name || serverConfig.name || serverConfig.hostname) :
      (log.server?.hostname || 'Unknown Server');
    
    // DETECT DIFFERENT OPERATION TYPES
    
    // 1. MAINTENANCE/GARBAGE COLLECTION operations
    if (logMessage.includes('collect garbage') || logMessage.includes('maintenance')) {
      const operationId = `maintenance-${timestamp.getTime()}-${Math.random().toString(36).substr(2, 5)}`;
      
      operations.push({
        id: operationId,
        type: 'maintenance',
        startTime: timestamp,
        endTime: timestamp,
        duration: 0,
        status: this.determineStatusFromLogLevel(log.level),
        repository: log.server?.hostname || 'System',
        repository_name: log.server?.hostname || 'System',
        hostname: serverName,
        server_name: serverName,
        plan: 'N/A',
        message: logMessage,
        level: log.level,
        error: log.error || null,
        isRawLogOperation: true
      });
    }
    
    // 2. INDEX operations
    else if (logMessage.includes('index snapshots') || loggerName.includes('index')) {
      const operationId = `index-${timestamp.getTime()}-${Math.random().toString(36).substr(2, 5)}`;
      
      // Extract repository name from the message
      let repoName = 'Unknown';
      const repoMatch = logMessage.match(/repo\s+["']([^"']+)["']/);
      if (repoMatch) {
        repoName = repoMatch[1];
      }
      
      operations.push({
        id: operationId,
        type: 'index',
        startTime: timestamp,
        endTime: timestamp,
        duration: 0,
        status: this.determineStatusFromLogLevel(log.level),
        repository: repoName,
        repository_name: repoName,
        hostname: serverName,
        server_name: serverName,
        plan: 'N/A',
        message: logMessage,
        level: log.level,
        error: log.error || null,
        isRawLogOperation: true
      });
    }
    
    // 3. STATS operations
    else if (logMessage.includes('stats for repo') || loggerName.includes('stats')) {
      const operationId = `stats-${timestamp.getTime()}-${Math.random().toString(36).substr(2, 5)}`;
      
      let repoName = 'Unknown';
      const repoMatch = logMessage.match(/repo\s+["']([^"']+)["']/);
      if (repoMatch) {
        repoName = repoMatch[1];
      }
      
      operations.push({
        id: operationId,
        type: 'stats',
        startTime: timestamp,
        endTime: timestamp,
        duration: 0,
        status: this.determineStatusFromLogLevel(log.level),
        repository: repoName,
        repository_name: repoName,
        hostname: serverName,
        server_name: serverName,
        plan: 'N/A',
        message: logMessage,
        level: log.level,
        error: log.error || null,
        isRawLogOperation: true
      });
    }
    
    // 4. RUNNING TASK operations (for backup, restore, etc.)
    else if (logMessage.includes('running task')) {
      const taskMatch = logMessage.match(/running task\s+["']([^"']+)["']/);
      const taskName = taskMatch ? taskMatch[1] : 'unknown';
      
      let operationType = 'task';
      if (taskName.toLowerCase().includes('backup')) operationType = 'backup';
      else if (taskName.toLowerCase().includes('restore')) operationType = 'restore';
      else if (taskName.toLowerCase().includes('check')) operationType = 'check';
      else if (taskName.toLowerCase().includes('prune')) operationType = 'prune';
      
      const operationId = `${operationType}-task-${timestamp.getTime()}-${Math.random().toString(36).substr(2, 5)}`;
      
      operations.push({
        id: operationId,
        type: operationType,
        startTime: timestamp,
        endTime: null,
        duration: 0,
        status: 'running',
        repository: log.server?.hostname || 'Unknown',
        repository_name: log.server?.hostname || 'Unknown',
        hostname: serverName,
        server_name: serverName,
        plan: this.extractPlanFromLogger(loggerName),
        message: logMessage,
        level: log.level,
        error: log.error || null,
        isRawLogOperation: true
      });
    }
    
    // 5. TASK FINISHED operations
    else if (logMessage.includes('task finished')) {
      const operationId = `finished-${timestamp.getTime()}-${Math.random().toString(36).substr(2, 5)}`;
      
      // Try to determine operation type from context
      let operationType = 'completed';
      if (loggerName.includes('backup')) operationType = 'backup';
      else if (loggerName.includes('index')) operationType = 'index';
      else if (loggerName.includes('stats')) operationType = 'stats';
      
      // Extract duration if available
      let duration = 0;
      const durationMatch = logMessage.match(/duration[:\s]+([0-9.]+)/);
      if (durationMatch) {
        duration = parseFloat(durationMatch[1]);
      }
      
      operations.push({
        id: operationId,
        type: operationType,
        startTime: new Date(timestamp.getTime() - (duration * 1000)),
        endTime: timestamp,
        duration: duration,
        status: 'completed',
        repository: log.server?.hostname || 'Unknown',
        repository_name: log.server?.hostname || 'Unknown',
        hostname: serverName,
        server_name: serverName,
        plan: this.extractPlanFromLogger(loggerName),
        message: logMessage,
        level: log.level,
        error: log.error || null,
        isRawLogOperation: true
      });
    }
    
    // 6. ERROR operations
    else if (log.level === 'error' || log.error) {
      const operationId = `error-${timestamp.getTime()}-${Math.random().toString(36).substr(2, 5)}`;
      
      operations.push({
        id: operationId,
        type: 'error',
        startTime: timestamp,
        endTime: timestamp,
        duration: 0,
        status: 'failed',
        repository: log.server?.hostname || 'System',
        repository_name: log.server?.hostname || 'System',
        hostname: serverName,
        server_name: serverName,
        plan: 'N/A',
        message: logMessage,
        level: log.level,
        error: log.error || logMessage,
        isRawLogOperation: true
      });
    }
  }
  
  // Filter out less important operations but keep maintenance, index, stats
  return operations.filter(op => {
    // Always keep these important operation types
    if (['maintenance', 'index', 'stats', 'check', 'prune', 'backup', 'restore', 'error'].includes(op.type)) {
      return true;
    }
    
    // Keep completed operations
    if (op.status === 'completed' || op.status === 'failed') {
      return true;
    }
    
    return false;
  });
}

// Helper methods
private determineStatusFromLogLevel(level: string): string {
  switch (level?.toLowerCase()) {
    case 'error':
      return 'failed';
    case 'warn':
    case 'warning':
      return 'warning';
    case 'info':
      return 'completed';
    default:
      return 'unknown';
  }
}

private extractPlanFromLogger(loggerName: string): string {
  const planMatch = loggerName.match(/plan\s+["']([^"']+)["']/);
  return planMatch ? planMatch[1] : 'N/A';
}

  // Fallback method to load operations directly if log fetching fails
  loadOperationsOnly(): void {
    this.apiService.get('backrest/operations/').subscribe({
      next: (response: any) => {
        this.processOperations(response);
      },
      error: (error) => {
        console.error('Error loading operations:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load job logs and operations'
        });
        this.loading = false;
      }
    });
  }

  // Helper method to process operations response
  processOperations(response: any): void {
    if (response && response.results) {
      this.logs = response.results.map((op: any) => {
        return {
          id: op.operation_id || `op-${Math.random().toString(36).substr(2, 9)}`,
          type: op.operation_type || 'unknown',
          startTime: new Date(op.started_at),
          endTime: op.completed_at ? new Date(op.completed_at) : null,
          duration: this.calculateDuration(op.started_at, op.completed_at),
          status: op.status || 'unknown',
          repository: op.repository?.name || 'Unknown',
          plan: op.plan?.name || 'N/A',
          error: op.error || null
        };
      });
      
      this.filteredLogs = [...this.logs];
      this.jobLogs = [...this.logs];
    } else {
      this.logs = [];
      this.filteredLogs = [];
      this.jobLogs = [];
    }
    this.loading = false;
  }

  // Helper to parse operation type from a log message or logger name
  parseOperationType(log: { message: string }): string {
    const msg = log.message.toLowerCase();
    if (msg.includes('backup')) return 'backup';
    if (msg.includes('restore')) return 'restore';
    if (msg.includes('check')) return 'check';
    if (msg.includes('prune')) return 'prune';
    if (msg.includes('forget')) return 'forget';
    if (msg.includes('index')) return 'index';
    if (msg.includes('cleanup')) return 'cleanup';
    if (msg.includes('stats')) return 'stats';
    return 'unknown';
  }
  
  calculateDuration(startStr: string, endStr: string | null): number {
    if (!startStr) return 0;
    
    const start = new Date(startStr).getTime();
    const end = endStr ? new Date(endStr).getTime() : Date.now();
    const durationMs = end - start;
    
    // If duration is more than 24 hours, it's likely a parsing error
    // Cap it at 2 hours as a reasonable fallback
    if (durationMs > 24 * 60 * 60 * 1000) {
      return 2 * 60 * 60; // Return 2 hours in seconds
    }
    
    return Math.max(0, durationMs / 1000);
  }

  // Helper function to parse operation summary
  parseOpSummary(summary: string): any {
    const stats: any = {};
    
    // Try to extract key statistics from summary text
    // Example: summary:{files_new:18688 dirs_new:4512 data_blobs:22368...}
    try {
      // Remove 'summary:' prefix if present
      let summaryText = summary;
      if (summary.startsWith('summary:')) {
        summaryText = summary.substring(8);
      }
      
      // Remove curly braces
      summaryText = summaryText.replace('{', '').replace('}', '');
      
      // Split by spaces to get key:value pairs
      const pairs = summaryText.split(' ');
      for (const pair of pairs) {
        const [key, value] = pair.split(':');
        if (key && value) {
          stats[key] = parseInt(value, 10);
        }
      }
      
      // Calculate progress percentage if applicable
      if (stats.total_files_processed && stats.files_processed) {
        stats.progress = Math.round((stats.files_processed / stats.total_files_processed) * 100);
      }
    } catch (e) {
      console.warn('Error parsing operation summary:', e);
    }
    
    return stats;
  }

  getStatusSeverity(status: string): string {
  switch ((status || '').toLowerCase()) {
    case 'completed':
    case 'success':
      return 'success';
    case 'failed':
    case 'error':
      return 'danger';
    case 'running':
    case 'in progress':
      return 'info';
    case 'warning':
      return 'warning';
    default:
      return 'secondary';
  }
}

getOperationTypeIcon(type: string): string {
  switch ((type || '').toLowerCase()) {
    case 'backup':
      return 'pi pi-database text-blue-400';
    case 'restore':
      return 'pi pi-replay text-green-400';
    case 'prune':
      return 'pi pi-trash text-orange-400';
    case 'check':
      return 'pi pi-check-circle text-cyan-400';
    case 'index':
      return 'pi pi-list text-yellow-400';
    case 'maintenance':
      return 'pi pi-wrench text-purple-400';
    case 'cleanup':
      return 'pi pi-broom text-amber-400';
    case 'stats':
      return 'pi pi-chart-bar text-indigo-400';
    case 'init':
      return 'pi pi-plus-circle text-emerald-400';
    case 'expire':
      return 'pi pi-clock text-red-400';
    case 'verify':
      return 'pi pi-shield text-teal-400';
    default:
      return 'pi pi-cog text-gray-400';
  }
}

  applyFilters(): void {
    this.filteredLogs = this.jobLogs.filter(log => {
      // Status filter
      if (this.filterStatus && log.status !== this.filterStatus) {
        return false;
      }
      
      // Type filter
      if (this.filterType && log.type !== this.filterType) {
        return false;
      }
      
      // Date range filter
      if (this.filterDateRange && this.filterDateRange.length === 2 && this.filterDateRange[0] && this.filterDateRange[1]) {
        const logDate = new Date(log.startTime);
        if (logDate < this.filterDateRange[0] || logDate > this.filterDateRange[1]) {
          return false;
        }
      }
      
      // Filter out "unknown" type logs if needed
      if (log.type === 'unknown') {
        return false; // Skip "unknown" type logs
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
  this.loading = true;
  this.selectedLog = log;
  this.detailsDialogVisible = true;
  this.retryAttempts = 0;
  
  // If we have snapshot data, use it directly
  if (log.snapshotData && log.summary) {
    console.log('Using snapshot data for details:', log.snapshotData);
    
    this.selectedLog = {
      ...this.selectedLog,
      rawLogs: [],
      duration: log.duration,
      invalidLogData: false,
      summary: {
        ...log.summary,
        snapshot_id: log.id
      }
    };
    
    this.convertSummaryToHumanReadable();
    this.loading = false;
    return;
  }
  
  // If it's a structured operation, try to get more details
  if (log.isStructuredOperation) {
    console.log('Processing structured operation details:', log.originalData);
    
    this.selectedLog = {
      ...this.selectedLog,
      rawLogs: [],
      duration: log.duration,
      invalidLogData: false,
      // For non-backup operations, create basic summary
      summary: log.type === 'backup' ? {} : {
        operation_type: log.type,
        repository: log.repository,
        duration: log.duration
      }
    };
    
    // Try to get raw logs for this operation
    if (log.id) {
      const encodedId = encodeURIComponent(log.id);
      this.apiService.get(`backrest/operations/raw-log-details/${encodedId}`).subscribe({
        next: (response: any) => {
          if (response && response.raw_logs) {
            this.selectedLog.rawLogs = response.raw_logs;
          }
          this.loading = false;
        },
        error: (error) => {
          console.warn('Could not fetch raw logs for structured operation:', error);
          this.loading = false;
        }
      });
    } else {
      this.loading = false;
    }
    return;
  }
  
  // Fallback to the original method for other operations
  const originalLogDate = log.startTime ? new Date(log.startTime) : null;
  
  if (!this.selectedLog.summary) {
    this.selectedLog.summary = {
      human: {
        totalSize: '0 B',
        dataAdded: '0 B',
        duration: '0s',
        efficiency: 'N/A'
      }
    };
  } else if (!this.selectedLog.summary.human) {
    this.selectedLog.summary.human = {
      totalSize: '0 B',
      dataAdded: '0 B',
      duration: '0s',
      efficiency: 'N/A'
    };
  }
  
  if (log.id) {
    const encodedId = encodeURIComponent(log.id);
    
    this.apiService.get(`backrest/operations/raw-log-details/${encodedId}`).subscribe({
      next: (response: any) => {
        if (response && (response.status === 'success' || response.status === 'partial_success')) {
          const isValidLogData = this.validateLogData(response, originalLogDate, log.type);
          
          if (!isValidLogData && this.retryAttempts < this.maxRetryAttempts) {
            this.retryAttempts++;
            this.retryLoadingLogs();
            return;
          }
          
          this.selectedLog = {
            ...this.selectedLog,
            rawLogs: response.raw_logs || [],
            duration: response.duration || log.duration,
            invalidLogData: !isValidLogData
          };
          
          this.processSummaryFromLogs(response);
        }
        
        this.loading = false;
      },
      error: (error) => {
        console.error('Error fetching log details:', error);
        this.loading = false;
      }
    });
  } else {
    this.loading = false;
  }
}


  

  // New method to validate if the logs belong to the selected operation
  private validateLogData(response: any, originalDate: Date | null, operationType: string): boolean {
    if (!response.raw_logs || response.raw_logs.length === 0) {
        console.warn('No logs found in response');
        return false;
    }
    
    // First check if we have target plan logs (more specific)
    const targetLogs = response.target_plan_logs || response.raw_logs;
    
    // Check if the logs contain only garbage collection tasks
    const allGarbageCollection = targetLogs.every((log: any) => 
        (log.task && log.task.includes('collect garbage')) || 
        (log.msg && log.msg.includes('collect garbage'))
    );
    
    if (allGarbageCollection) {
        console.warn('Log data contains only garbage collection tasks');
        return false;
    }
    
    // Check plan name matching if we have selected log plan info
    if (this.selectedLog && this.selectedLog.plan && response.plan_name) {
        const selectedPlan = this.selectedLog.plan.replace(/['"]/g, '').trim();
        const responsePlan = response.plan_name.replace(/['"]/g, '').trim();
        
        if (selectedPlan !== responsePlan) {
            console.warn(`Plan name mismatch: Selected="${selectedPlan}", Response="${responsePlan}"`);
            
            // Check if any logs actually match the selected plan
            const matchingPlanLogs = targetLogs.filter((log: any) => {
                const logPlan = log.plan || '';
                const logTask = log.task || '';
                const logLogger = log.logger || '';
                
                return logPlan.includes(selectedPlan) || 
                       logTask.includes(selectedPlan) || 
                       logLogger.includes(selectedPlan);
            });
            
            if (matchingPlanLogs.length === 0) {
                console.warn('No logs found matching the selected plan');
                return false;
            }
        }
    }
    
    // Check if there are any operation-related logs for the expected operation type
    if (operationType === 'backup') {
        const hasBackupLogs = targetLogs.some((log: any) => {
            const msg = log.msg?.toLowerCase() || '';
            const task = log.task?.toLowerCase() || '';
            const logger = log.logger?.toLowerCase() || '';
            
            return msg.includes('backup') || 
                   task.includes('backup') || 
                   logger.includes('backup') ||
                   msg.includes('snapshot') || 
                   msg.includes('files processed');
        });
        
        if (!hasBackupLogs) {
            console.warn('No backup-related logs found for backup operation');
            return false;
        }
    }
    
    // Improved date validation
    if (originalDate && targetLogs.length > 0) {
        // Look for logs that specifically relate to the operation (not just any logs)
        const operationLogs = targetLogs.filter((log: any) => {
            const msg = log.msg || '';
            const task = log.task || '';
            return msg.includes('backup complete') || 
                   msg.includes('task finished') || 
                   msg.includes('running task') ||
                   task.includes('backup for plan');
        });
        
        // If we have operation-specific logs, validate against those
        const logsToCheck = operationLogs.length > 0 ? operationLogs : targetLogs.slice(0, 5);
        
        // Check multiple log timestamps for consistency
        const logTimestamps = logsToCheck
            .map((log: any) => log.timestamp || log.ts)
            .filter((ts: any) => ts != null);
        
        if (logTimestamps.length > 0) {
            // Find the closest matching log date
            let minDateDiff = Infinity;
            let closestLogDate = null;
            
            for (const ts of logTimestamps) {
                const logDate = new Date(ts * 1000);
                const timeDiff = Math.abs(logDate.getTime() - originalDate.getTime());
                const daysDiff = timeDiff / (1000 * 3600 * 24);
                
                if (daysDiff < minDateDiff) {
                    minDateDiff = daysDiff;
                    closestLogDate = logDate;
                }
            }
            
            console.log(`Date validation: Original=${originalDate.toISOString()}, Closest Log=${closestLogDate?.toISOString()}, Min Diff=${minDateDiff.toFixed(2)} days`);
            
            // Allow up to 7 days difference (more lenient for date matching)
            if (minDateDiff > 7) {
                console.warn(`Significant date mismatch: Min difference=${minDateDiff.toFixed(2)} days`);
                
                // Additional check: count how many logs are within reasonable range
                const recentLogs = logTimestamps.filter((ts: any) => {
                    const logDate = new Date(ts * 1000);
                    const daysDiff = Math.abs(logDate.getTime() - originalDate.getTime()) / (1000 * 3600 * 24);
                    return daysDiff <= 7;
                });
                
                if (recentLogs.length === 0) {
                    console.warn('No logs found within 7 days of the target date');
                    return false;
                } else {
                    console.log(`Found ${recentLogs.length} logs within 7 days of target date`);
                }
            }
        }
    }
    
    return true;
}

/**
 * Retry loading logs with more specific parameters to get the correct logs
 * This is used when the wrong logs are initially returned from the server
 */
retryLoadingLogs(): void {
    if (!this.selectedLog) return;
    
    this.loading = true;
    
    // Extract the date from the operation ID or startTime
    let targetDate: Date | null = this.selectedLog.startTime;
    let targetDateStr = '';
    
    if (targetDate) {
        // Format as YYYY-MM-DD
        targetDateStr = targetDate.toISOString().split('T')[0];
    } else {
        // Try to extract from ID - look for timestamp in the ID
        const dateMatch = this.selectedLog.id.match(/(\d{13})/);
        if (dateMatch && dateMatch[1]) {
            const timestamp = parseInt(dateMatch[1]);
            if (!isNaN(timestamp)) {
                targetDate = new Date(timestamp);
                targetDateStr = targetDate.toISOString().split('T')[0];
            }
        }
    }
    
    // Add operation type and date as query parameters
    let url = `backrest/operations/raw-log-details/${encodeURIComponent(this.selectedLog.id)}`;
    let params: any = {};
    
    // Always include the date if we have it
    if (targetDateStr) {
        params.date = targetDateStr;
        // Also add start and end time for more precise filtering
        if (targetDate) {
            const startOfDay = new Date(targetDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(targetDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            params.start_time = startOfDay.toISOString();
            params.end_time = endOfDay.toISOString();
        }
    }
    
    // Always include operation type if available
    if (this.selectedLog.type) {
        params.type = this.selectedLog.type;
    }
    
    // IMPORTANT: Include exact plan name for precise filtering
    if (this.selectedLog.plan) {
        params.plan = this.selectedLog.plan.replace(/['"]/g, '').trim();
    }
    
    // Add the operation ID as an additional filter
    if (this.selectedLog.id) {
        params.operation_id = this.selectedLog.id;
    }
    
    // ENABLE strict mode to ensure exact matching
    params.strict_match = true;
    
    this.messageService.add({
        severity: 'info',
        summary: 'Retrying',
        detail: `Fetching logs for plan "${this.selectedLog.plan}" on ${targetDateStr || 'selected date'}...`,
        life: 3000
    });
    
    console.log('Retrying with parameters:', params);
    console.log('Target date:', targetDateStr, 'Operation type:', this.selectedLog.type, 'Plan:', this.selectedLog.plan);
    
    this.apiService.get(url, params).subscribe({
        next: (response: any) => {
            console.log('Retry response:', response);
            
            if (response && (response.status === 'success' || response.status === 'partial_success')) {
                // Use target_plan_logs if available (more specific)
                const logsToUse = response.target_plan_logs && response.target_plan_logs.length > 0 
                    ? response.target_plan_logs 
                    : response.raw_logs;
                
                // Check if we got better results
                const isValidLogData = this.validateLogData(response, targetDate, this.selectedLog.type);
                
                // Update the selectedLog with the response data
                this.selectedLog = {
                    ...this.selectedLog,
                    rawLogs: logsToUse || [],
                    targetPlanLogs: response.target_plan_logs || [],
                    duration: response.duration,
                    invalidLogData: !isValidLogData,
                    searchUsed: response.search_used,
                    strictMatch: response.strict_match_used
                };
                
                // Extract and process summary data from the logs
                this.processSummaryFromLogs(response);
                
                if (isValidLogData) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: `Loaded ${logsToUse?.length || 0} relevant logs for plan "${this.selectedLog.plan}"`,
                        life: 3000
                    });
                } else {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Partial Results',
                        detail: 'Found logs but they may not perfectly match the selected operation',
                        life: 5000
                    });
                }
            }
            
            this.loading = false;
        },
        error: (error) => {
            console.error('Error retrying log details:', error);
            this.loading = false;
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Failed to reload operation details',
                life: 3000
            });
        }
    });
}

/**
 * Process summary data from the logs response
 */
processSummaryFromLogs(response: any): void {
    if (!response || !this.selectedLog) return;
    
    console.log('Processing summary from logs response:', response);
    
    // Initialize summary if not exists
    if (!this.selectedLog.summary) {
        this.selectedLog.summary = {};
    }
    
    // Check if response already has processed summary
    if (response.summary) {
        console.log('Found pre-processed summary:', response.summary);
        this.selectedLog.summary = {
            ...this.selectedLog.summary,
            ...response.summary
        };
    }
    
    // Look for backup complete logs with summary data
    const logs = response.target_plan_logs || response.raw_logs || [];
    console.log(`Found logs: ${logs.length}`);
    
    // Find the backup complete log with summary
    for (const log of logs) {
        if (log.msg === 'backup complete' && log.summary) {
            console.log('Found backup complete log with summary:', log);
            
            // Parse the summary string
            const summaryData = this.parseBackupSummary(log.summary);
            if (summaryData) {
                this.selectedLog.summary = {
                    ...this.selectedLog.summary,
                    ...summaryData
                };
                
                // Add duration from log if available
                if (log.duration) {
                    this.selectedLog.summary.total_duration = log.duration;
                }
            }
            break;
        }
    }
    
    // Convert raw data to human-readable format
    this.convertSummaryToHumanReadable();
    
    console.log('Final summary data:', this.selectedLog.summary);
}

/**
 * Parse backup summary string into structured data
 */
private parseBackupSummary(summaryText: string): any {
    if (!summaryText) return null;
    
    console.log('Parsing summary data from:', summaryText);
    
    try {
        // Extract the summary content from the string
        // Format: summary:{files_new:13573 dirs_new:3458 data_blobs:17695...}
        let content = summaryText;
        
        // Remove 'summary:' prefix if present
        if (content.startsWith('summary:')) {
            content = content.substring(8);
        }
        
        // Remove surrounding braces
        content = content.replace(/^{|}$/g, '').trim();
        
        console.log('Extracted summary text:', content);
        
        // Parse key-value pairs
        const summary: any = {};
        
        // Split by spaces, but handle quoted values
        const pairs = content.match(/\w+:[^:\s]+(?:\s+|$)/g) || [];
        
        for (const pair of pairs) {
            const colonIndex = pair.indexOf(':');
            if (colonIndex > 0) {
                const key = pair.substring(0, colonIndex).trim();
                let value = pair.substring(colonIndex + 1).trim();
                
                // Remove quotes if present
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                
                // Convert to number if it's numeric
                if (/^\d+(\.\d+)?$/.test(value)) {
                    summary[key] = parseFloat(value);
                } else {
                    summary[key] = value;
                }
            }
        }
        
        console.log('Parsed summary:', summary);
        return summary;
        
    } catch (error) {
        console.error('Error parsing backup summary:', error);
        return null;
    }
}

/**
 * Convert raw summary data to human-readable format
 */
private convertSummaryToHumanReadable(): void {
    if (!this.selectedLog.summary) return;
    
    const summary = this.selectedLog.summary;
    
    // Initialize human-readable section
    if (!summary.human) {
        summary.human = {};
    }
    
    // Convert bytes to human-readable format
    summary.human.totalSize = this.formatBytes(summary.total_bytes_processed || 0);
    summary.human.dataAdded = this.formatBytes(summary.data_added || 0);
    
    // Format duration
    if (summary.total_duration) {
        summary.human.duration = this.formatDuration(summary.total_duration);
    } else {
        summary.human.duration = 'N/A';
    }
    
    // Calculate efficiency/deduplication ratio
    if (summary.total_bytes_processed && summary.data_added && summary.total_bytes_processed > 0) {
        const efficiency = (1 - (summary.data_added / summary.total_bytes_processed)) * 100;
        summary.human.efficiency = `${efficiency.toFixed(1)}%`;
    } else {
        summary.human.efficiency = 'N/A';
    }
    
    // Format file counts
    summary.human.filesNew = this.formatNumber(summary.files_new || 0);
    summary.human.filesChanged = this.formatNumber(summary.files_changed || 0);
    summary.human.filesUnmodified = this.formatNumber(summary.files_unmodified || 0);
    summary.human.dirsNew = this.formatNumber(summary.dirs_new || 0);
    summary.human.dirsChanged = this.formatNumber(summary.dirs_changed || 0);
    summary.human.treeBlobs = this.formatNumber(summary.tree_blobs || 0);
    summary.human.dataBlobs = this.formatNumber(summary.data_blobs || 0);
}

/**
 * Format bytes to human-readable string
 */
private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration to human-readable string
 */
private formatDuration(seconds: number): string {
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
}

/**
 * Format number with thousand separators
 */
private formatNumber(num: number): string {
    return num.toLocaleString();
}

/**
 * Handle tab change events in the TabView
 * Loads appropriate data for each tab when selected
 */
onTabChange(event: any): void {
    this.activeTabIndex = event.index;
    
    // Load data based on selected tab
    switch (this.activeTabIndex) {
      case 0: // Operations tab
        // No special action needed as operations are loaded by default
        break;
      case 1: // Dashboard tab
        // Always load dashboard data on tab selection
        this.loadDashboard();
        break;
      case 2: // Log Analysis tab
        if (!this.logAnalysisData) {
          this.loadLogAnalysis();
        }
        break;
    }
  }

  /**
   * Manually trigger synchronization of logs from server sources
   */
  syncLogs(): void {
  this.loading = true;
  this.messageService.add({
    severity: 'info',
    summary: 'Syncing Logs',
    detail: 'Synchronizing logs from all sources...',
    life: 3000
  });
  
  // Use the correct endpoint that doesn't require SSH connection
  this.apiService.post('backrest/logs/sync_logs/', {}).subscribe({
    next: (response: any) => {
      this.messageService.add({
        severity: 'success',
        summary: 'Logs Synchronized',
        detail: response.message || 'Log synchronization completed successfully',
        life: 5000
      });
      
      // Reload logs after sync
      this.loadJobLogs();
    },
    error: (error) => {
      console.error('Error syncing logs:', error);
      
      // Fallback: try to just reload existing data without syncing
      this.messageService.add({
        severity: 'warning',
        summary: 'Sync Issues',
        detail: 'Server connection issues detected. Refreshing local data instead.',
        life: 5000
      });
      
      // Just reload what we have
      this.loadJobLogs();
    }
  });
}
  /**
   * Load log analysis data for the Log Analysis tab
   */
  private loadLogAnalysis(): void {
    this.apiService.get('backrest/logs/analysis/').subscribe({
      next: (response: any) => {
        this.logAnalysisData = response;
        console.log('Log analysis data loaded:', this.logAnalysisData);
      },
      error: (error) => {
        console.error('Error loading log analysis:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load log analysis data',
          life: 5000
        });
      }
    });
  }

  /**
   * Prepare chart data for dashboard visualizations
   */
  private prepareChartData(): void {
    if (!this.dashboardData) return;
    
    // Operations by type chart
    const typeLabels: string[] = [];
    const typeData: number[] = [];
    const typeColors: string[] = [];
    
    if (this.dashboardData.by_type) {
      Object.keys(this.dashboardData.by_type).forEach(type => {
        typeLabels.push(type);
        typeData.push(this.dashboardData.by_type[type]);
        
        // Assign colors based on operation type
        switch(type.toLowerCase()) {
          case 'backup': typeColors.push('#4CAF50'); break;
          case 'restore': typeColors.push('#2196F3'); break;
          case 'check': typeColors.push('#FF9800'); break;
          case 'prune': typeColors.push('#9C27B0'); break;
          default: typeColors.push('#607D8B'); break;
        }
      });
    }
    
    this.operationsByTypeData = {
      labels: typeLabels,
      datasets: [
        {
          data: typeData,
          backgroundColor: typeColors,
          hoverBackgroundColor: typeColors.map(c => this.adjustColorBrightness(c, 20))
        }
      ]
    };
    
    // Operations by status chart
    this.operationsByStatusData = {
      labels: ['Completed', 'Failed', 'Running', 'Pending'],
      datasets: [
        {
          data: [
            this.dashboardData.by_status?.completed || 0,
            this.dashboardData.by_status?.failed || 0,
            this.dashboardData.by_status?.running || 0,
            this.dashboardData.by_status?.pending || 0
          ],
          backgroundColor: ['#4CAF50', '#F44336', '#2196F3', '#FFC107'],
          hoverBackgroundColor: ['#388E3C', '#D32F2F', '#1976D2', '#FFA000']
        }
      ]
    };
    
    // Operations by date chart
    // This requires date-based data that might not be available in the current API response
    // This is a simplified implementation
    const dateLabels = [];
    const dateData = [];
    
    if (this.dashboardData.by_date) {
      Object.keys(this.dashboardData.by_date)
        .sort() // Sort dates
        .forEach(date => {
          dateLabels.push(date);
          dateData.push(this.dashboardData.by_date[date]);
        });
    } else {
      // Generate placeholder data if real data is not available
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        dateLabels.push(date.toLocaleDateString());
        dateData.push(Math.floor(Math.random() * 10) + 1); // Random data for demo
      }
    }
    
    this.operationsByDateData = {
      labels: dateLabels,
      datasets: [
        {
          label: 'Operations',
          data: dateData,
          fill: false,
          borderColor: '#42A5F5',
          tension: 0.4
        }
      ]
    };
  }

  /**
   * Helper method to adjust color brightness for hover effects
   */
  private adjustColorBrightness(color: string, percent: number): string {
    // Simple implementation that assumes color is in hex format
    // In a real app, you might want a more robust color manipulation library
    if (color.startsWith('#')) {
      color = color.slice(1);
    }
    
    const num = parseInt(color, 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + percent));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
    
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  }


  getOperationDescription(log: any): string | null {
    if (!log) return null;
    
    // Extract plan name from ID or plan property
    let planName = log.plan || '';
    if (!planName && log.id && log.id.includes('plan')) {
      const planMatch = log.id.match(/for plan ["']?([^"']+)["']?/);
      if (planMatch && planMatch[1]) {
        planName = planMatch[1];
      }
    }
    
    // Generate description based on operation type
    switch (log.type?.toLowerCase()) {
      case 'backup':
        return planName ? `Plan: ${planName}` : 'Backup operation';
        
      case 'restore':
        return planName ? `Restore from plan: ${planName}` : 'Restore operation';
        
      case 'index':
        if (log.message && log.message.includes('snapshots')) {
          return 'Indexing snapshots';
        }
        return 'Index operation';
        
      case 'check':
        if (log.repository) {
          return `Checking repository: ${log.repository}`;
        }
        return 'Check operation';
        
      case 'prune':
        if (log.repository) {
          return `Pruning repository: ${log.repository}`;
        }
        return 'Prune operation';
        
      case 'stats':
        if (log.repository) {
          return `Stats for repository: ${log.repository}`;
        }
        return 'Stats operation';
        
      case 'unknown':
        // For unknown types, try to extract context from the message
        if (log.message) {
          if (log.message.includes('backup')) return 'Backup related';
          if (log.message.includes('restore')) return 'Restore related';
          if (log.message.includes('index')) return 'Index related';
          if (log.message.includes('check')) return 'Check related';
        }
        return null;
        
      default:
        // If we can extract repository or plan, show that
        if (log.repository) {
          return `Repository: ${log.repository}`;
        }
        return null;
    }
  }

private loadServerConfigurations(): Promise<any[]> {
  return new Promise((resolve) => {
    this.apiService.get('backrest/servers/').subscribe({
      next: (response: any) => {
        console.log('Server configurations:', response);
        resolve(response.servers || response.results || []);
      },
      error: (error) => {
        console.error('Error loading server configurations:', error);
        resolve([]);
      }
    });
  });
}

// Add this helper method after loadServerConfigurations()
private findServerByHostnameOrRepo(servers: any[], hostname: string, repoId: string): any {
  if (!servers || servers.length === 0) return null;
  
  // First try to match by hostname
  let server = servers.find(s => 
    s.hostname === hostname || 
    s.name === hostname ||
    s.display_name === hostname
  );
  
  // If not found, try to match by repository
  if (!server) {
    server = servers.find(s => 
      s.repositories && s.repositories.includes(repoId)
    );
  }
  
  // If still not found, try to match by IP or partial hostname
  if (!server && hostname) {
    server = servers.find(s => 
      s.ip_address === hostname ||
      hostname.includes(s.hostname) ||
      s.hostname.includes(hostname)
    );
  }
  
  return server;
}

private loadRawLogsAsOperations(servers: any[] = []): Promise<any[]> {
  return new Promise((resolve) => {
    console.log('Loading raw logs using existing API endpoints...');
    
    // FIRST: Use your existing fetch_from_server endpoint
    this.apiService.post('backrest/logs/fetch_from_server/', {
      lines: 1000  // Fetch more lines for better coverage
    }).subscribe({
      next: (fetchResponse: any) => {
        console.log('Fetch from server response:', fetchResponse);
        
        if (fetchResponse.status === 'success' && fetchResponse.logs_imported > 0) {
          console.log(`Successfully imported ${fetchResponse.logs_imported} logs`);
          
          // Now get the processed logs from database
          this.loadProcessedLogsFromDatabase(servers, resolve);
        } else {
          // No new logs imported, try to get existing ones
          this.loadProcessedLogsFromDatabase(servers, resolve);
        }
      },
      error: (error) => {
        console.error('Error fetching logs from server:', error);
        // Fallback to database logs
        this.loadProcessedLogsFromDatabase(servers, resolve);
      }
    });
  });
}
private loadProcessedLogsFromDatabase(servers: any[], resolve: Function): void {
  // Use your existing structured operations endpoint with query string
  const url = 'backrest/operations/structured/?days=30&limit=200';
  
  this.apiService.get(url).subscribe({
    next: (structuredResponse: any) => {
      console.log('Structured operations response:', structuredResponse);
      
      if (structuredResponse.results && structuredResponse.results.length > 0) {
        resolve(structuredResponse.results);
      } else {
        console.log('No structured operations found, trying direct log fetch...');
        this.tryDirectLogFetch(servers, resolve);
      }
    },
    error: (error) => {
      console.error('Error loading structured operations:', error);
      this.tryDirectLogFetch(servers, resolve);
    }
  });
}

private tryDirectLogFetch(servers: any[], resolve: Function): void {
  // Use your comprehensive fetch_backrest_logs endpoint
  this.apiService.post('backrest/logs/fetch_from_server/', {}).subscribe({
    next: (logsResponse: any) => {
      console.log('Backrest logs response:', logsResponse);
      
      if (logsResponse.operations && logsResponse.operations.length > 0) {
        // Convert database operations to our format
        const operations = logsResponse.operations.map((op: any) => ({
          id: op.operation_id,
          type: op.operation_type,
          startTime: op.started_at,
          endTime: op.completed_at,
          duration: op.duration_seconds || 0,
          status: op.status,
          repository: op.repository?.name || 'Unknown',
          repository_name: op.repository?.name || 'Unknown',
          hostname: op.repository?.server?.hostname || 'Unknown',
          server_name: op.repository?.server?.display_name || op.repository?.server?.hostname || 'Unknown',
          plan: op.plan?.name || 'N/A',
          message: this.generateOperationMessage(op),
          level: 'info',
          error: op.error,
          isRawLogOperation: false,
          isDatabaseOperation: true
        }));
        
        resolve(operations);
      } else {
        console.log('No operations found from any source');
        resolve([]);
      }
    },
    error: (fetchError) => {
      console.error('Error fetching backrest logs:', fetchError);
      resolve([]);
    }
  });
}
}