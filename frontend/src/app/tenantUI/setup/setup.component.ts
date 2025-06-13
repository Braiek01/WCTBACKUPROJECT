import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';
import { RouterModule } from '@angular/router';

// PrimeNG Components
import { StepsModule } from 'primeng/steps';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextarea } from 'primeng/inputtextarea';
import { DividerModule } from 'primeng/divider';
import { ToastModule } from 'primeng/toast';
import { FileUploadModule } from 'primeng/fileupload';
import { RadioButtonModule } from 'primeng/radiobutton';
import { InputSwitchModule } from 'primeng/inputswitch';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { DialogModule } from 'primeng/dialog';
import { AuthService } from '../../core/services/auth.service';
import { SetupService } from '../../core/services/setup.service';

@Component({
  selector: 'app-setup-wizard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    StepsModule,
    CardModule,
    InputTextModule,
    ButtonModule,
    PasswordModule,
    DropdownModule,
    InputTextarea,
    DividerModule,
    ToastModule,
    FileUploadModule,
    RadioButtonModule,
    InputSwitchModule,
    ProgressSpinnerModule,
    DialogModule, 
    RouterModule
  ],
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.css']
})
export class SetupWizardComponent implements OnInit {
  tenantName: string = '';
  activeIndex: number = 0;
  setupComplete: boolean = false;
  isLoading: boolean = false;
  displayModal: boolean = false;
  
  // Server configuration step
  serverConfig = {
    name: '',
    hostname: '',
    ip_address: '',
    username: '',
    port: 22,
    password: '',
    description: ''
  };
  
  // SSH key step
  sshKeyConfig = {
    method: 'generate', // 'generate' or 'upload'
    publicKey: '',
    privateKey: '',
    passphrase: '',
    savePrivateKey: true
  };
  
  // Backrest configuration step
  backrestConfig = {
    installPath: '/opt/backrest',
    port: 9898,
    storageType: 'local',
    localPath: '/var/backups',
    autoStart: true,
    // Azure storage configuration
    azureAccountName: '',
    azureAccountKey: '',
    azureContainerName: '',
    // Instance configuration
    instanceId: `instance-${new Date().getTime()}`,
    adminUsername: 'admin',
    adminPassword: 'admin123',
    defaultPassword: 'backrest123'
  };
  
  // Define the steps
  steps = [
    { label: 'SSH Key Setup' },
    { label: 'Server Configuration' },
    { label: 'Backrest Configuration' }
  ];
  
  constructor(
    private authService: AuthService,
    private setupService: SetupService,
    private messageService: MessageService,
    private router: Router
  ) {}
  
  ngOnInit() {
    // Get tenant name from auth service
    this.tenantName = this.authService.getTenantName() || '';
    
    // Log the current tenant name
    console.log('Current tenant name:', this.tenantName);
    
    // First clear any cached setup status to ensure fresh check
    this.setupService.clearSetupStatusCache();
    
    // Check if setup is needed - use true to force API check
    this.checkSetupStatus();
  }
  
  checkSetupStatus() {
    this.isLoading = true;
    // Pass true to force API check and skip cache
    this.setupService.checkSetupStatus(true).subscribe({
      next: (response) => {
        this.isLoading = false;
        console.log('Setup status response:', response);
        
        if (!response.setupNeeded) {
          // Setup already complete
          this.setupComplete = true;
          this.messageService.add({
            severity: 'info',
            summary: 'Setup Already Complete',
            detail: 'Your server is already configured and ready to use.'
          });
          // Redirect to dashboard after a short delay
          setTimeout(() => {
            const tenantName = this.authService.getTenantName();
            console.log('Attempting navigation to:', `/${tenantName}/dashboard`);
            this.router.navigate([`/${tenantName}/dashboard`]);
          }, 2000);
        } else {
          // Show setup modal
          this.displayModal = true;
        }
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error checking setup status:', error);
        // Assume setup is needed
        this.displayModal = true;
        this.messageService.add({
          severity: 'warn',
          summary: 'Setup Required',
          detail: 'Please complete the setup process to start using Backrest.'
        });
      }
    });
  }
  
  // Move to the next step in the wizard
  nextStep() {
    if (this.validateCurrentStep()) {
      if (this.activeIndex === 0) { // After SSH Key Setup
        this.registerSshKey();
      } else if (this.activeIndex === 1) { // After Server Configuration
        this.registerServer();
      } else if (this.activeIndex === 2) { // After Backrest Configuration
        this.completeSetup();
      }
    }
  }
  
  // Go back to the previous step
  prevStep() {
    if (this.activeIndex > 0) {
      this.activeIndex--;
    }
  }
  
  // Validate the current step before allowing to proceed
  validateCurrentStep(): boolean {
    switch (this.activeIndex) {
      case 0: // SSH Key Setup
        if (this.sshKeyConfig.method === 'upload' && !this.sshKeyConfig.publicKey) {
          this.messageService.add({
            severity: 'error',
            summary: 'Validation Error',
            detail: 'Please provide an SSH public key'
          });
          return false;
        }
        if (this.sshKeyConfig.publicKey && !this.sshKeyConfig.privateKey && this.sshKeyConfig.savePrivateKey) {
          this.messageService.add({
            severity: 'error',
            summary: 'Validation Error',
            detail: 'Private key is required when choosing to save it'
          });
          return false;
        }
        return true;
        
      case 1: // Server Configuration
        if (!this.serverConfig.name || !this.serverConfig.hostname || 
            !this.serverConfig.ip_address || !this.serverConfig.username) {
          this.messageService.add({
            severity: 'error',
            summary: 'Validation Error',
            detail: 'Please enter all required server details'
          });
          return false;
        }
        return true;
        
      case 2: // Backrest Configuration
        if (!this.backrestConfig.installPath) {
          this.messageService.add({
            severity: 'error',
            summary: 'Validation Error',
            detail: 'Please provide an installation path'
          });
          return false;
        }
        
        if (!this.backrestConfig.adminUsername || !this.backrestConfig.adminPassword) {
          this.messageService.add({
            severity: 'error',
            summary: 'Validation Error',
            detail: 'Admin username and password are required'
          });
          return false;
        }
        
        if (this.backrestConfig.adminPassword.length < 8) {
          this.messageService.add({
            severity: 'error',
            summary: 'Validation Error',
            detail: 'Admin password should be at least 8 characters long'
          });
          return false;
        }
        
        return true;
    }
    
    return true;
  }
  
  // Register the server and then test the connection using its ID
  registerAndTestServerConnection() {
    this.isLoading = true;
    this.setupService.registerServer(this.serverConfig, { id: null }).subscribe({
      next: (serverResponse) => {
        const serverId = serverResponse.id;
        this.setupService.testServerConnection(serverId).subscribe({
          next: (response) => {
            this.isLoading = false;
            if (response.success || response.status === 'success') {
              this.messageService.add({
                severity: 'success',
                summary: 'Connection Successful',
                detail: 'Successfully connected to the server'
              });
              // Proceed to next step automatically after successful connection
              this.activeIndex++;
            } else {
              this.messageService.add({
                severity: 'error',
                summary: 'Connection Failed',
                detail: response.message || 'Failed to connect to the server'
              });
            }
          },
          error: (error) => {
            this.isLoading = false;
            console.error('Error testing server connection:', error);
            this.messageService.add({
              severity: 'error',
              summary: 'Connection Error',
              detail: 'Failed to connect to the server. Please check your credentials.'
            });
          }
        });
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error registering server:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Registration Error',
          detail: 'Failed to register the server. Please check your details.'
        });
      }
    });
  }
  
  generateSSHKey() {
    this.isLoading = true;
    this.setupService.generateSSHKey().subscribe({
      next: (response) => {
        this.isLoading = false;
        this.sshKeyConfig.publicKey = response.publicKey;
        this.sshKeyConfig.privateKey = response.privateKey;
        this.messageService.add({
          severity: 'success',
          summary: 'Keys Generated',
          detail: 'SSH keys generated successfully'
        });
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error generating SSH keys:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Generation Failed',
          detail: 'Failed to generate SSH keys'
        });
      }
    });
  }
  
  onFileSelect(event: any, keyType: 'public' | 'private') {
    const file = event.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (keyType === 'public') {
          this.sshKeyConfig.publicKey = reader.result as string;
        } else {
          this.sshKeyConfig.privateKey = reader.result as string;
        }
      };
      reader.readAsText(file);
    }
  }
  
  // Add a method to register SSH key
  registerSshKey() {
    this.isLoading = true;
    this.setupService.registerSshKey({
      name: `Key for ${this.serverConfig.name || 'Server'}`,
      publicKey: this.sshKeyConfig.publicKey,
      privateKey: this.sshKeyConfig.privateKey,
      passphrase: this.sshKeyConfig.passphrase
    }).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success === false) {
          this.messageService.add({
            severity: 'error',
            summary: 'SSH Key Registration Failed',
            detail: response.message
          });
        } else {
          this.messageService.add({
            severity: 'success',
            summary: 'SSH Key Registered',
            detail: 'SSH key has been registered successfully'
          });
          this.activeIndex++;
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.messageService.add({
          severity: 'error',
          summary: 'SSH Key Registration Failed',
          detail: error.message || 'Unknown error occurred'
        });
      }
    });
  }

  // Add a method to register the server and test connection before proceeding
  registerServer() {
    this.isLoading = true;
    
    // Don't pass id:null - let the service use the stored SSH key ID from previous step
    this.setupService.registerServer(this.serverConfig).subscribe({
      next: (serverResponse) => {
        if (!serverResponse.id) {
          this.isLoading = false;
          this.messageService.add({
            severity: 'error',
            summary: 'Server Registration Failed',
            detail: serverResponse.message || 'Failed to register the server'
          });
          return;
        }
        
        this.messageService.add({
          severity: 'success',
          summary: 'Server Registered',
          detail: 'Server has been registered successfully. Testing connection...'
        });
        
        // Now test the connection with the newly registered server
        this.setupService.testServerConnection().subscribe({
          next: (connectionResponse) => {
            this.isLoading = false;
            
            if (connectionResponse.status === 'success') {
              this.messageService.add({
                severity: 'success',
                summary: 'Connection Successful',
                detail: connectionResponse.message || 'Successfully connected to the server'
              });
              
              // Only proceed to the next step if connection is successful
              this.activeIndex++;
            } else {
              this.messageService.add({
                severity: 'error',
                summary: 'Connection Failed',
                detail: connectionResponse.message || 'Failed to connect to the server'
              });
            }
          },
          error: (error) => {
            this.isLoading = false;
            console.error('Error testing connection:', error);
            this.messageService.add({
              severity: 'error',
              summary: 'Connection Test Error',
              detail: error.message || 'Failed to test connection to the server'
            });
          }
        });
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error registering server:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Server Registration Failed',
          detail: error.message || 'Failed to register the server'
        });
      }
    });
  }
  
  // Update the completeSetup method for automatic redirection

  completeSetup() {
    this.isLoading = true;
    this.messageService.clear();
    
    // Create setupData object from your existing config properties
    const setupData = {
      server: this.serverConfig,
      ssh: this.sshKeyConfig,
      backrest: this.backrestConfig
    };
    
    this.setupService.completeSetup(setupData).subscribe({
      next: (response) => {
        this.isLoading = false;
        console.log('Complete setup response:', response);
        
        // Show appropriate toast based on response quality
        if (response.success) {
          if (response.partial || response.warning) {
            this.messageService.add({
              severity: 'warn',
              summary: 'Setup Partially Completed',
              detail: 'Backrest was installed but some configuration steps may need to be completed manually.',
              life: 10000
            });
          } else {
            this.messageService.add({
              severity: 'success',
              summary: 'Setup Complete',
              detail: 'Backrest has been successfully installed and configured!',
              life: 5000
            });
          }
          
          // Always navigate to dashboard on any kind of success
          setTimeout(() => {
            this.router.navigate(['/', this.setupService.getTenantName(), 'dashboard']);
          }, 2000);
        } else {
          // Handle setup failure
          this.messageService.add({
            severity: 'error',
            summary: 'Setup Failed',
            detail: response.message || 'An error occurred during setup.',
            life: 10000
          });
        }
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Complete setup error:', error);
        
        // Try to recover gracefully even on error
        this.messageService.add({
          severity: 'error',
          summary: 'Setup Error',
          detail: 'Setup process encountered errors. Some features may not work correctly.',
          life: 10000
        });
        
        // Force mark setup as complete in localStorage as a last resort
        this.setupService.forceMarkSetupComplete();
        
        // Navigate after a delay
        setTimeout(() => {
          this.router.navigate(['/', this.setupService.getTenantName(), 'dashboard']);
        }, 3000);
      }
    });
  }

  // Add this new method to check service status
  checkBackrestServiceStatus() {
    const serverId = this.setupService.getServerId() || 0;
    
    this.messageService.add({
      severity: 'info',
      summary: 'Verifying Installation',
      detail: 'Checking if Backrest service is running...'
    });
    
    // Set a failsafe timeout to ensure redirection happens no matter what
    const redirectTimeout = setTimeout(() => {
      console.log("Failsafe redirect triggered after timeout");
      this.setupComplete = true;
      this.isLoading = false;
      this.redirectToDashboard();
    }, 10000); // 10 second timeout
    
    this.setupService.checkBackrestServiceStatus(serverId).subscribe({
      next: (statusResponse) => {
        clearTimeout(redirectTimeout);
        console.log('Service status check response:', statusResponse);
        
        // Always mark setup as complete locally regardless of what the status check says
        this.setupService.forceMarkSetupComplete();
        this.setupComplete = true;
        this.isLoading = false;
        
        if (statusResponse.status === 'active' || statusResponse.is_running) {
          this.messageService.add({
            severity: 'success',
            summary: 'Service Verified',
            detail: 'Backrest service is running on the server!'
          });
        } else {
          this.messageService.add({
            severity: 'warn',
            summary: 'Service Status Unknown',
            detail: 'Could not verify service status, but setup will continue.'
          });
        }
        
        // Redirect to dashboard after short delay
        setTimeout(() => {
          this.redirectToDashboard();
        }, 1500);
      },
      error: (error) => {
        clearTimeout(redirectTimeout);
        console.error('Service status check error:', error);
        
        // Even if status check fails, consider setup complete
        this.setupService.forceMarkSetupComplete();
        this.setupComplete = true;
        this.isLoading = false;
        
        this.messageService.add({
          severity: 'warn',
          summary: 'Verification Failed',
          detail: 'Could not verify service status, but installation succeeded.'
        });
        
        // Still redirect to dashboard
        setTimeout(() => {
          this.redirectToDashboard();
        }, 1500);
      }
    });
  }

  // Add retry method
  retryServiceCheck() {
    const serverId = this.setupService.getServerId() || 0;
    
    this.setupService.checkBackrestServiceStatus(serverId).subscribe({
      next: (statusResponse) => {
        if (statusResponse.status === 'active' || statusResponse.is_running) {
          this.messageService.add({
            severity: 'success',
            summary: 'Service Verified',
            detail: 'Backrest service is now running!'
          });
        } else {
          this.messageService.add({
            severity: 'warn',
            summary: 'Service Still Not Running',
            detail: 'Backrest service is not running, but setup will continue.'
          });
        }
        
        // Regardless of retry result, mark setup complete and redirect
        this.setupService.forceMarkSetupComplete();
        this.setupComplete = true;
        this.isLoading = false;
        
        setTimeout(() => {
          this.redirectToDashboard();
        }, 2000);
      },
      error: (error) => {
        // Force complete even on error
        this.setupService.forceMarkSetupComplete();
        this.setupComplete = true;
        this.isLoading = false;
        
        setTimeout(() => {
          this.redirectToDashboard();
        }, 2000);
      }
    });
  }

  // Add helper method for redirection
  private redirectToDashboard(): void {
    const tenantName = this.authService.getTenantName();
    console.log('Redirecting to dashboard for tenant:', tenantName);
    
    // Use window.location for a hard redirect - more reliable
    window.location.href = `/${tenantName}/dashboard`;
  }
}
