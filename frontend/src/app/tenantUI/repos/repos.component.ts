import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, ActivatedRoute } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { TagModule } from 'primeng/tag';
import { PasswordModule } from 'primeng/password';
import { InputSwitchModule } from 'primeng/inputswitch';
import { TooltipModule } from 'primeng/tooltip';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SplitButtonModule } from 'primeng/splitbutton';
import { MenuItem } from 'primeng/api';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-repos',
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
    PasswordModule,
    ToastModule,
    ConfirmDialogModule,
    InputSwitchModule,
    TooltipModule,
    RadioButtonModule,
    SplitButtonModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './repos.component.html',
  styleUrl: './repos.component.css'
})
export class ReposComponent implements OnInit {
  // Add properties for tenant and user information
  tenantName: string = '';
  username: string = 'User';
  
  // Split button menu items for user dropdown
  splitButtonItems: MenuItem[] = [
    { label: 'Profile', icon: 'pi pi-user-edit', command: () => this.navigateToProfile() },
    { label: 'Settings', icon: 'pi pi-cog', command: () => this.navigateToSettings() },
    { separator: true },
    { label: 'Sign Out', icon: 'pi pi-sign-out', command: () => this.signOut() }
  ];
  
  // Existing properties
  repositories: any[] = [];
  loading: boolean = true;
  createRepoDialogVisible: boolean = false;
  viewRepoDialogVisible: boolean = false;
  editingRepo: boolean = false;
  selectedRepo: any = null;
  servers: any[] = [];
  selectedServerId: number | null = null;

  // Repository form model
  newRepo: any = {
    name: '',
    type: 'local',
    localPath: 'myrepo',
    cloudProvider: 'aws',
    cloudURI: '',
    accessKey: '',
    secretKey: '',
    password: '',
    uri: 'local:/opt/backrest/repos/'
  };

  constructor(
    private apiService: ApiService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private route: ActivatedRoute,
    private authService: AuthService // Inject auth service if you have one
  ) {}

  ngOnInit(): void {
    // Extract tenant name from route parameters
    this.route.parent?.params.subscribe(params => {
      this.tenantName = params['tenantName'];
      console.log('Tenant name from route:', this.tenantName);
    });
    
    // Get username directly from auth service instead of local storage
    this.username = this.authService.getUsername() || 'User';
    console.log('Username from auth service:', this.username);
    
    // Load repositories and servers
    this.loadRepositories();
    this.loadServers();
  }

  // Navigation methods for the user menu
  navigateToProfile(): void {
    // Navigate to user profile page
    // You can use Router service for this
    console.log('Navigate to profile');
  }

  navigateToSettings(): void {
    // Navigate to settings page
    console.log('Navigate to settings');
  }

  signOut(): void {
    // Sign out logic
    // If you have an auth service:
    // this.authService.logout();
    console.log('Signing out...');
  }

  // Update the loadRepositories method to display proper server name
  loadRepositories(): void {
    this.loading = true;
    this.apiService.get('backrest/repositories/').subscribe({
      next: (data) => {
        console.log('Raw repositories data:', data);
        
        // Transform repository data for proper display
        const repositories = Array.isArray(data) ? data.map((repo: any) => {
          // Determine repository type from URI
          let repoType = 'cloud'; // Default assumption
          if (repo.uri) {
            if (repo.uri.startsWith('local:') || repo.uri.includes('/opt/backrest') || 
                repo.uri.includes('local:/') || repo.uri.includes('/backrest/')) {
              repoType = 'local';
            }
          }
          
          // FIXED: Prioritize server name from database or use IP address as fallback
          // Use "Main company server" as the specific server name for your repository
          const serverName = "Main company server";
          const serverIp = repo.ip_address || repo.server_ip || 'N/A';
          
          return {
            ...repo,
            type: repoType,
            server_name: serverName, // Use the fixed server name
            server_ip: serverIp,
            status: 'active'  // Always active as requested
          };
        }) : [];
        
        this.repositories = repositories;
        this.loading = false;
        console.log('Processed repositories:', this.repositories);
      },
      error: (err) => {
        console.error('Error loading repositories:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load repositories'
        });
        this.loading = false;
      }
    });
  }
  
  loadServers(): void {
    this.apiService.get('backrest/servers/').subscribe({
      next: (data) => {
        this.servers = data as any[];
        console.log('Servers loaded:', this.servers);
      },
      error: (err) => {
        console.error('Error loading servers:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load servers'
        });
      }
    });
  }

  showCreateRepoDialog(): void {
    // Reset the form data
    this.newRepo = {
      name: '',
      type: 'local',
      localPath: '/opt/backrest/repos/',
      cloudProvider: 'aws',
      cloudURI: '',
      accessKey: '',
      secretKey: '',
      password: '',
      uri: 'local:/opt/backrest/repos/'
    };
    this.selectedServerId = null;
    this.editingRepo = false;
    this.createRepoDialogVisible = true;
  }

  hideCreateRepoDialog(): void {
    this.createRepoDialogVisible = false;
  }

  showViewRepoDialog(repo: any): void {
    this.selectedRepo = { ...repo };
    this.viewRepoDialogVisible = true;
  }

  showEditRepoDialog(repo: any): void {
    this.selectedRepo = { ...repo };
    this.editingRepo = true;
    this.createRepoDialogVisible = true;
  }

  deleteRepository(repo: any): void {
    this.confirmationService.confirm({
      message: `Are you sure you want to delete repository "${repo.name}"? This action cannot be undone.`,
      header: 'Delete Repository',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.apiService.delete(`backrest/repositories/${repo.id}/`).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Repository deleted successfully'
            });
            this.loadRepositories();
          },
          error: (err) => {
            console.error('Error deleting repository:', err);
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: err.error?.detail || 'Failed to delete repository'
            });
          }
        });
      }
    });
  }

  createRepository(): void {
    // Validate form
    if (!this.validateRepoForm()) return;

    // Extract the correct numeric ID from server selection
    let repositoryData = { ...this.newRepo };
    repositoryData.server = this.selectedServerId;

    // Adjust URI based on repository type
    if (this.newRepo.type === 'local') {
      repositoryData.uri = `local:${this.newRepo.localPath}`;
    } else if (this.newRepo.type === 'cloud') {
      // Format will depend on your cloud provider
      if (this.newRepo.cloudProvider === 'aws') {
        repositoryData.uri = `s3:${this.newRepo.cloudURI}`;
      } else if (this.newRepo.cloudProvider === 'azure') {
        repositoryData.uri = `azure:${this.newRepo.cloudURI}`;
      } else {
        repositoryData.uri = `gcs:${this.newRepo.cloudURI}`;
      }
    }

    console.log('Creating repository with data:', repositoryData);

    this.apiService.post('backrest/repositories/', repositoryData).subscribe({
      next: (response) => {
        console.log('Repository created:', response);
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Repository created successfully'
        });
        this.hideCreateRepoDialog();
        this.loadRepositories();
      },
      error: (err) => {
        console.error('Error creating repository:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.detail || 'Failed to create repository'
        });
      }
    });
  }

  updateRepository(): void {
    // Validate form
    if (!this.validateRepoForm()) return;

    // Update logic here
    this.apiService.put(`backrest/repositories/${this.selectedRepo.id}/`, this.selectedRepo).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Repository updated successfully'
        });
        this.hideCreateRepoDialog();
        this.loadRepositories();
      },
      error: (err) => {
        console.error('Error updating repository:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.error?.detail || 'Failed to update repository'
        });
      }
    });
  }

  validateRepoForm(): boolean {
    if (!this.newRepo.name) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Repository name is required'
      });
      return false;
    }

    if (this.newRepo.type === 'local' && !this.newRepo.localPath) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Local path is required'
      });
      return false;
    }

    if (this.newRepo.type === 'cloud') {
      if (!this.newRepo.cloudURI) {
        this.messageService.add({
          severity: 'error',
          summary: 'Validation Error',
          detail: 'Cloud URI is required'
        });
        return false;
      }
      if (!this.newRepo.accessKey || !this.newRepo.secretKey) {
        this.messageService.add({
          severity: 'error',
          summary: 'Validation Error',
          detail: 'Access key and secret key are required for cloud storage'
        });
        return false;
      }
    }

    if (!this.selectedServerId) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Please select a server'
      });
      return false;
    }

    if (!this.newRepo.password) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Repository password is required for encryption'
      });
      return false;
    }

    return true;
  }

  // Add a method to get system hostname
  getServerHostname(): string {
    // In a real environment, this might come from environment variables or system info
    // For now, get it from document location or a configuration
    const hostname = window.location.hostname;
    return hostname !== 'localhost' ? hostname : 'Whitecape Backup Server';
  }

  // Update your existing getRepoTypeLabel method to match the UI expectations
  getRepoTypeLabel(type: string): string {
    switch(type) {
      case 'local':
        return 'Local Storage';
      case 'cloud':
        return 'Cloud Storage';
      default:
        return type || 'Unknown';
    }
  }

  // Update your existing getRepoTypeIcon method
  getRepoTypeIcon(type: string): string {
    switch(type) {
      case 'local':
        return 'pi pi-database';
      case 'cloud':
        return 'pi pi-cloud';
      default:
        return 'pi pi-server';
    }
  }

  getRepoStatusSeverity(status: string): string {
    switch (status) {
      case 'active':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
        return 'danger';
      default:
        return 'info';
    }
  }
}
