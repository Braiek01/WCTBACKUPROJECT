import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface Server {
  id: number;
  name: string;
  hostname: string;
  ip_address: string;
  status: string;
  backrest_port: number;
  // Add other properties as needed
}

@Injectable({
  providedIn: 'root'
})
export class ServerService {
  private apiService = inject(ApiService);

  /**
   * Get all servers for the current tenant
   */
  getServers(): Observable<Server[]> {
    return this.apiService.get<Server[]>('backrest/servers/');
  }

  /**
   * Get a specific server by ID
   */
  getServer(id: number): Observable<Server> {
    return this.apiService.get<Server>(`backrest/servers/${id}/`);
  }

  /**
   * Get active servers (those with "connected" or "active" status)
   */
  getActiveServers(): Observable<Server[]> {
    return this.apiService.get<Server[]>('backrest/servers/?status=connected,active,backrest_installed');
  }
}