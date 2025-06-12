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
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { SplitButtonModule } from 'primeng/splitbutton';
import { TabViewModule } from 'primeng/tabview';
import { ChipModule } from 'primeng/chip';
import { InputNumberModule } from 'primeng/inputnumber';
import { RadioButtonModule } from 'primeng/radiobutton';

// Services
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-plans',
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
    DialogModule,
    ConfirmDialogModule,
    TooltipModule,
    InputTextModule,
    SplitButtonModule,
    TabViewModule,
    ChipModule,
    InputNumberModule,
    RadioButtonModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './plans.component.html',
})
export class PlansComponent implements OnInit {
  @ViewChild('dt') dt!: Table;
  
  plans: any[] = [];
  loading: boolean = true;
  selectedPlan: any = null;
  planDetailsVisible: boolean = false;
  editMode: boolean = false;
  tenantName: string = '';
  username: string = '';
  splitButtonItems: any[] = [];
  
  // For the dropdown menus in edit mode
  repositories: any[] = [];
  servers: any[] = [];
  
  // Add this property
  createPlanDialogVisible: boolean = false;
  
  // Properties referenced in the template but missing in the component
  isCreatingPlan: boolean = false;
  newPlan: any = {
    planType: 'cycle',
    name: '',
    repository: null,
    paths: ['/etc', '/home'],
    excludes: ['*.tmp', '*.log'],
    scheduleType: 'cron',
    cronExpression: '0 1 * * *',
    intervalValue: 24,
    intervalUnit: 'hours',
    retentionType: 'time-period',
    retention: {
      keepLastN: 5,
      hourly: 0,
      daily: 7,
      weekly: 4,
      monthly: 1,
      yearly: 0
    }
  };
  
  // Cron scheduler properties
  cronFrequency: string = 'daily';
  cronHour: number = 1;
  cronMinute: number = 0;
  cronDayOfWeek: number = 1; // Monday
  cronDayOfMonth: number = 1; // 1st day

  // Options for dropdowns
  cronFrequencyOptions = [
    { label: 'Hourly', value: 'hourly' },
    { label: 'Daily', value: 'daily' },
    { label: 'Weekly', value: 'weekly' },
    { label: 'Monthly', value: 'monthly' }
  ];

  daysOfWeekOptions = [
    { label: 'Sunday', value: 0 },
    { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 },
    { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 },
    { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 }
  ];

  retentionTypeOptions = [
    { label: 'Keep last N backups', value: 'count' },
    { label: 'Time-based retention', value: 'time-period' },
    { label: 'Keep all backups', value: 'none' }
  ];

  intervalUnitOptions = [
    { label: 'Hours', value: 'hours' },
    { label: 'Days', value: 'days' },
    { label: 'Weeks', value: 'weeks' }
  ];

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
    
    // First load repositories and servers, then load plans
    this.loadRepositoriesAndServers().then(() => {
      this.loadPlans();
    });
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
  
  async loadRepositoriesAndServers() {
    try {
      // Load repositories - note we're not using toPromise() here as it's deprecated
      this.apiService.get('backrest/repositories/').subscribe({
        next: (repoData: any) => {
          this.repositories = repoData;
          console.log('Repositories loaded:', this.repositories);
          
          // Now load servers
          this.apiService.get('backrest/servers/').subscribe({  // Changed endpoint from backrest/servers to servers
            next: (serverData: any) => {
              this.servers = serverData;
              console.log('Servers loaded:', this.servers);
              
              // After both are loaded, now load plans with the data needed for lookups
              this.loadPlans();
            },
            error: (err) => this.handleApiError(err, 'Failed to load servers')
          });
        },
        error: (err) => this.handleApiError(err, 'Failed to load repositories')
      });
    } catch (err) {
      this.handleApiError(err, 'Failed to load reference data');
    }
  }
  
  // Helper method for error handling
  handleApiError(err: any, message: string) {
    console.error(`${message}:`, err);
    this.messageService.add({
      severity: 'error',
      summary: 'Error',
      detail: message
    });
  }
  
  loadPlans() {
    this.loading = true;
    console.log('Loading plans...');
    
    this.apiService.get('backrest/plans/').subscribe({
      next: (data: any) => {
        console.log('Raw plans data:', data);
        
        if (!Array.isArray(data)) {
          console.error('Unexpected data format:', data);
          this.loading = false;
          return;
        }
        
        // Enhance plans with additional information
        this.plans = data.map((plan: any) => {
          try {
            // Find repository name by matching plan.repository to repo.repository_id
            // This is the key fix - use repository_id instead of id for matching
            const repo = this.repositories.find(r => r.repository_id === plan.repository || r.id === plan.repository);
            console.log(`Looking for repository with ID ${plan.repository}:`, repo);
            const repoName = repo ? repo.name : `Repository #${plan.repository}`;
            
            // Find server by server_id (use the repository's server_id)
            // From your screenshot, it seems repositories have a server_id field
            const repoServerId = repo ? repo.server : null;
            const server = this.servers.find(s => s.id === repoServerId);
            console.log(`Looking for server with ID ${repoServerId}:`, server);
            const serverName = server ? server.name || server.hostname : `Server #${repoServerId}`;
            const serverIp = server ? (server.ip_address || server.ipAddress || '---') : '---';
          
            
            // Format schedule
            const schedule = this.formatSchedule(plan.schedule?.cron || '');
            
            return {
              ...plan,
              repository_name: repoName,
              server_name: serverName,
              formatted_schedule: schedule,
              server_ip: serverIp,
              status: plan.active ? 'Active' : 'Paused',
              statusSeverity: plan.active ? 'success' : 'warning'
            };
          } catch (e) {
            console.error('Error processing plan:', e, plan);
            return {
              ...plan,
              repository_name: `Error: ${e}`,
              server_name: `Error: ${e}`,
               server_ip: '---',
              formatted_schedule: plan.schedule?.cron || 'Unknown',
              status: plan.active ? 'Active' : 'Paused',
              statusSeverity: plan.active ? 'success' : 'warning'
            };
          }
        });
        
        this.loading = false;
        console.log('Enhanced plans data:', this.plans);
      },
      error: (err) => {
        console.error('Error loading plans:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load backup plans'
        });
        this.loading = false;
      }
    });
  }
  
  formatSchedule(cronExpression: string): string {
    if (!cronExpression) return 'Manual only';
    
    try {
      const parts = cronExpression.trim().split(/\s+/);
      if (parts.length !== 5) return cronExpression;
      
      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
      
      // Handle special characters in parts
      const isAnyMinute = minute === '*';
      const isAnyHour = hour === '*';
      const isAnyDayOfMonth = dayOfMonth === '*';
      const isAnyMonth = month === '*';
      const isAnyDayOfWeek = dayOfWeek === '*';
      
      // Common simple patterns
      if (minute === '0' && hour === '0' && isAnyDayOfMonth && isAnyMonth && dayOfWeek === '0')
        return 'Every Sunday at midnight';
        
      if (minute === '0' && hour === '0' && dayOfMonth === '1' && isAnyMonth && isAnyDayOfWeek)
        return 'First day of each month at midnight';
        
      if (minute === '0' && isAnyHour && isAnyDayOfMonth && isAnyMonth && isAnyDayOfWeek)
        return 'At the start of every hour';
      
      // Specific times of day
      if (!isAnyMinute && !isAnyHour && isAnyDayOfMonth && isAnyMonth && isAnyDayOfWeek) {
        const timeStr = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
        return `Daily at ${timeStr}`;
      }
      
      // Every X hours or minutes
      if (minute.startsWith('*/') && isAnyHour && isAnyDayOfMonth && isAnyMonth && isAnyDayOfWeek) {
        const interval = minute.substring(2);
        return `Every ${interval} minute${interval !== '1' ? 's' : ''}`;
      }
      
      if (minute === '0' && hour.startsWith('*/') && isAnyDayOfMonth && isAnyMonth && isAnyDayOfWeek) {
        const interval = hour.substring(2);
        return `Every ${interval} hour${interval !== '1' ? 's' : ''}`;
      }
      
      // Weekly on specific days
      if (minute === '0' && hour === '0' && isAnyDayOfMonth && isAnyMonth && !isAnyDayOfWeek) {
        const dayMap = {
          '0': 'Sunday', '1': 'Monday', '2': 'Tuesday', '3': 'Wednesday', 
          '4': 'Thursday', '5': 'Friday', '6': 'Saturday', '7': 'Sunday'
        };
        
        // Handle day ranges like 1-5
        if (dayOfWeek.includes('-')) {
          const [start, end] = dayOfWeek.split('-');
          if (start === '1' && end === '5') return 'Every weekday at midnight';
          return `Every ${dayMap[start as keyof typeof dayMap]} through ${dayMap[end as keyof typeof dayMap]} at midnight`;
        }
        
        // Handle comma-separated days
        if (dayOfWeek.includes(',')) {
          const days = dayOfWeek
            .split(',')
            .map(d => dayMap[d as keyof typeof dayMap])
            .join(', ');
          return `Every ${days} at midnight`;
        }
        
        return `Every ${dayMap[dayOfWeek as keyof typeof dayMap]} at midnight`;
      }
      
      // Daily at specific time
      if (minute === '0' && !isAnyHour && isAnyDayOfMonth && isAnyMonth && isAnyDayOfWeek)
        return `Daily at ${hour}:00`;
        
      // Specific pattern for your case
      if (minute === '0' && hour === '1' && isAnyDayOfMonth && isAnyMonth && dayOfWeek === '0,2,3,4,5,6')
        return 'Daily at 1:00 AM (except Mondays)';
      
      if (minute === '0' && hour === '1' && isAnyDayOfMonth && isAnyMonth && isAnyDayOfWeek)
        return 'Daily at 1:00 AM';
        
      // Handle specific complex patterns
      // Full/Incremental backup pattern
      if (minute === '0' && hour === '1' && isAnyDayOfMonth && isAnyMonth && dayOfWeek === '1')
        return 'Weekly on Monday at 1:00 AM';
      
      // Default if no specific pattern is matched
      return cronExpression;
      
    } catch (e) {
      console.error('Error formatting cron expression:', e);
      return cronExpression;
    }
  }
  
  showPlanDetails(plan: any): void {
    // Create a deep copy of the plan to prevent unintentional two-way binding
    this.selectedPlan = JSON.parse(JSON.stringify(plan));
    
    // Ensure required nested objects exist to prevent null reference errors
    if (!this.selectedPlan.paths) this.selectedPlan.paths = [];
    if (!this.selectedPlan.excludes) this.selectedPlan.excludes = [];
    if (!this.selectedPlan.schedule) this.selectedPlan.schedule = {};
    if (!this.selectedPlan.retention) {
      this.selectedPlan.retention = {
        keepLastN: 0,
        hourly: 0,
        daily: 0,
        weekly: 0,
        monthly: 0,
        yearly: 0
      };
    }
    
    this.editMode = false;
    this.planDetailsVisible = true;
    
    console.log('Selected plan details:', this.selectedPlan); // Add for debugging
  }
  
  editPlan(plan: any): void {
    this.showPlanDetails(plan); // Reuse the same initialization logic
    this.editMode = true;
  }
  
  savePlan() {
    // Prepare data for API
    const planData: any = {
      name: this.selectedPlan.name,
      active: this.selectedPlan.status === 'Active',
      repository_id: this.selectedPlan.repository_id,
      server_id: this.selectedPlan.server_id,
      paths: this.selectedPlan.paths,
      excludes: this.selectedPlan.excludes,
      retention: this.selectedPlan.retention
    };
    
    // Handle schedule based on type
    if (this.selectedPlan.scheduleType === 'cron' && this.selectedPlan.schedule?.cron) {
      planData.schedule = { cron: this.selectedPlan.schedule.cron };
    } else {
      planData.schedule = null;
    }
    
    this.apiService.patch(`backrest/plans/${this.selectedPlan.id}`, planData).subscribe({
      next: (response) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Plan updated successfully'
        });
        this.planDetailsVisible = false;
        this.loadPlans();
      },
      error: (err) => {
        console.error('Error updating plan:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.message || 'Failed to update plan'
        });
      }
    });
  }
  
  deletePlan(plan: any) {
    this.confirmationService.confirm({
      message: `Are you sure you want to delete the plan "${plan.name}"?`,
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.apiService.delete(`backrest/plans/${plan.id}`).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Plan deleted successfully'
            });
            this.loadPlans();
          },
          error: (err) => {
            console.error('Error deleting plan:', err);
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: 'Failed to delete plan'
            });
          }
        });
      }
    });
  }
  
  togglePlanStatus(plan: any) {
    const newStatus = plan.status === 'Active' ? false : true;
    
    this.apiService.patch(`backrest/plans/${plan.id}`, { active: newStatus }).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: `Plan ${newStatus ? 'activated' : 'paused'}`
        });
        this.loadPlans();
      },
      error: (err) => {
        console.error('Error updating plan status:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to update plan status'
        });
      }
    });
  }
  
  showCreatePlanDialog() {
    console.log('Opening create plan dialog');
    
    // Ensure repositories are loaded
    if (this.repositories.length === 0 || this.servers.length === 0) {
      this.loadRepositoriesAndServers();
    }
    
    // Reset form to defaults
    this.newPlan = {
      planType: 'cycle',
      name: '',
      repository: null, // This will be the full repository object, not just the ID
      repository_id: null, // We'll set this when repository is selected
      paths: ['/etc', '/home'],
      excludes: ['*.tmp', '*.log'],
      scheduleType: 'cron',
      cronExpression: '0 1 * * 1', // Every Monday at 1 AM
      intervalValue: 24,
      intervalUnit: 'hours',
      retentionType: 'time-period',
      retention: {
        keepLastN: 5,
        hourly: 0,
        daily: 7,
        weekly: 4,
        monthly: 1,
        yearly: 0
      }
    };
    
    // Set default cron values
    this.cronFrequency = 'weekly'; // Changed to weekly to match Monday 1 AM
    this.cronHour = 1;
    this.cronMinute = 0;
    this.cronDayOfWeek = 1; // Monday
    this.cronDayOfMonth = 1;
    
    // Display the dialog
    this.createPlanDialogVisible = true;
  }
  
  // Add this method to handle repository selection changes
  onRepositoryChange(event: any) {
    console.log('Repository selected:', event);
    
    // Set the repository_id property based on the selected repository
    if (event && event.value) {
      const selectedRepo = event.value;
      this.newPlan.repository_id = selectedRepo.repository_id || selectedRepo.id;
      
      // Fix: Use selectedRepo.server instead of selectedRepo.server_id
      if (selectedRepo.server) {
        this.newPlan.server_id = selectedRepo.server;
        
        // Find server name for display purposes
        const server = this.servers.find(s => s.id === selectedRepo.server);
        if (server) {
          this.newPlan.server_name = server.hostname || server.name;
        }
      }
    }
  }
  
  createPlan() {
    console.log('Creating plan with data:', this.newPlan);
    this.isCreatingPlan = true;
    
    // Extract repository_id correctly
    let repositoryId;
    
    if (typeof this.newPlan.repository === 'object' && this.newPlan.repository !== null) {
      // If repository is an object, get the repository_id property
      repositoryId = this.newPlan.repository.repository_id || this.newPlan.repository.id;
      console.log('Using repository ID from object:', repositoryId);
    } else if (this.newPlan.repository_id) {
      // If we have repository_id directly
      repositoryId = this.newPlan.repository_id;
    } else {
      // Fallback to repository value directly (if it's a primitive)
      repositoryId = this.newPlan.repository;
    }
    
    console.log('Extracted repository ID:', repositoryId);
    
    // Create plan data
    const planData: any = {
      name: this.newPlan.name,
      repository: repositoryId,  // This is the key field that needs to be correct
      paths: this.newPlan.paths.filter((p: string) => p && p.trim() !== ''),
      excludes: this.newPlan.excludes.filter((e: string) => e && e.trim() !== '')
    };
    
    // Add schedule if specified
    if (this.newPlan.scheduleType === 'cron') {
      planData.schedule = {
        clock: 'CLOCK_LOCAL',
        cron: this.newPlan.cronExpression
      };
    }
    
    // Add retention policy
    planData.retention_policy = {
      keep_last: this.newPlan.retention.keepLastN || 5,
      keep_hourly: this.newPlan.retention.hourly || 0,
      keep_daily: this.newPlan.retention.daily || 7,
      keep_weekly: this.newPlan.retention.weekly || 4,
      keep_monthly: this.newPlan.retention.monthly || 1,
      keep_yearly: this.newPlan.retention.yearly || 0
    };
    
    console.log('Sending plan data to API:', planData);
    
    this.apiService.post('backrest/plans/', planData).subscribe({
      next: (response) => {
        this.isCreatingPlan = false;
        console.log('Plan created successfully:', response);
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Plan created successfully'
        });
        this.createPlanDialogVisible = false;
        this.loadPlans();
      },
      error: (err) => {
        this.isCreatingPlan = false;
        console.error('Error creating plan:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.message || 'Failed to create plan'
        });
      }
    });
  }
  
  applyFilter(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (this.dt) {
      this.dt.filterGlobal(target.value, 'contains');
    }
  }
  
  // Helper method to change repository
  changeRepository() {
    if (!this.selectedPlan || !this.editMode) return;
    
    // Get repository name for display
    const repo = this.repositories.find(r => r.id === this.selectedPlan.repository_id);
    if (repo) {
      this.selectedPlan.repository_name = repo.name;
    }
  }

  executePlanNow(plan: any) {
    // Show loading indicator if needed
    plan.executing = true;
    
    this.apiService.post(`backrest/plans/${plan.id}/trigger_backup`, {}).subscribe({
      next: () => {
        plan.executing = false;
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Backup execution started'
        });
      },
      error: (err) => {
        plan.executing = false;
        console.error('Error executing plan:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.message || 'Failed to execute backup plan'
        });
      }
    });
  }

  // Methods referenced in the template but missing in the component
  canCreatePlan(): boolean {
    // Basic validation
    if (!this.newPlan || !this.newPlan.name) {
      return false;
    }

    if (this.newPlan.planType === 'custom') {
      // Check if we have at least one path
      if (!this.newPlan.paths || this.newPlan.paths.length === 0 || 
          !this.newPlan.paths.some((path: string) => path && path.trim() !== '')) {
        return false;
      }
      
      // For cron schedule, ensure we have a cron expression
      if (this.newPlan.scheduleType === 'cron' && !this.newPlan.cronExpression) {
        return false;
      }
    }
    
    // Make sure repository is selected
    if (!this.newPlan.repository) {
      return false;
    }
    
    return true;
  }

  // Helper methods referenced in the template
  addPath() {
    if (!this.newPlan.paths) {
      this.newPlan.paths = [];
    }
    this.newPlan.paths.push('');
  }

  removePath(index: number) {
    this.newPlan.paths.splice(index, 1);
  }

  addExclude() {
    if (!this.newPlan.excludes) {
      this.newPlan.excludes = [];
    }
    this.newPlan.excludes.push('');
  }

  removeExclude(index: number) {
    this.newPlan.excludes.splice(index, 1);
  }

  // Method called when cron settings change
  updateCronExpression(): void {
    if (!this.newPlan) {
      this.newPlan = {
        cronExpression: ''
      };
    }
    
    switch(this.cronFrequency) {
      case 'hourly':
        this.newPlan.cronExpression = `${this.cronMinute} * * * *`;
        break;
      case 'daily':
        this.newPlan.cronExpression = `${this.cronMinute} ${this.cronHour} * * *`;
        break;
      case 'weekly':
        this.newPlan.cronExpression = `${this.cronMinute} ${this.cronHour} * * ${this.cronDayOfWeek}`;
        break;
      case 'monthly':
        this.newPlan.cronExpression = `${this.cronMinute} ${this.cronHour} ${this.cronDayOfMonth} * *`;
        break;
      default:
        this.newPlan.cronExpression = '0 0 * * *'; // Default to midnight every day
    }
  }
}
