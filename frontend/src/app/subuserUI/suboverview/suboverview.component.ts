import { ChartModule } from 'primeng/chart';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { SplitButtonModule } from 'primeng/splitbutton';
import { DialogModule} from 'primeng/dialog';
import { InputTextModule} from 'primeng/inputtext';
import { DropdownModule} from 'primeng/dropdown';
import { Component, OnInit, Inject, PLATFORM_ID, OnDestroy, inject } from '@angular/core'; 
import { CreateBackupJobData } from '../../core/services/job.service';
import { CommonModule } from '@angular/common';
import { InputGroupModule } from 'primeng/inputgroup'; // Import InputGroupModule
import { InputGroupAddonModule } from 'primeng/inputgroupaddon'; // Import InputGroupAddonModule
import { FormsModule } from '@angular/forms';
import { InputTextarea } from 'primeng/inputtextarea';
import { AuthService } from '../../core/services/auth.service'; // Adjust the path as necessary
import { Router } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { RouterModule } from '@angular/router';


@Component({
  selector: 'app-suboverview',
  imports: [ChartModule , ButtonModule , CardModule 
    , SplitButtonModule , DialogModule , InputTextModule ,  RouterModule , DropdownModule , CommonModule , InputGroupModule , InputGroupAddonModule , FormsModule , InputTextarea , ToastModule],
  templateUrl: './suboverview.component.html',
  styleUrls: ['./suboverview.component.css'],
  providers: [MessageService] // Add if not already there
})
export class SuboverviewComponent implements OnInit {

  // private authService = inject(AuthService);
  // private router = inject(Router);
  // private messageService = inject(MessageService);

  username: string = '';
  tenantDomain: string = ''; // Add this property to the class
  tenantName: string = ''; // Add tenantName property
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



  currentMonth = new Date().toLocaleString('default', { month: 'long' });
  currentYear = new Date().getFullYear();
  lastBackupDate = 'Fri May 2 21:46:33 2025';
  lastBackupDay = 'May 2';
  lastBackupMachine = 'server01.example.com';

  usedStorage = '4.60 MB';
  remainingStorage = '1024.00 GB';

  quotaChartData = {
    labels: ['Used', 'Remaining'],
    datasets: [
      {
        data: [4.6, 1024],
        backgroundColor: ['#22c55e', '#e5e7eb'],
        hoverBackgroundColor: ['#16a34a', '#d1d5db']
      }
    ]
  };

  quotaChartOptions = {
    cutout: '80%',
    plugins: {
      legend: { display: false }
    }
  };




  splitButtonItems = [
    {
      label: 'Profile',
      icon: 'pi pi-user',
      command: () => {
        this.router.navigate(['/', this.tenantDomain, 'profile']);
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
    private router: Router,
    private messageService: MessageService
  ) {}

  showBackupDialog() {
        this.backupDialogVisible = true;
        // Reset fields if needed
        this.backupName = '';
        this.targetHosts = '';
        // Use a path relative to the backend/ansible/playbooks directory
        this.playbookPath = 'mysqldump_playbook.yml'; // Default to the mysql dump playbook
        this.extraVars = '';
        this.publickey = '';
        this.selectedBackupType = 'restic'; // Or your preferred default
      }
    
      hideBackupDialog() {
        this.backupDialogVisible = false;
      }
    
      runBackupPlaybook() {
       
    
        const jobData: CreateBackupJobData = {
          name: this.backupName,
          target_hosts: this.targetHosts,
          playbook_path: this.playbookPath, // Send the relative path
          backup_type: this.selectedBackupType,
          extra_vars: this.parseExtraVars(this.extraVars),
          publickey: this.publickey // Include public key if needed
        };
    
        console.log('Sending job request to backend:', jobData);
    

   }
   // Parses extraVars string into an object (expects key=value pairs separated by commas)
   parseExtraVars(extraVars: string): { [key: string]: string } {
      if (!extraVars) return {};
      return extraVars.split(',')
        .map(pair => pair.trim())
        .filter(pair => pair.includes('='))
        .reduce((acc, pair) => {
          const [key, value] = pair.split('=').map(s => s.trim());
          acc[key] = value;
          return acc;
        }, {} as { [key: string]: string });
   }

   ngOnInit(): void {
    
     
    // Get username from localStorage
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      this.username = storedUsername;
    } else {
      const currentUser = this.authService.getCurrentUser();
      if (currentUser && currentUser.username) {
        this.username = currentUser.username;
      }
    }
    
    // Get tenant domain from the auth service
    this.tenantDomain = this.authService.getTenantDomain() || '';
    console.log('Tenant domain in subuser overview:', this.tenantDomain);
    
    // Get tenant name instead of domain
    this.tenantName = this.authService.getTenantName() || '';
    console.log('Tenant name:', this.tenantName);
    
    // Rest of your initialization code...
}

   // Add logout method
   logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success', 
          summary: 'Logged Out', 
          detail: 'You have been successfully logged out'
        });
        this.router.navigate(['/login']);
      }
    });
  }
}