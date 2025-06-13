import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { AuthService } from '../../core/services/auth.service';
import { JobService, CreateBackupJobData, ActivityLogEntry } from '../../core/services/job.service';
import { ApiService } from '../../core/services/api.service';
import { ServerService, Server } from '../../core/services/server.service';
import { Subscription, interval } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';

// PrimeNG Modules - add the new ones:
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { TimelineModule } from 'primeng/timeline';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { PasswordModule } from 'primeng/password';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { ToastModule } from 'primeng/toast';
import { SplitButtonModule } from 'primeng/splitbutton';
// Add these:
import { RadioButtonModule } from 'primeng/radiobutton';
import { InputNumberModule } from 'primeng/inputnumber';
import { TabViewModule } from 'primeng/tabview';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    AccordionModule,
    TagModule,
    DividerModule,
    TimelineModule,
    CardModule,
    ChartModule,
    DialogModule,
    InputTextModule,
    DropdownModule,
    TextareaModule,
    CheckboxModule,
    PasswordModule,
    InputGroupModule,
    InputGroupAddonModule,
    ToastModule,
    SplitButtonModule,
    RadioButtonModule,
    InputNumberModule, 
    TabViewModule,
    TooltipModule,
    ConfirmDialogModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
  providers: [MessageService, ConfirmationService]
})
export class DashboardComponent implements OnInit, OnDestroy {
  // Use consistent constructor injection - add JobService
  constructor(
    private authService: AuthService,
    private router: Router,
    private messageService: MessageService,
    private confirmationService: ConfirmationService, // Add this
    private jobService: JobService, // Add JobService
    private apiService: ApiService, // Add ApiService
    private serverService: ServerService, // Inject ServerService
    @Inject(PLATFORM_ID) private platformId: object // Add platformId for browser checks
  ) {}

  // Add username property (ONLY ONCE)
  username: string = 'User'; // Default value
  tenantDomain: string = ''; // Add tenantDomain property
  tenantName: string = ''; // Add tenantName property
  
  // Define splitButtonItems with logout command
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

  // Add subscription property for cleanup
  private activitySubscription: Subscription | null = null;

  // Your existing properties
  backups: any[] = [];
  recentActions: any[] = [];
  chartData: any;
  chartOptions: any;
  backupDialogVisible = false;
  backupName = '';
  targetHosts = '';
  playbookPath = '/etc/ansible/playbooks/backup_playbook.yml'; // Default path
  extraVars = '';
  publickey="";
  backupTypes = [
      { label: 'Full', value: 'full' },
      { label: 'Differential', value: 'diff' },
      { label: 'Incremental (Restic)', value: 'restic' }
  ];
  selectedBackupType = 'restic';
  
  // --- New Properties for Add User Dialog ---
  addUserDialogVisible = false;
  newUser = {
    accountName: '',
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    selectedPolicy: null,
    selectedProvisioningMode: 'auto',
    selectedTemplate: null,
    allowAdminReset: true,
    requireChangeOnLogin: false
  };
  policyOptions = [
    { name: '(none)', code: 'none' },
    { name: 'Default User Policy', code: 'default_user' },
    { name: 'Admin Policy', code: 'admin' }
  ];
  provisioningModeOptions = [
    { name: 'Provision Storage Vaults automatically, when new devices are registered to this user (recommended)', code: 'auto' },
    { name: 'Do not provision Storage Vaults automatically', code: 'manual' },
  ];
  templateOptions = [
    { name: 'System Default [Currently: None]', code: 'default' },
    { name: 'Azure Blob Template', code: 'azure_blob' },
  ];

  // Add new properties to your component class
  createRepoDialogVisible = false;
  newRepo = {
    name: '',
    type: 'local',
    localPath: '', // Empty by default so user can specify
    cloudProvider: 'preset',
    cloudType: null,
    cloudURI: '',
    accessKey: '',
    secretKey: '',
    password: '',
    uri: 'local:/opt/backrest/repos/' // Base URI without subfolder
  };
  isCreatingRepo = false;
  cloudProviderOptions = [
    { name: 'Microsoft Azure Blob Storage', value: 'azure' },
    { name: 'Amazon S3', value: 's3' },
    { name: 'Google Cloud Storage', value: 'gcs' },
    { name: 'SFTP', value: 'sftp' }
  ];
  
  // Add new properties for plan creation
  createPlanDialogVisible = false;
  repositories: { repository_id: number; [key: string]: any }[] = [];
  isCreatingPlan = false;
  newPlan: {
    planType: string;
    name: string;
    repository: { repository_id: number; [key: string]: any } | null;
    paths: string[];
    excludes: string[];
    scheduleType: string;
    cronExpression: string;
    intervalValue: number;
    intervalUnit: string;
    retentionType: string; // <-- Add this line
    retention: {
      keepLastN: number;
      hourly: number;
      daily: number;
      weekly: number;
      monthly: number;
      yearly: number;
    };
  } = this.getDefaultPlanConfig();
  
  intervalUnitOptions = [
    { label: 'Hours', value: 'hours' },
    { label: 'Days', value: 'days' },
    { label: 'Weeks', value: 'weeks' }
  ];
  
  isLoading = false;
  isLoadingActivity = false;
  backrestStatus = 'unknown'; // Add property to track Backrest status
  isBackrestRunning = false; // Add property to track Backrest running state
  serverId: string = ''; // Add serverId property and initialize as needed

  // Add these properties
  servers: Server[] = [];
  selectedServerId: number | null = null;
  
  // In your component class
  repoForm = {
    name: '',
    uri: '',
    password: '',
    // No need to include server here as we have selectedServerId
  };

  // Add this property to your component class (near the other properties)
  plans: any[] = [];

  // Add this with your other component properties
  retentionTypeOptions = [
    { label: 'Keep last N backups', value: 'count' },
    { label: 'Time-based retention (hourly, daily, weekly, etc.)', value: 'time-period' },
    { label: 'Keep all backups', value: 'none' }
  ];

  scheduleTypeOptions = [
    { label: 'Disabled (manual backups only)', value: 'disabled' },
    { label: 'Cron schedule (custom timing)', value: 'cron' },
    { label: 'Interval (recurring period)', value: 'interval' }
  ];

  // Add these properties to your component class
  cronFrequency: string = 'daily';
  cronHour: number = 0;
  cronMinute: number = 0;
  cronDayOfWeek: number = 0; // Sunday
  cronDayOfMonth: number = 1; // 1st day

  // Options for the frequency dropdown
  cronFrequencyOptions = [
    { label: 'Hourly', value: 'hourly' },
    { label: 'Daily', value: 'daily' },
    { label: 'Weekly', value: 'weekly' },
    { label: 'Monthly', value: 'monthly' }
  ];

  // Options for day of week dropdown
  daysOfWeekOptions = [
    { label: 'Sunday', value: 0 },
    { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 },
    { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 },
    { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 }
  ];

  ngOnInit(): void {
    console.log('Dashboard component initialized');
    
    // Get username from localStorage directly as a quick fix
    const storedUsername = localStorage.getItem('username');
    console.log('Username from localStorage:', storedUsername);
    
    if (storedUsername) {
      this.username = storedUsername;
    } else {
      // Fallback to AuthService if localStorage doesn't have it
      const currentUser = this.authService.getCurrentUser();
      if (currentUser && currentUser.username) {
        this.username = currentUser.username;
      }
    }
    
    console.log('Final username set to:', this.username);
    
    // Get tenant domain and name from the auth service
    this.tenantDomain = this.authService.getTenantDomain() || '';
    this.tenantName = this.authService.getTenantName() || '';
    console.log('Tenant domain and name in dashboard:', this.tenantDomain, this.tenantName);
    
    // --- ADD DUMMY DATA ---
    this.backups = [
      { id: 'bkp-a1b2c3d4', name: 'Web Server Backup', status: 'Completed', created: '2025-05-01', type: 'Restic', size: '15.2 GB', lifecycle: 'Standard', encryption: 'AES-256', icon: 'pi pi-server' },
      
    ];
    
    this.recentActions = [
        { description: 'Backup "Web Server Backup" completed', date: '15 minutes ago', icon: 'pi pi-check-circle', color: '#689F38', by: 'System' },
        { description: 'User "admin" logged in', date: '1 hour ago', icon: 'pi pi-sign-in', color: '#0288D1', by: 'admin' },
        { description: 'Backup "Database Backup" started', date: '2 hours ago', icon: 'pi pi-spin pi-spinner', color: '#0288D1', by: 'Scheduler' },
    ];

    this.initChart();
    this.loadRecentActivity();
    this.startActivityPolling();
    this.checkBackrestStatus(); // Check Backrest status on init
    // Add this to load available repositories
    this.loadRepositories();
    // Load plans on init
    this.loadPlans();
  }
  
  // Clear and explicit logout function
  logout(): void {
    console.log('Dashboard: logout method called');
    
    this.authService.logout().subscribe({
      next: () => {
        console.log('Dashboard: logout successful, showing toast');
        
        // Add toast message
        this.messageService.add({
          severity: 'success',
          summary: 'Logged Out',
          detail: 'You have been successfully logged out'
        });
        
        console.log('Dashboard: navigating to login page');
        setTimeout(() => {
          // Use timeout to ensure toast is shown before navigation
          this.router.navigate(['/login']).then(
            success => console.log('Navigation result:', success),
            error => console.error('Navigation error:', error)
          );
        }, 500);
      },
      error: (err) => {
        console.error('Dashboard: error during logout:', err);
        
        // Still try to navigate to login
        this.router.navigate(['/login']).then(
          success => console.log('Navigation after error result:', success),
          error => console.error('Navigation after error:', error)
        );
      }
    });
  }
  
  ngOnDestroy(): void {
    // Unsubscribe from polling when component is destroyed
    if (this.activitySubscription) {
        this.activitySubscription.unsubscribe();
    }
  }

  initChart(): void {
    if (isPlatformBrowser(this.platformId)) {
      const documentStyle = getComputedStyle(document.documentElement);
      const textColor = documentStyle.getPropertyValue('--text-color');
      const textColorSecondary = documentStyle.getPropertyValue('--text-color-secondary');
      const surfaceBorder = documentStyle.getPropertyValue('--surface-border');

      this.chartData = {
          labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
          datasets: [
              {
                  label: 'Successful Backups',
                  data: [65, 59, 80, 81, 56, 55, 40],
                  fill: false,
                  borderColor: documentStyle.getPropertyValue('--primary-500'),
                  tension: .4
              },
              {
                  label: 'Failed Backups',
                  data: [2, 1, 3, 0, 4, 1, 2],
                  fill: false,
                  borderColor: documentStyle.getPropertyValue('--red-500'),
                  tension: .4
              }
          ]
      };

      this.chartOptions = {
          maintainAspectRatio: false,
          aspectRatio: 0.9,
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
    } else {
      this.chartData = {};
      this.chartOptions = {};
    }
  }

  loadRecentActivity(): void {
    this.isLoadingActivity = true;
    this.jobService.getRecentActivity().subscribe({
      next: (logs: ActivityLogEntry[]) => {
        this.recentActions = this.mapLogsToTimeline(logs);
        this.isLoadingActivity = false;
        console.log('Recent activity loaded:', this.recentActions);
      },
      error: (err) => {
        this.isLoadingActivity = false;
        console.error('Failed to load recent activity:', err);
        this.messageService.add({ severity: 'error', summary: 'Activity Error', detail: 'Could not load recent activity.', life: 3000 });
      }
    });
  }

  startActivityPolling(): void {
      // Poll every 30 seconds
      const pollInterval = 30000;
      this.activitySubscription = interval(pollInterval)
          .pipe(
              startWith(0),
              switchMap(() => {
                  this.isLoadingActivity = true;
                  return this.jobService.getRecentActivity();
              })
          )
          .subscribe({
              next: (logs: ActivityLogEntry[]) => {
                  this.recentActions = this.mapLogsToTimeline(logs);
                  this.isLoadingActivity = false;
              },
              error: (err) => {
                  this.isLoadingActivity = false;
                  console.error('Polling failed to load recent activity:', err);
              }
          });
  }

  mapLogsToTimeline(logs: ActivityLogEntry[]): any[] {
      return logs.map(log => {
          let icon = 'pi pi-info-circle';
          let color = '#0288D1';

          switch (log.level) {
              case 'info':
                  if (log.message.includes('completed successfully')) {
                      icon = 'pi pi-check-circle';
                      color = '#689F38';
                  } else if (log.message.includes('started')) {
                      icon = 'pi pi-spin pi-spinner';
                      color = '#0288D1';
                  }
                  break;
              case 'warning':
                  icon = 'pi pi-exclamation-triangle';
                  color = '#FBC02D';
                  break;
              case 'error':
                  icon = 'pi pi-times-circle';
                  color = '#D32F2F';
                  break;
              case 'debug':
                  icon = 'pi pi-cog';
                  color = '#757575';
                  break;
          }

          return {
              status: log.message,
              date: log.timestamp_iso,
              icon: icon,
              color: color,
          };
      });
  }

  // --- Backup Dialog Methods ---
  showBackupDialog() {
    this.backupDialogVisible = true;
    this.backupName = '';
    this.targetHosts = '';
    this.playbookPath = 'mysqldump_playbook.yml';
    this.extraVars = '';
    this.publickey = '';
    this.selectedBackupType = 'restic';
  }

  hideBackupDialog() {
    this.backupDialogVisible = false;
  }

  runBackupPlaybook() {
    this.isLoading = true;

    const jobData: CreateBackupJobData = {
      name: this.backupName,
      target_hosts: this.targetHosts,
      playbook_path: this.playbookPath,
      backup_type: this.selectedBackupType,
      extra_vars: this.parseExtraVars(this.extraVars),
      publickey: this.publickey
    };

    console.log('Sending job request to backend:', jobData);

    this.jobService.createBackupJob(jobData).subscribe({
      next: (response: { job_id: string }) => {
        this.isLoading = false;
        console.log('Backup job created successfully:', response);
        this.messageService.add({
            severity: 'success',
            summary: 'Job Submitted',
            detail: `Backup job '${jobData.name}' (ID: ${response.job_id}) has been submitted.`
        });
        this.hideBackupDialog();
        setTimeout(() => this.loadRecentActivity(), 1000);
      },
      error: (err) => {
        this.isLoading = false;
        console.error('Failed to create backup job:', err);
        const detail = err?.error?.detail || err?.message || 'Could not submit backup job.';
        this.messageService.add({
            severity: 'error',
            summary: 'Job Submission Failed',
            detail: detail,
            sticky: true
        });
      }
    });
  }

  parseExtraVars(varsString: string): { [key: string]: string } {
      const vars: { [key: string]: string } = {};
      if (varsString) {
          const pairs = varsString.split(',');
          for (const pair of pairs) {
              const parts = pair.split('=');
              if (parts.length === 2) {
                  vars[parts[0].trim()] = parts[1].trim();
              }
          }
      }
      return vars;
  }

  // --- User Dialog Methods ---
  showAddUserDialog() {
    this.addUserDialogVisible = true;
    // Reset form fields
    this.newUser = {
      accountName: '',
      username: '',
      password: '',
      confirmPassword: '',
      email: '',
      selectedPolicy: null,
      selectedProvisioningMode: 'auto',
      selectedTemplate: null,
      allowAdminReset: true,
      requireChangeOnLogin: false
    };
  }

  hideAddUserDialog() {
    this.addUserDialogVisible = false;
  }

  addUser() {
    if (this.newUser.password !== this.newUser.confirmPassword) {
        this.messageService.add({ severity: 'error', summary: 'Validation Error', detail: 'Passwords do not match.' });
        return;
    }

    console.log('Adding new user:', this.newUser);
    // TODO: Add actual API call for user creation
    this.hideAddUserDialog();
    this.messageService.add({ 
      severity: 'success', 
      summary: 'User Added', 
      detail: `User ${this.newUser.username} added successfully.` 
    });
  }

  // --- Repository Methods ---
  loadRepositories() {
    this.apiService.get('backrest/repositories/').subscribe({
      next: (response: any) => {
        this.repositories = response;
        console.log('Loaded repositories:', this.repositories);
      },
      error: (err) => {
        console.error('Failed to load repositories:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load repositories'
        });
      }
    });
  }
  
  // Add this method to load servers
  loadServers() {
    this.serverService.getActiveServers().subscribe({
      next: (data) => {
        this.servers = data;
        // If there's only one server, select it by default
        if (this.servers.length === 1) {
          this.selectedServerId = this.servers[0].id;
        }
        console.log('Loaded servers:', this.servers);
      },
      error: (err) => {
        console.error('Failed to load servers', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load servers. Please try again.'
        });
      }
    });
  }
  
  showCreateRepoDialog() {
    // Load servers FIRST
    this.loadServers();
    
    // Then reset dialog fields
    this.newRepo = {
      name: '',
      type: 'local',
      localPath: '',
      cloudProvider: 'preset',
      cloudType: null,
      cloudURI: '',
      accessKey: '',
      secretKey: '',
      password: '',
      uri: 'local:/opt/backrest/repos/'
    };
    
    // Don't set server ID here - wait for loadServers to complete
    this.createRepoDialogVisible = true;
  }
  
  hideCreateRepoDialog() {
    this.createRepoDialogVisible = false;
  }
  
  // Auto-generate URI when name changes
  onRepoNameChange() {
    // If local path is empty, auto-populate it with the repo name
    if (this.newRepo.type === 'local' && !this.newRepo.localPath && this.newRepo.name) {
      this.newRepo.localPath = this.newRepo.name.toLowerCase().replace(/\s+/g, '_');
      this.updateLocalUri();
    } else if (this.newRepo.type === 'cloud') {
      this.updateCloudUri();
    }
  }

  // Update URI for local storage
  updateLocalUri() {
    // Get the custom path from user input or fallback to repository name
    const customPath = this.newRepo.localPath || 
      (this.newRepo.name ? this.newRepo.name.toLowerCase().replace(/\s+/g, '_') : '');
    
    // Only append the path if there's one specified
    if (customPath) {
      this.newRepo.uri = `local:/opt/backrest/repos/${customPath}`;
    } else {
      this.newRepo.uri = 'local:/opt/backrest/repos/';
    }
  }

  // Update URI for cloud storage
  updateCloudUri() {
    if (this.newRepo.cloudProvider === 'preset') {
      // Use predefined Azure storage
      const formattedName = this.newRepo.name ? this.newRepo.name.toLowerCase().replace(/\s+/g, '_') : '';
      this.newRepo.uri = `azure:whitecape-backups:${formattedName}`;
    } else {
      // Use custom cloud URI
      this.newRepo.uri = this.newRepo.cloudURI;
    }
  }
  
  createRepository() {
    if (!this.newRepo.name || !this.newRepo.password || !this.selectedServerId) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Please fill in all required fields'
      });
      return;
    }
    
    this.isCreatingRepo = true;
    
    // Build payload based on repository type
    const payload: any = {
      name: this.newRepo.name,
      password: this.newRepo.password,
      server: this.selectedServerId,
      uri: this.newRepo.uri
    };
    
    // Add cloud credentials if needed
    if (this.newRepo.type === 'cloud' && this.newRepo.cloudProvider === 'custom') {
      payload['access_key'] = this.newRepo.accessKey;
      payload['secret_key'] = this.newRepo.secretKey;
    }
    
    console.log('Creating repository with payload:', payload);
    
    this.apiService.post('backrest/repositories/', payload).subscribe({
      next: (response) => {
        console.log('Repository created successfully:', response);
        this.messageService.add({
          severity: 'success', 
          summary: 'Success', 
          detail: 'Repository created successfully!'
        });
        this.isCreatingRepo = false;
        this.createRepoDialogVisible = false;
        this.loadRepositories(); // Reload the list of repositories
      },
      error: (err) => {
        console.error('Failed to create repository:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to create repository: ' + 
                  (err.error?.detail || err.message || 'Unknown error')
        });
        this.isCreatingRepo = false;
      }
    });
  }
  
  // --- Backup Plan Methods ---
  showCreatePlanDialog() {
    // Reload repositories to ensure list is current
    this.loadRepositories();
    // Reset form to defaults
    this.newPlan = this.getDefaultPlanConfig();
    
    // Set default cron builder values
    this.cronFrequency = 'daily';
    this.cronHour = 1;  // 1 AM
    this.cronMinute = 0;
    this.cronDayOfWeek = 1; // Monday
    this.cronDayOfMonth = 1; // 1st day
    
    // Generate the initial cron expression
    this.updateCronExpression();
    
    this.createPlanDialogVisible = true;
  }
  
  hideCreatePlanDialog() {
    this.createPlanDialogVisible = false;
  }
  
  getDefaultPlanConfig() {
    return {
      planType: 'cycle',
      name: '',
      repository: null,
      paths: ['/etc', '/home'],
      excludes: ['*.tmp', '*.log'],
      scheduleType: 'cron',
      cronExpression: '0 1 * * 1', // Every Monday at 1 AM
      intervalValue: 24,
      intervalUnit: 'hours',
      retentionType: 'time-period', // 'count', 'time-period', or 'none'
      retention: {
        keepLastN: 5,
        hourly: 0,
        daily: 7,
        weekly: 4,
        monthly: 1,
        yearly: 0
      }
    };
  }
  
  addPath() {
    this.newPlan.paths.push('');
  }
  
  removePath(index: number) {
    this.newPlan.paths.splice(index, 1);
  }
  
  addExclude() {
    this.newPlan.excludes.push('');
  }
  
  removeExclude(index: number) {
    this.newPlan.excludes.splice(index, 1);
  }
  
  canCreatePlan(): boolean {
    // Basic validation
    if (!this.newPlan.name || !this.newPlan.repository) {
      return false;
    }
    
    if (this.newPlan.planType === 'custom') {
      // Check if we have at least one path
      if (this.newPlan.paths.length === 0 || !this.newPlan.paths.some(path => path.trim() !== '')) {
        return false;
      }
      
      // For cron schedule, ensure we have a cron expression
      if (this.newPlan.scheduleType === 'cron' && !this.newPlan.cronExpression) {
        return false;
      }
    }
    
    return true;
  }
  
  createPlan() {
    if (!this.canCreatePlan()) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Please fill in all required fields'
      });
      return;
    }
    
    this.isCreatingPlan = true;
    
    if (this.newPlan.planType === 'cycle') {
      // Create two plans: full and incremental
      this.createCyclePlans();
    } else {
      // Create custom plan
      this.createCustomPlan();
    }
  }
  
  createCyclePlans() {
    // Extract the correct numeric ID from the repository object
    let repositoryId;
    
    if (typeof this.newPlan.repository === 'object' && this.newPlan.repository !== null) {
      // Extract the numeric ID, not the string repository_id
      repositoryId = this.newPlan.repository['id'];
      console.log('Using repository ID:', repositoryId);
    } else if (typeof this.newPlan.repository === 'number') {
      repositoryId = this.newPlan.repository;
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Invalid Repository',
        detail: 'Please select a valid repository'
      });
      this.isCreatingPlan = false;
      return;
    }
    
    // Use user-defined paths or default paths if empty
    const pathsToBackup = this.newPlan.paths.length > 0 && this.newPlan.paths[0].trim() !== '' 
      ? this.newPlan.paths.filter(path => path.trim() !== '') 
      : ['/etc', '/home', '/var/www'];
      
    // Use user-defined excludes or default excludes if empty
    const patternsToExclude = this.newPlan.excludes.length > 0 && this.newPlan.excludes[0].trim() !== ''
      ? this.newPlan.excludes.filter(exclude => exclude.trim() !== '')
      : ['*.tmp', '*.log'];

    // Create the full backup plan (every Monday)
    const fullPlanPayload = {
      name: `${this.newPlan.name}_full`,
      repository: repositoryId,
      paths: pathsToBackup,  // Use the paths from above
      excludes: patternsToExclude, // Use the excludes from above
      schedule: {
        clock: 'CLOCK_LOCAL',
        cron: '0 1 * * 1'  // Every Monday at 1 AM             
      },
      retention_policy: {
        // Keep most recent 5 full backups for operational safety
        keep_last: 5,
        keep_hourly: 0,
        keep_daily: 0,
        keep_weekly: 0,
        // Keep exactly ONE full backup per month (monthly rotation)
        keep_monthly: 1,                     
        keep_yearly: 0
      }
    };
    
    console.log('Creating full backup plan with payload:', fullPlanPayload);
    
    // First create the full backup plan
    this.apiService.post('backrest/plans/', fullPlanPayload).subscribe({
      next: (fullResponse: any) => {
        console.log('Full backup plan created:', fullResponse);
        
        // Now create the incremental backup plan (every day except Monday)
        const incrementalPlanPayload = {
          name: `${this.newPlan.name}_incremental`,
          repository: repositoryId,
          paths: pathsToBackup,  // Use the same paths
          excludes: patternsToExclude, // Use the same excludes
          schedule: {
            clock: 'CLOCK_LOCAL',
            cron: '0 1 * * 0,2,3,4,5,6'  // Sunday (0) and Tuesday-Saturday (2-6) at 1 AM
          },
          retention_policy: {
            // Keep last 31 incrementals (enough for a full month)
            keep_last: 31,
            keep_hourly: 0,
            // No daily limit, letting keep_last handle retention
            keep_daily: 0,
            keep_weekly: 0,
            keep_monthly: 0,
            keep_yearly: 0
          }
        };
        
        this.apiService.post('backrest/plans/', incrementalPlanPayload).subscribe({
          next: (incResponse: any) => {
            this.isCreatingPlan = false;
            console.log('Incremental backup plan created:', incResponse);
            
            this.messageService.add({
              severity: 'success',
              summary: 'Backup Cycle Created',
              detail: 'Weekly full / daily incremental backup cycle created successfully'
            });
            
            this.hideCreatePlanDialog();
            this.loadPlans(); // Refresh the plans list
          },
          error: (err) => this.handlePlanError(err)
        });
      },
      error: (err) => this.handlePlanError(err)
    });
  }
  
  createCustomPlan() {
    // For debugging
    console.log('Repository from form:', this.newPlan.repository);
    
    // Get repository ID properly - KEEPING EXISTING LOGIC
    let repositoryId;
    
    if (typeof this.newPlan.repository === 'object' && this.newPlan.repository !== null) {
      // If it's an object, extract the ID using bracket notation
      repositoryId = this.newPlan.repository['id'] || this.newPlan.repository['repository_id'];
    } else if (typeof this.newPlan.repository === 'number') {
      // If it's already a number
      repositoryId = this.newPlan.repository;
    } else if (typeof this.newPlan.repository === 'string') {
      // If it's a string (potentially already the ID)
      repositoryId = this.newPlan.repository;
    }
    
    console.log('Repository ID extracted:', repositoryId);

    // Build schedule based on user selection
    let schedule: any = {
      clock: 'CLOCK_LOCAL'
    };
    
    if (this.newPlan.scheduleType === 'disabled') {
      schedule = { disabled: true };
    } else if (this.newPlan.scheduleType === 'cron') {
      schedule.cron = this.newPlan.cronExpression;
    } else if (this.newPlan.scheduleType === 'interval') {
      // Determine if it's hours or days
      if (this.newPlan.intervalUnit === 'hours') {
        schedule.maxFrequencyHours = this.newPlan.intervalValue;
      } else if (this.newPlan.intervalUnit === 'days') {
        schedule.maxFrequencyDays = this.newPlan.intervalValue;
      }
    }
    
    // Build retention policy based on user selection
    let retention: any = {};

    if (this.newPlan.retentionType === 'count') {
      // Use policyKeepLastN
      retention = {
        policyKeepLastN: this.newPlan.retention.keepLastN || 30
      };
    } else if (this.newPlan.retentionType === 'time-period') {
      // Use policyTimeBucketed
      retention = {
        policyTimeBucketed: {
          yearly: this.newPlan.retention.yearly || 0,
          monthly: this.newPlan.retention.monthly || 0,
          weekly: this.newPlan.retention.weekly || 0,
          daily: this.newPlan.retention.daily || 0,
          hourly: this.newPlan.retention.hourly || 0,
          keepLastN: this.newPlan.retention.keepLastN || 0
        }
      };
    } else if (this.newPlan.retentionType === 'none') {
      // Use policyKeepAll
      retention = {
        policyKeepAll: true
      };
    }
    
    // Create the payload with the correct structure
    const payload = {
      name: this.newPlan.name,
      repository: repositoryId.toString(), // Ensure it's a string
      paths: this.newPlan.paths.filter(path => path.trim() !== ''),
      excludes: this.newPlan.excludes.filter(exc => exc.trim() !== ''),
      iexcludes: [],
      schedule: schedule,
      backup_flags: [],
      retention_policy: retention,
      hooks: []
    };
    
    console.log('Sending plan payload:', JSON.stringify(payload, null, 2));
    
    // Show loading state
    this.isCreatingPlan = true;
    
    this.apiService.post('backrest/plans/', payload).subscribe({
      next: (response: any) => {
        this.isCreatingPlan = false;
        console.log('Backup plan created:', response);
        this.messageService.add({
          severity: 'success',
          summary: 'Plan Created',
          detail: `Backup plan "${this.newPlan.name}" was created successfully`
        });
        this.hideCreatePlanDialog();
        // Refresh plans list if needed
        this.loadPlans();
      },
      error: (err) => {
        this.isCreatingPlan = false;
        console.error('Failed to create backup plan:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Creation Failed',
          detail: err.error?.detail || err.message || 'Failed to create backup plan'
        });
      }
    });
  }
  
  handlePlanError(err: any) {
    this.isCreatingPlan = false;
    console.error('Failed to create backup plan:', err);
    this.messageService.add({
      severity: 'error',
      summary: 'Creation Failed',
      detail: err.error?.detail || 'Failed to create backup plan'
    });
  }
  
  // --- Backrest Status Methods ---
  checkBackrestStatus() {
    // Call your backend API to check if Backrest is running
    this.apiService.get(`backrest/servers/${this.serverId}/status/`).subscribe({
      next: (response) => {
        const res = response as { status: string };
        this.backrestStatus = res.status;
        this.isBackrestRunning = res.status === 'running';
      },
      error: (error) => {
        console.error('Error checking Backrest status:', error);
        this.backrestStatus = 'unknown';
        this.isBackrestRunning = false;
      }
    });
  }

  // In your component class
  generateLocalUri(name: string): string {
    // Don't append the name to the URI
    return 'local:/opt/backrest/repos/';
  }

  // Add this method to your component class
  loadPlans() {
    this.isLoading = true;
    this.apiService.get('backrest/plans/').subscribe({
      next: (response: any) => {
        this.plans = response;
        console.log('Loaded plans:', this.plans);
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        console.error('Failed to load backup plans:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load backup plans'
        });
      }
    });
  }

  // Methods for generating the cron expression
  updateCronExpression(): void {
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
