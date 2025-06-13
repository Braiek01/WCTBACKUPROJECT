import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, catchError, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TenantContextService {
  // Storage keys
  private readonly TENANT_DOMAIN_KEY = 'tenant_domain';
  private readonly TENANT_NAME_KEY = 'tenant_name';
  private readonly ACCESS_TOKEN_KEY = 'access_token';
  private readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private readonly BACKREST_SETUP_STATUS = 'backrest_setup_status';
  
  // Tenant methods
  getTenantDomain(): string | null { 
    return localStorage.getItem(this.TENANT_DOMAIN_KEY); 
  }
  
  getTenantName(): string | null { 
    return localStorage.getItem(this.TENANT_NAME_KEY); 
  }
  
  setTenantDomain(domain: string): void {
    localStorage.setItem(this.TENANT_DOMAIN_KEY, domain);
  }
  
  setTenantName(name: string): void {
    localStorage.setItem(this.TENANT_NAME_KEY, name);
  }
  
  // Authentication methods
  getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }
  
  setAccessToken(token: string): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, token);
  }
  
  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }
  
  setRefreshToken(token: string): void {
    localStorage.setItem(this.REFRESH_TOKEN_KEY, token);
  }
  
  clearTokens(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }
  
  clearTenantContext(): void {
    localStorage.removeItem(this.TENANT_DOMAIN_KEY);
    localStorage.removeItem(this.TENANT_NAME_KEY);
  }
  
  // REMOVE THIS ENTIRE METHOD - will use SetupService.forceCheckSetupStatus instead
  // forceCheckSetupStatus(): Observable<any> {
  //   console.log('Forcing backend check of setup status via TenantContextService');
  //   ...implementation...
  // }
  
  // Keep this helper method though, for SetupService to use
  clearSetupStatusCache(): void {
    localStorage.removeItem(this.BACKREST_SETUP_STATUS);
  }
}