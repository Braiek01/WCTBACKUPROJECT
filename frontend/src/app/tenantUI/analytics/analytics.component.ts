import { Component, OnInit, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { BackrestService } from '../../core/services/backrest.service';
import { Subscription, interval } from 'rxjs';

// PrimeNG Imports
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { DropdownModule } from 'primeng/dropdown';
import { ToastModule } from 'primeng/toast';
import { SplitButtonModule } from 'primeng/splitbutton';
import { TabViewModule } from 'primeng/tabview';
import { ProgressBarModule } from 'primeng/progressbar';
import { DividerModule } from 'primeng/divider';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { InputSwitchModule } from 'primeng/inputswitch';
import { CalendarModule } from 'primeng/calendar';
import { Tag, TagModule} from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from "primeng/progressspinner";

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    ChartModule,
    CardModule,
    TableModule,
    DropdownModule,
    ToastModule,
    SplitButtonModule,
    TabViewModule,
    ProgressBarModule,
    DividerModule,
    SkeletonModule,
    TooltipModule,
    InputTextModule,
    InputSwitchModule,
    CalendarModule,
    TagModule,
    DialogModule,
    ProgressSpinnerModule
],
  providers: [MessageService, ConfirmationService],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.css'
})
export class AnalyticsComponent implements OnInit {
  // User and tenant info
  username: string = '';
  tenantName: string = '';

  // Selected repository ID for repo stats
  selectedRepoId: string = '';

  // Date filters
  dateRange: Date[] = [];
  dateOptions = [
    { label: 'Last 7 Days', value: '7d' },
    { label: 'Last 30 Days', value: '30d' },
    { label: 'Last 90 Days', value: '90d' },
    { label: 'Custom Range', value: 'custom' }
  ];
  selectedDateOption: string = '30d';
  
  // Loading states
  loadingBackupStats: boolean = true;
  loadingStorageStats: boolean = true;
  loadingPerformanceStats: boolean = true;
  loadingRepositoryHealth: boolean = true;
  loadingRepoStats: boolean = true;
  
  // Charts data
  backupSuccessChart: any;
  backupSuccessOptions: any;
  
  storageUsageChart: any;
  storageUsageOptions: any;
  
  dataGrowthChart: any;
  dataGrowthOptions: any;
  
  backupDurationChart: any;
  backupDurationOptions: any;
  
  repoStorageChart: any;
  repoStorageOptions: any;
  
  // Summary metrics
  summaryStats = {
    totalBackups: 0,
    successRate: 0,
    totalStorageUsed: 0,
    avgBackupSize: 0,
    dataDeduplicationRatio: 0,
    avgBackupDuration: 0
  };
  
  // Repository metrics
  repositories: any[] = [];
  backrestRepositories: any[] = [];
  repoOperations: any[] = [];
  repoStats: any; // Added property to fix compile error
  
  // Performance metrics
  performanceMetrics = {
    avgTransferRate: 0,
    maxTransferRate: 0,
    avgCpuUsage: 0,
    avgMemoryUsage: 0
  };
  
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

  // Add these properties to your component
  selectedRepoForCheck: any = null;
  showCheckDialog: boolean = false;
  checkInProgress: boolean = false;
  checkSuccess: boolean = false;
  checkOutput: string = '';
  checkResult: any = null;
  checkingRepository: any = null;

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private messageService: MessageService,
    private router: Router,
    private backrestService: BackrestService,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    // Get user and tenant info
    this.username = this.authService.getUsername() || '';
    this.tenantName = this.authService.getTenantName() || '';
    
    // Set default date range (last 30 days)
    this.setDateRange('30d');
    
    // Initialize charts
    this.initCharts();
    
    // Load data
    this.loadAnalyticsData();
    
    // Load Backrest repositories
    this.loadBackrestRepositories();
  }
  
  setDateRange(option: string): void {
    this.selectedDateOption = option;
    
    const today = new Date();
    const endDate = new Date(today);
    let startDate: Date;
    
    switch(option) {
      case '7d':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
        break;
      case '90d':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 90);
        break;
      case 'custom':
        // Don't change the date range if custom is selected
        // (it will be set by the calendar component)
        return;
      case '30d':
      default:
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 30);
    }
    
    this.dateRange = [startDate, endDate];
    
    // Reload data with new date range
    this.loadAnalyticsData();
  }
  
  onDateRangeChange(): void {
    // This is called when the calendar component changes the date range
    if (this.dateRange.length === 2) {
      this.selectedDateOption = 'custom';
      this.loadAnalyticsData();
    }
  }
  
  initCharts(): void {
    if (isPlatformBrowser(this.platformId)) {
      const documentStyle = getComputedStyle(document.documentElement);
      const textColor = documentStyle.getPropertyValue('--text-color') || '#f0f0f0';
      const textColorSecondary = documentStyle.getPropertyValue('--text-color-secondary') || '#aaaaaa';
      const surfaceBorder = documentStyle.getPropertyValue('--surface-border') || '#4f5a68';
      
      // Backup Success/Failure Chart
      this.backupSuccessChart = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
        datasets: [
          {
            label: 'Successful Backups',
            data: [65, 72, 78, 81, 76, 85, 90],
            fill: false,
            borderColor: '#3186ea',
            tension: 0.4
          },
          {
            label: 'Failed Backups',
            data: [5, 3, 2, 1, 4, 2, 1],
            fill: false,
            borderColor: '#e53935',
            tension: 0.4
          }
        ]
      };
      
      this.backupSuccessOptions = {
        maintainAspectRatio: false,
        aspectRatio: 0.6,
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
      
      // Storage Usage Chart (Doughnut)
      this.storageUsageChart = {
        labels: ['Used', 'Available'],
        datasets: [
          {
            data: [300, 700],
            backgroundColor: ['#3186ea', '#374151'],
            hoverBackgroundColor: ['#1976d2', '#4b5563']
          }
        ]
      };
      
      this.storageUsageOptions = {
        plugins: {
          legend: {
            labels: {
              color: textColor
            }
          }
        }
      };
      
      // Data Growth Chart (Line)
      this.dataGrowthChart = {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'],
        datasets: [
          {
            label: 'Total Data',
            data: [540, 580, 690, 740, 890, 940],
            fill: true,
            backgroundColor: 'rgba(49, 134, 234, 0.2)',
            borderColor: '#3186ea',
            tension: 0.4
          }
        ]
      };
      
      this.dataGrowthOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Date'
            },
            grid: {
              color: '#444'
            },
            ticks: {
              color: '#fff'
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Data Size (GB)'
            },
            grid: {
              color: '#444'
            },
            ticks: {
              color: '#fff',
              // FIXED: Format the Y-axis to show GB values properly
              callback: function(value: any) {
                if (typeof value === 'number') {
                  return value.toFixed(1) + ' GB';
                }
                return value;
              }
            },
            // FIXED: Start Y-axis from 0 and set appropriate max
            beginAtZero: true
          }
        },
        plugins: {
          legend: {
            labels: {
              color: '#fff'
            }
          },
          tooltip: {
            callbacks: {
              label: function(context: any) {
                return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + ' GB';
              }
            }
          }
        }
      };
      
      // Backup Duration Chart (Bar)
      this.backupDurationChart = {
        labels: ['Web Server', 'Database', 'File Storage', 'User Data', 'Config'],
        datasets: [
          {
            label: 'Average Duration (minutes)',
            data: [12, 29, 45, 15, 5],
            backgroundColor: '#3186ea'
          }
        ]
      };
      
      this.backupDurationOptions = {
        maintainAspectRatio: false,
        aspectRatio: 0.8,
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
    }
  }
  
  // Update your loadAnalyticsData() method to ensure proper sequencing:
  loadAnalyticsData(): void {
    this.backrestService.getRepositories().subscribe({
      next: (response) => {
        console.log('Repository API response:', response);
        
        this.backrestRepositories = response.repositories || [];
        
        if (this.backrestRepositories.length > 0) {
          // Load summary stats from all repositories
          this.loadSummaryStats().then(() => {
            // Once summary stats are loaded, load other charts
            this.loadBackupStats();
            this.loadStorageStats(); // This will now call prepareDataGrowthChart()
            this.loadPerformanceMetrics();
            this.loadRepositoryHealth();
          });
        } else {
          // Show empty state
          this.loadingBackupStats = false;
          this.loadingStorageStats = false;
          this.loadingPerformanceStats = false;
          this.loadingRepositoryHealth = false;
          this.loadingRepoStats = false;
          
          this.messageService.add({
            severity: 'info',
            summary: 'No repositories found',
            detail: 'Please create a repository first to see analytics data',
            sticky: true
          });
        }
      },
      error: (err) => {
        console.error('Failed to load repositories:', err);
        this.loadingBackupStats = false;
        this.loadingStorageStats = false;
        this.loadingPerformanceStats = false;
        this.loadingRepositoryHealth = false;
        this.loadingRepoStats = false;
      }
    });
  }

  // Fix metrics calculation in loadSummaryStats method
  loadSummaryStats(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Initialize counters
      let totalBackups = 0;
      let successfulBackups = 0;
      let totalSize = 0;
      let actualStorageSize = 0;
      let totalDuration = 0;
      
      // If no repositories, resolve immediately
      if (this.backrestRepositories.length === 0) {
        this.summaryStats = {
          totalBackups: 0,
          successRate: 0,
          totalStorageUsed: 0,
          avgBackupSize: 0,
          dataDeduplicationRatio: 1.0,
          avgBackupDuration: 0
        };
        resolve();
        return;
      }
      
      // Create array of promises for each repository
      const promises = this.backrestRepositories.map(repo => {
        return new Promise<any>((resolveRepo) => {
          this.backrestService.getSnapshots(repo.repository_id).subscribe({
            next: (response) => {
              const snapshots = response.snapshots || [];
              
              // Process snapshots
              snapshots.forEach((snapshot: any) => {
                if (snapshot.summary) {
                  // For storage size calculation
                  if (snapshot.summary.totalBytesProcessed) {
                    totalSize += parseInt(snapshot.summary.totalBytesProcessed);
                  }
                  
                  if (snapshot.summary.dataAdded) {
                    actualStorageSize += parseInt(snapshot.summary.dataAdded);
                  }
                  
                  // Count successful backups
                  successfulBackups++;
                  
                  // Add duration (in seconds)
                  if (snapshot.summary.totalDuration) {
                    totalDuration += parseFloat(snapshot.summary.totalDuration);
                  }
                }
              });
              
              totalBackups += snapshots.length;
              resolveRepo(null);
            },
            error: () => {
              // Handle error but still resolve
              resolveRepo(null);
            }
          });
        });
      });
      
      // Wait for all repository data to be processed
      Promise.all(promises).then(() => {
        // Calculate final metrics
        this.summaryStats.totalBackups = totalBackups;
        this.summaryStats.successRate = totalBackups > 0 ? (successfulBackups / totalBackups) * 100 : 0;
        this.summaryStats.totalStorageUsed = actualStorageSize;
        this.summaryStats.avgBackupSize = totalBackups > 0 ? totalSize / totalBackups : 0;
        
        // Calculate deduplication ratio
        if (totalSize > 0 && actualStorageSize > 0) {
          this.summaryStats.dataDeduplicationRatio = parseFloat((totalSize / actualStorageSize).toFixed(2));
        } else {
          this.summaryStats.dataDeduplicationRatio = 1.0;
        }
        
        // Calculate average duration in minutes
        this.summaryStats.avgBackupDuration = totalBackups > 0 ? totalDuration / totalBackups / 60 : 0;
        
        // Convert bytes to GB for display
        this.summaryStats.totalStorageUsed = actualStorageSize;
        this.summaryStats.avgBackupSize = totalBackups > 0 ? totalSize / totalBackups : 0;
        
        // All done, resolve the main promise
        resolve();
      });
    });
  }
  
  loadBackupStats(): void {
    this.loadingBackupStats = true;
    
    // First, get actual snapshots to create a real chart
    const promises: Promise<any>[] = [];
    
    this.backrestRepositories.forEach(repo => {
      promises.push(
        new Promise<any>((resolve) => {
          this.backrestService.getSnapshots(repo.repository_id).subscribe({
            next: (response) => {
              resolve(response.snapshots || []);
            },
            error: () => resolve([])
          });
        })
      );
    });
    
    // Process all snapshots from all repos
    Promise.all(promises).then(allSnapshots => {
      // Flatten the array of snapshot arrays
      const snapshots = allSnapshots.flat();
      
      // Group by date (using the day part of the timestamp)
      const snapshotsByDate = new Map();
      const now = new Date();
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      
      // Create empty entries for each month in the last 6 months
      for (let d = new Date(sixMonthsAgo); d <= now; d.setMonth(d.getMonth() + 1)) {
        const monthKey = d.toLocaleString('default', { month: 'short' });
        snapshotsByDate.set(monthKey, { date: monthKey, success: 0, failed: 0 });
      }
      
      // Process actual snapshots
      snapshots.forEach(snapshot => {
        if (snapshot.unixTimeMs) {
          const timestamp = new Date(parseInt(snapshot.unixTimeMs));
          const monthKey = timestamp.toLocaleString('default', { month: 'short' });
          
          if (!snapshotsByDate.has(monthKey)) {
            snapshotsByDate.set(monthKey, { date: monthKey, success: 0, failed: 0 });
          }
          
          // Check if snapshot was successful based on summary
          if (snapshot.summary && typeof snapshot.summary === 'object') {
            snapshotsByDate.get(monthKey).success += 1;
          } else {
            snapshotsByDate.get(monthKey).failed += 1;
          }
        }
      });
      
      // Convert map to array and sort by date
      const timeSeriesData = Array.from(snapshotsByDate.values());
      
      // Update backup success/failure chart with real data
      const labels = timeSeriesData.map(item => item.date);
      const successData = timeSeriesData.map(item => item.success);
      const failureData = timeSeriesData.map(item => item.failed);
      
      this.backupSuccessChart = {
        labels: labels,
        datasets: [
          {
            label: 'Successful Backups',
            data: successData,
            fill: false,
            borderColor: '#3186ea',
            tension: 0.4
          },
          {
            label: 'Failed Backups',
            data: failureData,
            fill: false,
            borderColor: '#e53935',
            tension: 0.4
          }
        ]
      };
      
      this.loadingBackupStats = false;
    });
  }
  
  loadStorageStats(): void {
    this.loadingStorageStats = true;
    
    // Get snapshots for storage analysis
    if (this.backrestRepositories.length === 0) {
      this.loadingStorageStats = false;
      return;
    }
    
    // Load snapshots from ALL repositories for storage analytics
    const promises: Promise<any>[] = [];
    
    this.backrestRepositories.forEach(repo => {
      promises.push(
        new Promise<any>((resolve) => {
          this.backrestService.getSnapshots(repo.repository_id).subscribe({
            next: (response) => {
              const snapshots = response.snapshots || [];
              // Attach snapshots to repo object for prepareDataGrowthChart
              repo.snapshots = snapshots;
              resolve(snapshots);
            },
            error: () => {
              repo.snapshots = [];
              resolve([]);
            }
          });
        })
      );
    });
    
    // Wait for all repository snapshots to load
    Promise.all(promises).then((allSnapshots) => {
      const flatSnapshots = allSnapshots.flat();
      
      // For the selected repository or the first one
      const repoId = this.selectedRepoId || this.backrestRepositories[0].repository_id;
      const selectedRepoSnapshots = this.backrestRepositories
        .find(r => r.repository_id === repoId)?.snapshots || [];
      
      // Calculate storage metrics from selected repository
      let totalDataSize = 0;
      let actualStorageSize = 0;
      let bytesProcessed = 0;
      
      selectedRepoSnapshots.forEach((snapshot: any) => {
        if (snapshot.summary) {
          // Raw data size
          if (snapshot.summary.totalBytesProcessed) {
            bytesProcessed += parseInt(snapshot.summary.totalBytesProcessed);
          }
          
          // Added data size after deduplication
          if (snapshot.summary.dataAdded) {
            actualStorageSize += parseInt(snapshot.summary.dataAdded);
          }
        }
      });
      
      // If we have actual bytesProcessed, use it for total data size
      totalDataSize = bytesProcessed > 0 ? bytesProcessed : (actualStorageSize * 2);
      
      // Calculate storage saved by deduplication
      const savedSpace = totalDataSize - actualStorageSize;
      
      // Update storage chart with real data
      this.storageUsageChart = {
        labels: ['Used Storage', 'Saved by Deduplication'],
        datasets: [
          {
            data: [actualStorageSize, savedSpace],
            backgroundColor: ['#3186ea', '#42b983'],
            hoverBackgroundColor: ['#1976d2', '#2f9c6f']
          }
        ]
      };
      
      // FIXED: Now call prepareDataGrowthChart with the loaded snapshot data
      this.prepareDataGrowthChart();
      
      this.loadingStorageStats = false;
    });
  }
  
  loadPerformanceMetrics(): void {
    this.loadingPerformanceStats = true;
    
    // Get all repositories
    const promises: Promise<any>[] = [];
    
    // Collect snapshots from all repositories
    this.backrestRepositories.forEach(repo => {
      promises.push(
        new Promise<any>((resolve) => {
          this.backrestService.getSnapshots(repo.repository_id).subscribe({
            next: (response) => {
              resolve(response.snapshots || []);
            },
            error: () => resolve([])
          });
        })
      );
    });
    
    Promise.all(promises).then(allSnapshots => {
      const snapshots = allSnapshots.flat();
      
      // Calculate performance metrics from snapshots
      let totalBytes = 0;
      let totalDuration = 0;
      let maxTransferRate = 0;
      let totalFiles = 0;
      let totalCpuTimeEstimate = 0;
      let snapshotTypes = new Map();
      
      // Group snapshots by type (from tags or paths)
      snapshots.forEach(snapshot => {
        if (snapshot.summary) {
          // Extract duration and bytes processed
          const duration = parseFloat(snapshot.summary.totalDuration || '0');
          const bytes = parseInt(snapshot.summary.totalBytesProcessed || '0');
          const files = parseInt(snapshot.summary.totalFilesProcessed || '0');
          
          if (duration > 0 && bytes > 0) {
            // Calculate transfer rate in MB/s
            const transferRate = (bytes / duration) / (1024 * 1024);
            maxTransferRate = Math.max(maxTransferRate, transferRate);
            
            totalBytes += bytes;
            totalDuration += duration;
            totalFiles += files;
            
            // Estimate CPU usage (this is a rough approximation)
            totalCpuTimeEstimate += duration * 0.7; // Assuming 70% CPU usage during backup
            
            // Determine backup type from tags or paths
            let backupType = 'Unknown';
            
            // Check if there are tags
            if (snapshot.tags && snapshot.tags.length > 0) {
              // Look for plan tag
              const planTag = snapshot.tags.find((tag: string) => tag.startsWith('plan:'));
              if (planTag) {
                backupType = planTag.replace('plan:', '');
              }
            }
            
            // If still unknown, try to determine from paths
            if (backupType === 'Unknown' && snapshot.paths && snapshot.paths.length > 0) {
              if (snapshot.paths.includes('/etc') && snapshot.paths.includes('/home')) {
                backupType = 'System + Home';
              } else if (snapshot.paths.includes('/etc')) {
                backupType = 'System Config';
              } else if (snapshot.paths.includes('/home')) {
                backupType = 'Home Directories';
              } else if (snapshot.paths.includes('/var')) {
                backupType = 'Variable Data';
              } else {
                backupType = snapshot.paths[0].split('/').filter(Boolean)[0] || 'Other';
              }
            }
            
            // Add to backup types for duration chart
            if (!snapshotTypes.has(backupType)) {
              snapshotTypes.set(backupType, { duration: 0, count: 0 });
            }
            
            const typeData = snapshotTypes.get(backupType);
            typeData.duration += duration / 60; // Convert to minutes
            typeData.count += 1;
          }
        }
      });
      
      // Calculate average metrics
      const avgTransferRate = totalDuration > 0 
        ? (totalBytes / totalDuration) / (1024 * 1024) 
        : 0;
      
      const avgCpuUsage = totalDuration > 0 
        ? (totalCpuTimeEstimate / totalDuration) * 100 
        : 0;
      
      // Estimate memory usage (rough approximation)
      const avgMemoryUsage = Math.min(1.5 + (totalFiles / 100000), 8);
      
      // Update performance metrics with calculated values
      this.performanceMetrics = {
        avgTransferRate: parseFloat(avgTransferRate.toFixed(1)),
        maxTransferRate: parseFloat(maxTransferRate.toFixed(1)),
        avgCpuUsage: parseFloat(avgCpuUsage.toFixed(1)),
        avgMemoryUsage: parseFloat(avgMemoryUsage.toFixed(2))
      };
      
      // Create duration by backup type chart
      const durationByType = Array.from(snapshotTypes.entries()).map(([type, data]) => {
        return {
          type: type,
          avgDuration: data.count > 0 ? data.duration / data.count : 0
        };
      });
      
      // Sort by duration for better visualization
      durationByType.sort((a, b) => b.avgDuration - a.avgDuration);
      
      // Update backup duration chart
      this.backupDurationChart = {
        labels: durationByType.map(item => item.type),
        datasets: [
          {
            label: 'Average Duration (minutes)',
            data: durationByType.map(item => item.avgDuration),
            backgroundColor: '#3186ea'
          }
        ]
      };
      
      this.loadingPerformanceStats = false;
    });
  }
  
  loadRepositoryHealth(): void {
    this.loadingRepositoryHealth = true;
    
    // Create a map to store repository health data
    const repoHealthMap = new Map();
    
    // Initialize with basic repository info
    this.backrestRepositories.forEach(repo => {
      repoHealthMap.set(repo.repository_id, {
        ...repo,
        health: 'unknown',
        lastCheck: new Date().toISOString(),
        storageUsed: 0,
        backupCount: 0,
        integrity: 'unknown'
      });
    });
    
    // Load snapshot data for each repository
    const promises = this.backrestRepositories.map(repo => {
      return new Promise<void>((resolve) => {
        this.backrestService.getSnapshots(repo.repository_id).subscribe({
          next: (response) => {
            const snapshots = response.snapshots || [];
            const repoData = repoHealthMap.get(repo.repository_id);
            
            if (repoData) {
              // Update storage used and backup count
              repoData.backupCount = snapshots.length;
              
              // Determine health status based on snapshots
              if (snapshots.length > 0) {
                repoData.health = 'good';
                
                // Get the latest snapshot time for last check
                const latestSnapshot = [...snapshots].sort((a, b) => {
                  return parseInt(b.unixTimeMs || '0') - parseInt(a.unixTimeMs || '0');
                })[0];
                
                if (latestSnapshot && latestSnapshot.unixTimeMs) {
                  repoData.lastCheck = new Date(parseInt(latestSnapshot.unixTimeMs)).toISOString();
                }
                
                // Calculate total storage used
                let totalStorage = 0;
                snapshots.forEach((snapshot: any) => {
                  if (snapshot.summary && snapshot.summary.dataAdded) {
                    totalStorage += parseInt(snapshot.summary.dataAdded);
                  }
                });
                
                repoData.storageUsed = totalStorage;
                
                // Set integrity to verified if we have successful snapshots
                repoData.integrity = 'verified';
              } else {
                repoData.health = 'warning';
                repoData.integrity = 'needs_check';
              }
            }
            
            resolve();
          },
          error: () => resolve()
        });
      });
    });
    
    // Wait for all repository data to load
    Promise.all(promises).then(() => {
      // Convert map to array for display
      this.repositories = Array.from(repoHealthMap.values());
      this.loadingRepositoryHealth = false;
    });
  }
  
  loadBackrestRepositories(): void {
    this.backrestService.getRepositories().subscribe({
      next: (data) => {
        this.backrestRepositories = data.repositories || [];
        if (this.backrestRepositories.length > 0) {
          this.selectedRepoId = this.backrestRepositories[0].repository_id;
          this.loadRepoStats(this.selectedRepoId);
        } else {
          this.loadingRepoStats = false;
        }
      },
      error: (err) => {
        console.error('Failed to load Backrest repositories:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load Backrest repositories'
        });
        this.loadingRepoStats = false;
      }
    });
  }

  loadRepoStats(repoId: string): void {
    this.loadingRepoStats = true;
    
    this.backrestService.getSnapshots(repoId).subscribe({
      next: (response) => {
        const snapshots = response.snapshots || [];
        
        // Calculate accurate metrics from snapshots
        let totalSize = 0;      // Total bytes processed (original size)
        let totalSizeOnDisk = 0; // Actual storage after compression/deduplication
        
        // Process each snapshot
        snapshots.forEach((snapshot: any) => {
          if (snapshot.summary) {
            // Original size (before compression/deduplication)
            if (snapshot.summary.totalBytesProcessed) {
              totalSize += parseInt(snapshot.summary.totalBytesProcessed);
            }
            
            // Actual size on disk
            if (snapshot.summary.dataAdded) {
              totalSizeOnDisk += parseInt(snapshot.summary.dataAdded);
            }
          }
        });
        
        // Calculate compression ratio - ensure we don't divide by zero
        const compressionRatio = totalSizeOnDisk > 0 
          ? totalSize / totalSizeOnDisk  // This is the correct formula: original/compressed
          : 1.0;
        
        // Store raw bytes values for the formatBytes function to handle
        this.repoStats = {
          total_size: totalSize,
          total_size_on_disk: totalSizeOnDisk,
          compression_ratio: compressionRatio,
          snapshot_count: snapshots.length
        };
        
        console.log('Repository Stats:', {
          totalSize: this.formatBytes(totalSize),
          sizeOnDisk: this.formatBytes(totalSizeOnDisk),
          ratio: compressionRatio.toFixed(3) + 'x',
          snapshots: snapshots.length
        });
        
        // Create the storage composition chart with correct data
        this.prepareRepoStorageChart(totalSize, totalSizeOnDisk);
        
        // Load operations
        this.loadRepoOperations(repoId);
        this.loadingRepoStats = false;
      },
      error: (err) => {
        console.error('Failed to load snapshots for repo stats:', err);
        this.loadingRepoStats = false;
      }
    });
  }
  
  prepareRepoStorageChart(totalSize: number, sizeOnDisk: number): void {
    // Calculate saved space due to compression/deduplication
    const savedSpace = Math.max(0, totalSize - sizeOnDisk);
    
    this.repoStorageChart = {
      labels: ['Actual Size on Disk', 'Space Saved'],
      datasets: [{
        data: [
          // Convert to GB for better visualization
          parseFloat((sizeOnDisk / (1024 * 1024 * 1024)).toFixed(2)),
          parseFloat((savedSpace / (1024 * 1024 * 1024)).toFixed(2))
        ],
        backgroundColor: ['#3186ea', '#42b983'],
        hoverBackgroundColor: ['#1976d2', '#2f9c6f']
      }]
    };
  }

  refreshRepoStats(): void {
    if (!this.selectedRepoId) return;
    
    this.loadingRepoStats = true;
    this.backrestService.computeRepoStats(this.selectedRepoId).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Statistics computation triggered'
        });
        
        // Wait a bit for computation to complete
        setTimeout(() => {
          this.loadRepoStats(this.selectedRepoId);
        }, 2000);
      },
      error: (err) => {
        console.error('Failed to compute stats:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to trigger statistics computation'
        });
        this.loadingRepoStats = false;
      }
    });
  }

  // Helper method for formatting duration
  getDuration(startTime: string, endTime: string): string {
    if (!startTime || !endTime) return 'N/A';
    
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    
    if (isNaN(start) || isNaN(end) || end <= start) return 'N/A';
    
    const durationMs = end - start;
    const seconds = Math.floor(durationMs / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  }
  
  // Helper method to cancel an operation
  cancelOperation(operationId: string): void {
    if (!this.selectedRepoId || !operationId) return;
    
    this.backrestService.cancelOperation(operationId, this.selectedRepoId).subscribe({
      next: (response) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Operation canceled successfully'
        });
        
        // Reload operations after cancellation
        setTimeout(() => {
          this.loadRepoOperations(this.selectedRepoId);
        }, 1500);
      },
      error: (err) => {
        console.error('Failed to cancel operation:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to cancel operation'
        });
      }
    });
  }
  
  formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      return `${hours} hr ${mins} min`;
    }
  }
  
  getHealthSeverity(health: string): string {
    switch (health) {
      case 'good': return 'success';
      case 'warning': return 'warning';
      case 'critical': return 'danger';
      default: return 'info';
    }
  }
  
  getIntegritySeverity(integrity: string): string {
    switch (integrity) {
      case 'verified': return 'success';
      case 'needs_check': return 'warning';
      case 'failed': return 'danger';
      default: return 'info';
    }
  }
  
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }
  
  logout(): void {
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

  testApiDirectly(): void {
    // Test repositories endpoint
    this.apiService.get('backrest/repositories').subscribe(
      data => {
        console.log('Direct API call - repositories:', data);
        const repoData = data as { repositories?: any[] };
        this.messageService.add({
          severity: 'info',
          summary: 'Repositories API Response',
          detail: `Found ${(repoData.repositories || []).length} repositories`,
        });
      },
      err => console.error('Direct API call failed - repositories:', err)
    );

    // If you have a repository ID, test that too
    if (this.backrestRepositories.length > 0) {
      const repoId = this.backrestRepositories[0].repository_id;
      this.apiService.get(`backrest/repos/${repoId}/stats`).subscribe(
        data => {
          console.log(`Direct API call - stats for ${repoId}:`, data);
          const statsData = data as { status?: string };
          this.messageService.add({
            severity: 'info',
            summary: 'Repository Stats API Response',
            detail: `Status: ${statsData.status || 'unknown'}`,
          });
        },
        err => console.error(`Direct API call failed - stats for ${repoId}:`, err)
      );
    }
  }

  syncBackrestData(): void {
    this.loadingBackupStats = true;
    this.messageService.add({
      severity: 'info',
      summary: 'Starting Sync',
      detail: 'Synchronizing backup data from Backrest...'
    });
    
    // Use existing sync endpoints
    this.apiService.post('backrest/operations/sync_operations/', {}).subscribe({
      next: () => {
        // Sync logs
        this.apiService.post('backrest/logs/sync_logs/', {}).subscribe({
          next: () => {
            // Get repositories and sync snapshots
            this.backrestService.getRepositories().subscribe({
              next: (response) => {
                const repositories = response.repositories || [];
                const syncPromises: Promise<void>[] = [];
                
                // Sync snapshots for each repository using the correct endpoint
                repositories.forEach((repo: any) => {
                  syncPromises.push(
                    new Promise<void>((resolve) => {
                      this.apiService.post(`backrest/repositories/${repo.id}/sync_snapshots/`, {}).subscribe({
                        next: () => resolve(),
                        error: () => resolve()
                      });
                    })
                  );
                });
                
                Promise.all(syncPromises).then(() => {
                  this.messageService.add({
                    severity: 'success',
                    summary: 'Sync Completed',
                    detail: 'Backrest data synchronized successfully'
                  });
                  
                  // Reload analytics data
                  setTimeout(() => {
                    this.loadAnalyticsData();
                  }, 2000);
                });
              },
              error: (err) => {
                console.error('Failed to get repositories for sync:', err);
                this.loadingBackupStats = false;
              }
            });
          },
          error: (err) => {
            console.error('Failed to sync logs:', err);
            this.loadingBackupStats = false;
          }
        });
      },
      error: (err) => {
        console.error('Failed to sync operations:', err);
        this.loadingBackupStats = false;
      }
    });
  }

  loadRepoOperations(repoId: string): void {
    // First get operations from API
    this.backrestService.getRepoOperations(repoId, 10).subscribe({
      next: (response) => {
        if (response.status === 'success' && response.operations && response.operations.length > 0) {
          this.repoOperations = response.operations;
          this.loadingRepoStats = false;
        } else {
          // If no operations returned from API, create from snapshots
          this.createOperationsFromSnapshots(repoId);
        }
      },
      error: () => {
        // On error, try to create operations from snapshots
        this.createOperationsFromSnapshots(repoId);
      }
    });
  }
  onRepoChange(event: any): void {
  // Get the selected repository ID from the event
  const repoId = event.value;
  
  if (repoId) {
    // Load stats for the selected repository
    this.loadRepoStats(repoId);
  }
}

  // New method to create operations from snapshots
  createOperationsFromSnapshots(repoId: string): void {
    this.backrestService.getSnapshots(repoId).subscribe({
      next: (response) => {
        const snapshots = response.snapshots || [];
        const operations: any[] = [];
        
        // Convert snapshots to operations format
        snapshots.forEach((snapshot: any) => {
          if (snapshot.unixTimeMs) {
            const startTime = new Date(parseInt(snapshot.unixTimeMs));
            let endTime = new Date(startTime);
            
            // Calculate end time based on duration
            if (snapshot.summary && snapshot.summary.totalDuration) {
              const durationMs = parseFloat(snapshot.summary.totalDuration) * 1000;
              endTime = new Date(startTime.getTime() + durationMs);
            }
            
            // Determine operation type from tags
            let operationType = 'backup';
            if (snapshot.tags) {
              const planTag = snapshot.tags.find((tag: string) => tag.startsWith('plan:'));
              if (planTag) {
                const planName = planTag.replace('plan:', '');
                if (planName.includes('full')) {
                  operationType = 'full_backup';
                } else if (planName.includes('incr')) {
                  operationType = 'incremental_backup';
                }
              }
            }
            
            // Create operation object
            operations.push({
              operation_id: snapshot.id,
              operation_type: operationType,
              status: 'completed',
              started_at: startTime.toISOString(),
              completed_at: endTime.toISOString(),
              snapshot_id: snapshot.id
            });
          }
        });
        
        // Sort by start time (newest first)
        operations.sort((a, b) => {
          return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
        });
        
        this.repoOperations = operations;
        this.loadingRepoStats = false;
      },
      error: (err) => {
        console.error('Failed to load snapshots for operations:', err);
        this.repoOperations = [];
        this.loadingRepoStats = false;
      }
    });
  }

  prepareDataGrowthChart(): void {
    console.log('Preparing data growth chart...');
    console.log('Repositories with snapshots:', this.backrestRepositories);
    
    if (!this.backrestRepositories || this.backrestRepositories.length === 0) {
      this.dataGrowthChart = {
        labels: [],
        datasets: [{
          label: 'Total Data (GB)',
          data: [],
          borderColor: '#42A5F5',
          backgroundColor: 'rgba(66, 165, 245, 0.1)',
          fill: true,
          tension: 0.4
        }]
      };
      return;
    }

    // FIXED: Use dataAdded for actual repository size growth
    const allSnapshots: any[] = [];
    
    this.backrestRepositories.forEach(repo => {
      if (repo.snapshots && repo.snapshots.length > 0) {
        repo.snapshots.forEach((snapshot: any) => {
          if (snapshot.unixTimeMs && snapshot.summary) {
            const timestamp = parseInt(snapshot.unixTimeMs);
            const date = new Date(timestamp);
            
            // CRITICAL FIX: Use dataAdded instead of totalBytesProcessed
            // dataAdded represents actual data stored in repository after deduplication
            let dataSize = 0;
            
            if (snapshot.summary.dataAdded) {
              dataSize = parseInt(snapshot.summary.dataAdded);
            } else if (snapshot.summary.totalSize) {
              dataSize = parseInt(snapshot.summary.totalSize);
            }
            
            // Convert bytes to GB
            const dataSizeGB = dataSize / (1024 * 1024 * 1024);
            
            if (dataSizeGB > 0) {
              allSnapshots.push({
                date: date,
                timestamp: timestamp,
                dataSizeGB: dataSizeGB,
                repoName: repo.name || repo.repository_id,
                snapshotId: snapshot.id
              });
            }
          }
        });
      }
    });

    console.log('All snapshots for chart:', allSnapshots);

    // Sort by timestamp
    allSnapshots.sort((a, b) => a.timestamp - b.timestamp);

    if (allSnapshots.length === 0) {
      console.log('No snapshots with data found');
      this.dataGrowthChart = {
        labels: ['No Data'],
        datasets: [{
          label: 'Total Data (GB)',
          data: [0],
          borderColor: '#42A5F5',
          backgroundColor: 'rgba(66, 165, 245, 0.1)',
          fill: true,
          tension: 0.4
        }]
      };
      return;
    }

    // FIXED: Calculate cumulative repository growth properly
    const dailyTotals = new Map<string, number>();
    let runningTotal = 0;

    allSnapshots.forEach(snapshot => {
      const dateKey = snapshot.date.toISOString().split('T')[0];
      
      // Add this snapshot's data to running total
      runningTotal += snapshot.dataSizeGB;
      
      // Store the cumulative total for this date
      // If multiple snapshots on same day, keep the latest total
      dailyTotals.set(dateKey, runningTotal);
      
      console.log(`${dateKey}: +${snapshot.dataSizeGB.toFixed(3)} GB, Total: ${runningTotal.toFixed(3)} GB (${snapshot.snapshotId.substring(0, 8)})`);
    });

    // Convert to chart format
    const sortedDates = Array.from(dailyTotals.keys()).sort();
    const labels = sortedDates.map(date => {
      const d = new Date(date);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const data = sortedDates.map(date => {
      const value = dailyTotals.get(date) || 0;
      return Math.round(value * 1000) / 1000;
    });

    console.log('Data Growth Chart - Labels:', labels);
    console.log('Data Growth Chart - Data (GB):', data);
    console.log('Data range:', Math.min(...data), 'to', Math.max(...data));

    this.dataGrowthChart = {
      labels: labels,
      datasets: [{
        label: 'Repository Size (GB)',
        data: data,
        borderColor: '#42A5F5',
        backgroundColor: 'rgba(66, 165, 245, 0.1)',
        fill: true,
        tension: 0.4
      }]
    };
  }

  // Add this method to your component
  checkRepositoryIntegrity(repo?: any): void {
    // If repo is passed directly, use it; otherwise use the selected repo from table
    const targetRepo = repo || this.selectedRepoForCheck;
    
    if (!targetRepo || !targetRepo.repository_id) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Please select a repository to check'
      });
      return;
    }
    
    this.checkingRepository = targetRepo;
    this.showCheckDialog = true;
    this.checkInProgress = true;
    this.checkSuccess = false;
    this.checkOutput = '';
    this.checkResult = null;
    
    this.backrestService.checkRepositoryIntegrity(targetRepo.repository_id).subscribe({
      next: (response) => {
        this.checkInProgress = false;
        this.checkResult = response;
        
        if (response.status === 'success') {
          this.checkSuccess = true;
          this.checkOutput = response.output || 'Check completed successfully';
          
          // Update repository integrity status
          targetRepo.integrity = 'verified';
          targetRepo.lastCheck = new Date().toISOString();
          
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Repository integrity check completed successfully'
          });
        } else {
          this.checkSuccess = false;
          this.checkOutput = response.output || 'Check failed without specific error details';
          
          // Update repository status
          targetRepo.integrity = 'failed';
          targetRepo.lastCheck = new Date().toISOString();
          
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Repository integrity check failed'
          });
        }
      },
      error: (error) => {
        this.checkInProgress = false;
        this.checkSuccess = false;
        this.checkOutput = error.message || 'An error occurred during the integrity check';
        
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to check repository integrity'
        });
        
        console.error('Repository integrity check error:', error);
      }
    });
  }
}
