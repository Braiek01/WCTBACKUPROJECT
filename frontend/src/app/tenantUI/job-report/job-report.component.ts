import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuItem } from 'primeng/api';

// PrimeNG Modules
import { ProgressBarModule } from 'primeng/progressbar';
import { TabViewModule } from 'primeng/tabview';
import { TableModule } from 'primeng/table';
import { ToolbarModule } from 'primeng/toolbar';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { SplitButtonModule } from 'primeng/splitbutton';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button'; // Import ButtonModule

@Component({
  selector: 'app-job-report',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ProgressBarModule,
    TabViewModule,
    TableModule,
    ToolbarModule,
    DropdownModule,
    InputTextModule,
    SplitButtonModule,
    TagModule,
    ButtonModule // Add ButtonModule
  ],
  templateUrl: './job-report.component.html',
  styleUrls: ['./job-report.component.css']
})
export class JobReportComponent implements OnInit {
  @Input() job: any; // Input property to receive job data

  // --- Properties for Log Messages Table ---
  logMessages: any[] = [];
  selectedLogMessages: any[] = []; // If selection is needed
  logRowsPerPageOptions = [
    { label: '10', value: 10 },
    { label: '25', value: 25 },
    { label: '50', value: 50 },
    { label: '100', value: 100 }
  ];
  selectedLogRowsPerPage = 10;
  logExportItems: MenuItem[] = [];
  logViewItems: MenuItem[] = [];
  logFilterValue: string = '';

  // --- Sample Data (Replace with actual data fetching based on job.id) ---
  jobDetails = {
    username: '',
    type: '',
    status: '',
    started: '',
    stopped: '',
    duration: '',
    protectedItem: '',
    storageVault: '"polytechnicien-Zmanda Cloud Storage-us-east-1"', // Example
    accountName: '',
    device: '',
    totalSize: '',
    files: 0,
    directories: 1, // Example
    uploaded: '',
    downloaded: '',
    version: '24.9.8' // Example
  };
  progressValue = 100; // Example

  constructor() {}

  ngOnInit(): void {
    if (this.job) {
      // Populate jobDetails from the input job data
      this.jobDetails.username = this.job.device?.split('-')[1] || 'Unknown'; // Extract username logic might vary
      this.jobDetails.type = this.job.type;
      this.jobDetails.status = this.job.status;
      this.jobDetails.started = this.job.started;
      // Assuming 'stopped' is calculated or fetched separately
      this.jobDetails.stopped = this.calculateStopTime(this.job.started, this.job.duration);
      this.jobDetails.duration = this.job.duration;
      this.jobDetails.protectedItem = `"${this.job.protectedItem}"`;
      this.jobDetails.accountName = this.jobDetails.username; // Assuming account name is same as username part
      this.jobDetails.device = `"${this.job.device}"`;
      this.jobDetails.totalSize = this.job.size;
      this.jobDetails.files = this.job.files;
      this.jobDetails.uploaded = this.job.uploaded;
      this.jobDetails.downloaded = this.job.downloaded;

      // TODO: Fetch actual log messages based on this.job.id
      this.logMessages = this.getSampleLogMessages(this.job.id);
    }

    // Initialize toolbar items
    this.logExportItems = [
        { label: 'Export CSV', icon: 'pi pi-file', command: () => this.exportLogs('csv') },
        { label: 'Export Excel', icon: 'pi pi-file-excel', command: () => this.exportLogs('excel') }
    ];
    this.logViewItems = [
        { label: 'Customize Columns', icon: 'pi pi-table', command: () => this.customizeLogView() }
    ];
  }

  // Helper to calculate stop time (basic example)
  calculateStopTime(startTime: string, duration: string): string {
    try {
      const startDate = new Date(startTime);
      const durationParts = duration.split(':').map(Number); // Assuming HH:MM or MM:SS or H:MM:SS
      let secondsToAdd = 0;
      if (durationParts.length === 3) { // H:MM:SS
        secondsToAdd = durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2];
      } else if (durationParts.length === 2) { // MM:SS
        secondsToAdd = durationParts[0] * 60 + durationParts[1];
      }
      startDate.setSeconds(startDate.getSeconds() + secondsToAdd);
      // Format back to string 'yyyy-MM-dd HH:mm:ss'
      return startDate.toISOString().slice(0, 19).replace('T', ' ');
    } catch (e) {
      console.error("Error calculating stop time:", e);
      return "N/A";
    }
  }

  // Placeholder for fetching log messages
  getSampleLogMessages(jobId: string): any[] {
    // In a real app, fetch logs for jobId from a service
    return [
      { time: '2025-05-02 21:48:24', type: 'Info', message: 'Looking up account settings...' },
      { time: '2025-05-02 21:48:24', type: 'Info', message: 'Checking connection to Storage Vault...' },
      { time: '2025-05-02 21:48:27', type: 'Info', message: 'Preparing Storage Vault for first use...' },
      { time: '2025-05-02 21:48:34', type: 'Info', message: 'Initialized Storage Vault (08a37bd077)' },
      { time: '2025-05-02 21:48:34', type: 'Info', message: 'The Storage Vault has been encrypted for the first time. Data is irrecoverable without the encryption key.' },
      { time: '2025-05-02 21:48:34', type: 'Info', message: 'Persisting Storage Vault status...' },
      { time: '2025-05-02 21:48:34', type: 'Info', message: 'Starting backup...' },
      { time: '2025-05-02 21:48:34', type: 'Info', message: 'Taking filesystem snapshot...' },
      { time: '2025-05-02 21:48:36', type: 'Info', message: 'This backup process can access protected files.' },
      { time: '2025-05-02 21:48:45', type: 'Info', message: 'Checking Storage Vault free space...' },
      // Add more sample logs up to 24 if needed for pagination example
    ];
  }

  // Placeholder methods for toolbar actions
  exportLogs(format: string): void {
    console.log(`Exporting logs as ${format}`);
    // TODO: Implement export logic
  }

  customizeLogView(): void {
    console.log('Customize Log View clicked');
    // TODO: Implement view customization logic
  }

  applyLogFilter(table: any, event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    table.filterGlobal(inputElement.value, 'contains');
  }
}
