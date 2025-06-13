import { Component, OnInit, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
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
import { Tag, TagModule

 } from 'primeng/tag';

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
    TagModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.css'
})
export class AnalyticsComponent implements OnInit {
  // User and tenant info
  username: string = '';
  tenantName: string = '';
  
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
  
  // Charts data
  backupSuccessChart: any;
  backupSuccessOptions: any;
  
  storageUsageChart: any;
  storageUsageOptions: any;
  
  dataGrowthChart: any;
  dataGrowthOptions: any;
  
  backupDurationChart: any;
  backupDurationOptions: any;
  
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

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private messageService: MessageService,
    private router: Router,
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
  
  loadAnalyticsData(): void {
    this.loadBackupStats();
    this.loadStorageStats();
    this.loadPerformanceMetrics();
    this.loadRepositoryHealth();
  }
  
  loadBackupStats(): void {
    this.loadingBackupStats = true;
    
    // Create date string parameters for API call
    const startDate = this.dateRange[0]?.toISOString().split('T')[0] || '';
    const endDate = this.dateRange[1]?.toISOString().split('T')[0] || '';
    
    this.apiService.get(`backrest/operations/statistics/?start_date=${startDate}&end_date=${endDate}`).subscribe({
      next: (data: any) => {
        // Update summary stats
        this.summaryStats.totalBackups = data.total_backups || 0;
        this.summaryStats.successRate = data.success_rate || 0;
        this.summaryStats.avgBackupDuration = data.avg_duration_minutes || 0;
        
        // Update backup success/failure chart
        if (data.time_series && Array.isArray(data.time_series)) {
          const labels = data.time_series.map((item: any) => item.date);
          const successData = data.time_series.map((item: any) => item.success_count);
          const failureData = data.time_series.map((item: any) => item.failure_count);
          
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
        }
        
        // Update backup duration chart if available
        if (data.duration_by_type && Array.isArray(data.duration_by_type)) {
          const labels = data.duration_by_type.map((item: any) => item.type);
          const durations = data.duration_by_type.map((item: any) => item.avg_duration_minutes);
          
          this.backupDurationChart = {
            labels: labels,
            datasets: [
              {
                label: 'Average Duration (minutes)',
                data: durations,
                backgroundColor: '#3186ea'
              }
            ]
          };
        }
        
        this.loadingBackupStats = false;
      },
      error: (err) => {
        console.error('Failed to load backup statistics:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load backup statistics'
        });
        this.loadingBackupStats = false;
      }
    });
  }
  
  loadStorageStats(): void {
    this.loadingStorageStats = true;
    
    this.apiService.get('backrest/repositories/storage-stats/').subscribe({
      next: (data: any) => {
        // Update summary stats
        this.summaryStats.totalStorageUsed = data.total_storage_used || 0;
        this.summaryStats.avgBackupSize = data.avg_backup_size || 0;
        this.summaryStats.dataDeduplicationRatio = data.deduplication_ratio || 1;
        
        // Update storage usage chart
        if (data.storage_available !== undefined && data.storage_used !== undefined) {
          this.storageUsageChart = {
            labels: ['Used', 'Available'],
            datasets: [
              {
                data: [data.storage_used, data.storage_available - data.storage_used],
                backgroundColor: ['#3186ea', '#374151'],
                hoverBackgroundColor: ['#1976d2', '#4b5563']
              }
            ]
          };
        }
        
        // Update data growth chart
        if (data.growth_over_time && Array.isArray(data.growth_over_time)) {
          const labels = data.growth_over_time.map((item: any) => item.date);
          const storageData = data.growth_over_time.map((item: any) => item.storage_used);
          
          this.dataGrowthChart = {
            labels: labels,
            datasets: [
              {
                label: 'Total Data (GB)',
                data: storageData,
                fill: true,
                backgroundColor: 'rgba(49, 134, 234, 0.2)',
                borderColor: '#3186ea',
                tension: 0.4
              }
            ]
          };
        }
        
        this.loadingStorageStats = false;
      },
      error: (err) => {
        console.error('Failed to load storage statistics:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load storage statistics'
        });
        this.loadingStorageStats = false;
      }
    });
  }
  
  loadPerformanceMetrics(): void {
    this.loadingPerformanceStats = true;
    
    this.apiService.get('backrest/operations/performance-metrics/').subscribe({
      next: (data: any) => {
        // Update performance metrics
        this.performanceMetrics = {
          avgTransferRate: data.avg_transfer_rate || 0,
          maxTransferRate: data.max_transfer_rate || 0,
          avgCpuUsage: data.avg_cpu_usage || 0,
          avgMemoryUsage: data.avg_memory_usage || 0
        };
        
        this.loadingPerformanceStats = false;
      },
      error: (err) => {
        console.error('Failed to load performance metrics:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load performance metrics'
        });
        this.loadingPerformanceStats = false;
        
        // Set default values for demo purposes
        this.performanceMetrics = {
          avgTransferRate: 42.5,
          maxTransferRate: 95.2,
          avgCpuUsage: 22.3,
          avgMemoryUsage: 1.85
        };
      }
    });
  }
  
  loadRepositoryHealth(): void {
    this.loadingRepositoryHealth = true;
    
    this.apiService.get('backrest/repositories/').subscribe({
      next: (data: any) => {
        this.repositories = Array.isArray(data) ? data : [];
        
        // Add health metrics for demo (in a real app this would come from the API)
        this.repositories = this.repositories.map(repo => ({
          ...repo,
          health: Math.random() > 0.8 ? 'warning' : 'good',
          lastCheck: new Date(Date.now() - Math.floor(Math.random() * 72) * 3600000).toISOString(),
          storageUsed: Math.floor(Math.random() * 500),
          backupCount: Math.floor(Math.random() * 50) + 10,
          integrity: Math.random() > 0.9 ? 'needs_check' : 'verified'
        }));
        
        this.loadingRepositoryHealth = false;
      },
      error: (err) => {
        console.error('Failed to load repository health:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load repository health information'
        });
        this.loadingRepositoryHealth = false;
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
}
