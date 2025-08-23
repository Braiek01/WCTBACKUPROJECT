import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { AuthService } from '../../core/services/auth.service';
import { JobService, CreateBackupJobData, ActivityLogEntry } from '../../core/services/job.service';
import { ApiService } from '../../core/services/api.service';
import { ServerService, Server } from '../../core/services/server.service';
import { Subscription, interval, timer } from 'rxjs';
import { startWith, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

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
    
    // Get user info
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      this.username = storedUsername;
    }
    
    this.tenantDomain = this.authService.getTenantDomain() || '';
    this.tenantName = this.authService.getTenantName() || '';
    
    // Initialize chart
    this.initChart();
    
    // START REAL-TIME DATA LOADING (remove dummy data)
    this.startRealTimeUpdates();
    
    // Load initial real data
    this.loadDashboardData();
    this.loadRepositories();
    this.loadPlans();
    this.checkBackrestStatus();
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
    
    // Stop real-time updates
    this.stopRealTimeUpdates();
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
    // Get repository ID properly
    let repositoryId;
    
    if (typeof this.newPlan.repository === 'object' && this.newPlan.repository !== null) {
      repositoryId = this.newPlan.repository['id'] || this.newPlan.repository['repository_id'];
    } else if (typeof this.newPlan.repository === 'number') {
      repositoryId = this.newPlan.repository;
    } else if (typeof this.newPlan.repository === 'string') {
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
      if (this.newPlan.intervalUnit === 'hours') {
        schedule.maxFrequencyHours = this.newPlan.intervalValue;
      } else if (this.newPlan.intervalUnit === 'days') {
        schedule.maxFrequencyDays = this.newPlan.intervalValue;
      }
    }
    
    // Build retention policy based on user selection
    let retention_policy: any = {};

    // Add debug logging
    console.log('Retention type selected:', this.newPlan.retentionType);

    if (this.newPlan.retentionType === 'none') {
      // "Keep all backups" - use policyKeepAll directly without nesting
      retention_policy = {
        policyKeepAll: true
      };
      console.log('Setting "keep all backups" policy:', retention_policy);
    } else if (this.newPlan.retentionType === 'count') {
      // Keep last N backups
      retention_policy = {
        policyKeepLastN: this.newPlan.retention.keepLastN || 30
      };
    } else if (this.newPlan.retentionType === 'time-period') {
      // Time-bucketed policy
      retention_policy = {
        policyTimeBucketed: {
          yearly: this.newPlan.retention.yearly || 0,
          monthly: this.newPlan.retention.monthly || 0,
          weekly: this.newPlan.retention.weekly || 0,
          daily: this.newPlan.retention.daily || 0,
          hourly: this.newPlan.retention.hourly || 0,
          keepLastN: this.newPlan.retention.keepLastN || 0
        }
      };
    }
    
    // Create the payload with the correct structure
    const payload = {
      name: this.newPlan.name,
      repository: repositoryId.toString(),
      paths: this.newPlan.paths.filter(path => path.trim() !== ''),
      excludes: this.newPlan.excludes.filter(exc => exc.trim() !== ''),
      schedule: schedule,
      retention_policy: retention_policy
    };
    
    // Log the exact payload being sent
    console.log('Sending plan payload:', JSON.stringify(payload, null, 2));
    
    this.isCreatingPlan = true;
    
    this.apiService.post('backrest/plans/', payload).subscribe({
      next: (response: any) => {
        this.isCreatingPlan = false;
        console.log('Plan creation response:', response);
        this.messageService.add({
          severity: 'success',
          summary: 'Plan Created',
          detail: `Backup plan "${this.newPlan.name}" was created successfully`
        });
        this.hideCreatePlanDialog();
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
    // Use selectedServerId for status check
    if (this.selectedServerId === null || this.selectedServerId === undefined) {
      console.warn('No selectedServerId set, skipping Backrest status check.');
      this.backrestStatus = 'unknown';
      this.isBackrestRunning = false;
      return;
    }
    // Call your backend API to check if Backrest is running
    this.apiService.get(`backrest/servers/${this.selectedServerId}/status/`).subscribe({
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

  // Add this property to your component class
  loadingBackupStats: boolean = false;

  // Add to analytics.component.ts
  syncBackrestData(): void {
    this.loadingBackupStats = true;
    this.messageService.add({
      severity: 'info',
      summary: 'Starting Sync',
      detail: 'Synchronizing Backrest data...'
    });
    
    // Trigger server-side sync of all Backrest data
    this.apiService.post('backrest/sync-data/', {}).subscribe({
      next: (response) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Sync Completed',
          detail: 'Backrest data synchronized successfully'
        });
        
        // Reload analytics data
        this.loadAnalyticsData();
      },
      error: (err) => {
        console.error('Failed to sync Backrest data:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Sync Failed',
          detail: 'Could not synchronize Backrest data'
        });
        this.loadingBackupStats = false;
      }
    });
  }

  // Dummy implementation for analytics data loading to fix the error
  loadAnalyticsData(): void {
    // You can implement actual analytics data loading here if needed
    this.loadingBackupStats = false;
    // Optionally, refresh chart or stats here
  }

  // ADD THESE NEW PROPERTIES FOR REAL-TIME DATA
  private backupsSubscription: Subscription | null = null;
  private operationsSubscription: Subscription | null = null;
  private dashboardSubscription: Subscription | null = null;
  
  // Real backup data properties
  realBackups: any[] = [];
  backupStats = {
    total: 0,
    completed: 0,
    running: 0,
    failed: 0,
    totalSize: '0 GB'
  };
  
  // Real-time activity properties
  liveActivity: any[] = [];
  activityLoading = false;
  
  // Dashboard data refresh properties
  lastRefresh: Date = new Date();
  autoRefreshEnabled = true;
  refreshInterval = 30; // seconds

  // === REAL-TIME DATA METHODS ===

  startRealTimeUpdates(): void {
    console.log('🔄 Starting real-time dashboard updates');
    
    // Keep your existing activity polling
    this.startActivityPolling();
    
    // ADD new real-time data (every 15 seconds for dashboard stats)
    this.dashboardSubscription = interval(15000)
      .pipe(
        startWith(0),
        switchMap(() => this.loadDashboardStatsReal()),
        catchError(err => {
          console.error('Error loading dashboard stats:', err);
          return of([]);
        })
      )
      .subscribe();

    // ADD live activity updates (every 10 seconds)
    this.operationsSubscription = interval(10000)
      .pipe(
        startWith(0),
        switchMap(() => this.loadLiveActivityFeed()),
        catchError(err => {
          console.error('Error loading live activity:', err);
          return of([]);
        })
      )
      .subscribe();
  }

  stopRealTimeUpdates(): void {
    console.log('⏹️ Stopping real-time updates');
    
    if (this.backupsSubscription) {
      this.backupsSubscription.unsubscribe();
      this.backupsSubscription = null;
    }
    
    if (this.operationsSubscription) {
      this.operationsSubscription.unsubscribe();
      this.operationsSubscription = null;
    }
    
    if (this.dashboardSubscription) {
      this.dashboardSubscription.unsubscribe();
      this.dashboardSubscription = null;
    }
    
    if (this.activitySubscription) {
      this.activitySubscription.unsubscribe();
      this.activitySubscription = null;
    }
  }

  loadRealBackups() {
    return this.apiService.get('backrest/operations/?limit=20').pipe(
      switchMap((operations: any) => {
        // Process operations into backup cards
        this.processOperationsIntoBackups(operations.results || operations);
        return of(this.realBackups);
      })
    );
  }

  loadLiveActivity() {
    this.activityLoading = true;
    return this.apiService.get('backrest/operations/structured/?days=1&limit=10').pipe(
      switchMap((response: any) => {
        this.processLiveActivity(response.results || []);
        this.activityLoading = false;
        return of(this.liveActivity);
      })
    );
  }

  loadDashboardStats() {
    return this.apiService.get('backrest/operations/dashboard/?days=30').pipe(
      switchMap((response: any) => {
        this.processDashboardStats(response);
        this.lastRefresh = new Date();
        return of(response);
      })
    );
  }

  // NEW METHOD - Add this to load real dashboard stats
  loadDashboardStatsReal() {
    return this.apiService.get('backrest/dashboard-stats/').pipe(
      switchMap((stats: any) => {
        // Update backup stats with real data
        this.backupStats = {
          total: stats.by_type?.backup || 0,
          completed: stats.by_status?.completed || 0,
          running: stats.by_status?.running || 0,
          failed: stats.by_status?.failed || 0,
          totalSize: this.calculateTotalSize(stats)
        };
        
        // Process recent backups into backup cards (supplement existing backups)
        const realBackupCards = (stats.recent_backups || []).map((backup: any) => ({
          id: backup.id,
          name: `${backup.repository} - ${backup.plan}`,
          status: this.getBackupStatus(backup.status),
          created: this.formatDate(backup.started_at),
          type: 'Restic',
          size: this.formatBackupSize({ total_bytes_processed: backup.size }),
          lifecycle: 'Standard',
          encryption: 'AES-256',
          icon: this.getBackupIcon(backup.status),
          repository: backup.repository,
          plan: backup.plan
        }));
        
        // Merge with existing backups instead of replacing
        this.backups = [...this.backups, ...realBackupCards];
        
        return of(this.backups);
      })
    );
  }

  // NEW METHOD - Add this to load live activity feed
  loadLiveActivityFeed() {
    this.activityLoading = true;
    return this.apiService.get('backrest/live-activity/?limit=10').pipe(
      switchMap((response: any) => {
        const liveActivities = (response.results || []).map((activity: any) => ({
          description: activity.description,
          date: this.getRelativeTime(activity.timestamp),
          icon: this.getActivityIconFromType(activity.type, activity.status),
          color: this.getActivityColorFromStatus(activity.status),
          by: activity.user || 'System',
          timestamp: activity.timestamp,
          type: activity.type,
          status: activity.status
        }));
        
        // ADD to existing recentActions instead of replacing
        this.recentActions = [...liveActivities, ...this.recentActions].slice(0, 10);
        
        this.activityLoading = false;
        return of(this.recentActions);
      })
    );
  }

  // Add this helper method to fix the missing method error
  getActivityIconFromType(type: string, status: string): string {
    switch (type?.toLowerCase()) {
      case 'backup':
        return status === 'completed' ? 'pi pi-check-circle' :
               status === 'running' ? 'pi pi-spin pi-spinner' :
               status === 'failed' ? 'pi pi-times-circle' :
               'pi pi-server';
      case 'restore':
        return 'pi pi-replay';
      case 'index':
        return 'pi pi-list';
      case 'maintenance':
        return 'pi pi-cog';
      default:
        return 'pi pi-info-circle';
    }
  }

  // Add this missing method to fix the compile error
  getActivityColorFromStatus(status: string): string {
    switch (status?.toLowerCase()) {
      case 'completed': return '#689F38';
      case 'running': return '#0288D1';
      case 'failed': return '#D32F2F';
      default: return '#757575';
    }
  }

  processOperationsIntoBackups(operations: any[]): void {
    const groupedBackups = new Map();
    
    operations.forEach(op => {
      if (op.operation_type === 'backup') {
        const key = `${op.repository?.name || 'Unknown'}_${op.plan?.name || 'manual'}`;
        
        if (!groupedBackups.has(key)) {
          groupedBackups.set(key, {
            id: `bkp-${op.repository?.id || Math.random()}`,
            name: `${op.repository?.name || 'Unknown Repository'} - ${op.plan?.name || 'Manual Backup'}`,
            status: this.getBackupStatus(op.status),
            created: this.formatDate(op.started_at),
            type: 'Restic',
            size: this.formatBackupSize(op.stats),
            lifecycle: 'Standard',
            encryption: 'AES-256',
            icon: this.getBackupIcon(op.status),
            lastOperation: op,
            repository: op.repository?.name || 'Unknown',
            plan: op.plan?.name || 'Manual'
          });
        } else {
          // Update with more recent operation
          const existing = groupedBackups.get(key);
          if (new Date(op.started_at) > new Date(existing.lastOperation.started_at)) {
            existing.status = this.getBackupStatus(op.status);
            existing.created = this.formatDate(op.started_at);
            existing.size = this.formatBackupSize(op.stats);
            existing.icon = this.getBackupIcon(op.status);
            existing.lastOperation = op;
          }
        }
      }
    });

    this.realBackups = Array.from(groupedBackups.values());
    this.backups = this.realBackups; // Update the main backups array
    
    // Update backup stats
    this.updateBackupStats();
  }

  processLiveActivity(operations: any[]): void {
    this.liveActivity = operations.slice(0, 10).map(op => ({
      description: this.getActivityDescription(op),
      date: this.getRelativeTime(op.started_at),
      icon: this.getActivityIcon(op),
      color: this.getActivityColor(op),
      by: this.getActivityUser(op),
      timestamp: op.started_at,
      type: op.type,
      status: op.status
    }));

    // Update the main recentActions array for the template
    this.recentActions = this.liveActivity;
  }

  processDashboardStats(data: any): void {
    if (data) {
      this.backupStats = {
        total: data.total_operations || 0,
        completed: data.by_status?.completed || 0,
        running: data.by_status?.running || 0,
        failed: data.by_status?.failed || 0,
        totalSize: this.calculateTotalSize(data)
      };

      // Update chart with real data
      this.updateChartWithRealData(data);
    }
  }

  // === HELPER METHODS ===

  getBackupStatus(status: string): string {
    switch (status?.toLowerCase()) {
      case 'completed': return 'Completed';
      case 'running': return 'Running';
      case 'failed': return 'Failed';
      case 'pending': return 'Pending';
      default: return 'Unknown';
    }
  }

  getBackupIcon(status: string): string {
    switch (status?.toLowerCase()) {
      case 'completed': return 'pi pi-check-circle';
      case 'running': return 'pi pi-spin pi-spinner';
      case 'failed': return 'pi pi-times-circle';
      default: return 'pi pi-server';
    }
  }

  formatBackupSize(stats: any): string {
    if (!stats) return '0 MB';
    
    const bytes = stats.total_bytes_processed || stats.data_added || 0;
    if (bytes === 0) return '0 MB';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }

  getActivityDescription(op: any): string {
    const repo = op.repository || 'Unknown Repository';
    const plan = op.plan !== 'N/A' ? ` (${op.plan})` : '';
    
    switch (op.type?.toLowerCase()) {
      case 'backup':
        return `Backup ${op.status} for ${repo}${plan}`;
      case 'restore':
        return `Restore ${op.status} for ${repo}`;
      case 'index':
        return `Index operation ${op.status} for ${repo}`;
      case 'maintenance':
        return `Maintenance ${op.status} for ${repo}`;
      default:
        return `${op.type || 'Operation'} ${op.status} for ${repo}`;
    }
  }

  getRelativeTime(dateString: string): string {
    if (!dateString) return 'Unknown time';
    
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    return this.formatDate(dateString);
  }

  getActivityIcon(op: any): string {
    switch (op.type?.toLowerCase()) {
      case 'backup':
        return op.status === 'completed' ? 'pi pi-check-circle' : 
               op.status === 'running' ? 'pi pi-spin pi-spinner' : 'pi pi-times-circle';
      case 'restore':
        return 'pi pi-replay';
      case 'index':
        return 'pi pi-list';
      case 'maintenance':
        return 'pi pi-cog';
      default:
        return 'pi pi-info-circle';
    }
  }

  getActivityColor(op: any): string {
    if (op.status === 'completed') return '#689F38';
    if (op.status === 'running') return '#0288D1';
    if (op.status === 'failed') return '#D32F2F';
    return '#757575';
  }

  getActivityUser(op: any): string {
    return op.user || 'System';
  }

  updateBackupStats(): void {
    this.backupStats = {
      total: this.realBackups.length,
      completed: this.realBackups.filter(b => b.status === 'Completed').length,
      running: this.realBackups.filter(b => b.status === 'Running').length,
      failed: this.realBackups.filter(b => b.status === 'Failed').length,
      totalSize: this.calculateBackupsSize()
    };
  }

  calculateBackupsSize(): string {
    // This would need to sum up actual backup sizes
    // For now, return a placeholder
    return `${this.backupStats.total * 12.5} GB`;
  }

  calculateTotalSize(data: any): string {
    // Calculate from dashboard data if available
    return '156.7 GB'; // Placeholder
  }

  updateChartWithRealData(data: any): void {
    if (data.by_date && isPlatformBrowser(this.platformId)) {
      const dates = Object.keys(data.by_date).sort();
      const successData = dates.map(date => data.by_date[date] || 0);
      
      this.chartData = {
        labels: dates.map(date => new Date(date).toLocaleDateString()),
        datasets: [
          {
            label: 'Successful Backups',
            data: successData,
            fill: false,
            borderColor: '#4CAF50',
            tension: 0.4
          },
          {
            label: 'Failed Backups',
            data: dates.map(() => Math.floor(Math.random() * 3)), // Placeholder
            fill: false,
            borderColor: '#F44336',
            tension: 0.4
          }
        ]
      };
    }
  }

  // === MANUAL REFRESH METHODS ===

  manualRefresh(): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Refreshing',
      detail: 'Updating dashboard data...'
    });
    
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    // Trigger all data loads
    this.loadRealBackups().subscribe();
    this.loadLiveActivity().subscribe();
    this.loadDashboardStats().subscribe();
    this.loadDashboardStatsReal().subscribe();
    this.loadLiveActivityFeed().subscribe();
  }

  toggleAutoRefresh(): void {
    this.autoRefreshEnabled = !this.autoRefreshEnabled;
    
    if (this.autoRefreshEnabled) {
      this.startRealTimeUpdates();
      this.messageService.add({
        severity: 'success',
        summary: 'Auto-refresh Enabled',
        detail: `Dashboard will update every ${this.refreshInterval} seconds`
      });
    } else {
      this.stopRealTimeUpdates();
      this.messageService.add({
        severity: 'info',
        summary: 'Auto-refresh Disabled',
        detail: 'Dashboard updates paused'
      });
    }
  }





  
}
