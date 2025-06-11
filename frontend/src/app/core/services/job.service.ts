// filepath: c:\Users\defin\WCTPROJECTMVP6.0\frontend\src\app\core\services\job.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environment/environment.devlopment';

export interface ActivityLogEntry {
  id: string;
  timestamp_iso: string;
  level: string;
  message: string;
  // other fields...
}

export interface CreateBackupJobData {
  name: string;
  target_hosts: string;
  playbook_path: string;
  backup_type: string;
  extra_vars: { [key: string]: string };
  publickey: string;
}

@Injectable({
  providedIn: 'root'
})
export class JobService {
  constructor(private http: HttpClient) {}
  
  // Fix the URL path - remove duplicate /api/
  getRecentActivity(limit: number = 10): Observable<ActivityLogEntry[]> {
    // Fix the URL to avoid duplicating /api/
    const url = `${environment.publicApiUrl}/jobs/recent/?limit=${limit}`;
    console.log('Getting recent activity from:', url);
    return this.http.get<ActivityLogEntry[]>(url);
  }
  
  // Fix URL for other methods too
  createBackupJob(jobData: CreateBackupJobData): Observable<{job_id: string}> {
    // Fix the URL to avoid duplicating /api/
    const url = `${environment.publicApiUrl}/jobs/`;
    console.log('Creating backup job at:', url);
    return this.http.post<{job_id: string}>(url, jobData);
  }
}