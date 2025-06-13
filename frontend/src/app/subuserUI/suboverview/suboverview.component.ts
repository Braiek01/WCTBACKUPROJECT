import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { MessageService } from 'primeng/api';

// PrimeNG Imports
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { SplitButtonModule } from 'primeng/splitbutton';
import { TabViewModule } from 'primeng/tabview';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { AccordionModule } from 'primeng/accordion';
import { TimelineModule } from 'primeng/timeline';
import { DividerModule } from 'primeng/divider';

@Component({
  selector: 'app-suboverview',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    CardModule,
    ChartModule,
    DialogModule,
    DropdownModule,
    InputTextModule,
    SplitButtonModule,
    TabViewModule,
    TagModule,
    ToastModule,
    AccordionModule,
    TimelineModule,
    DividerModule
  ],
  templateUrl: './suboverview.component.html',
  styleUrl: './suboverview.component.css',
  providers: [MessageService]
})
export class SuboverviewComponent implements OnInit {
  // User info
  username: string = '';
  tenantName: string = '';
  
  // Date info
  currentMonth: string = '';
  currentYear: number = 0;
  
  // Split button menu
  splitButtonItems = [
    {
      label: 'Profile',
      icon: 'pi pi-user',
      command: () => {
        this.router.navigate(['/', this.tenantName, 'subuser-profile']);
      }
    },
    {
      label: 'Logout',
      icon: 'pi pi-sign-out',
      command: () => this.logout()
    }
  ];
  
  // Dashboard data
  backups: any[] = [];
  recentActions: any[] = [];

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private router: Router,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    // Get user info
    this.username = this.authService.getUsername() || '';
    this.tenantName = this.authService.getTenantName() || '';
    
    // Get current date info
    const now = new Date();
    this.currentMonth = now.toLocaleString('default', { month: 'long' });
    this.currentYear = now.getFullYear();
    
    // Load backup data
    this.loadBackups();
    this.loadRecentActivity();
  }
  
  loadBackups(): void {
    // For demo, using mock data
    this.backups = [
      { 
        id: 1, 
        name: 'Web Server Backup', 
        status: 'Completed', 
        created: '2025-06-01',
        type: 'Restic', 
        size: '15.2 GB'
      },
      { 
        id: 2, 
        name: 'Database Backup', 
        status: 'Warning', 
        created: '2025-05-25',
        type: 'Full', 
        size: '7.8 GB'
      }
    ];
  }
  
  loadRecentActivity(): void {
    // Mock data for recent activities
    this.recentActions = [
      { 
        description: 'Backup "Web Server Backup" completed', 
        date: '15 minutes ago', 
        icon: 'pi pi-check-circle', 
        color: '#689F38', 
        by: 'System' 
      },
      { 
        description: 'User "' + this.username + '" logged in', 
        date: '1 hour ago', 
        icon: 'pi pi-sign-in', 
        color: '#0288D1', 
        by: this.username 
      },
      { 
        description: 'Backup "Database Backup" warning', 
        date: '2 hours ago', 
        icon: 'pi pi-exclamation-triangle', 
        color: '#FBC02D', 
        by: 'Scheduler' 
      }
    ];
  }
  
  logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Logged Out',
          detail: 'You have been successfully logged out'
        });
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 1000);
      },
      error: (err) => {
        console.error('Error during logout:', err);
        this.router.navigate(['/login']);
      }
    });
  }
}