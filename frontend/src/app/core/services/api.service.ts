// filepath: c:\Users\defin\WCTPROJECTMVP6.0\frontend\src\app\core\services\api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
// Remove AuthService import
// import { AuthService } from './auth.service';
import { TenantContextService } from './tenant-context.service';
import { environment } from '../../../../environment/environment.devlopment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private tenantContext = inject(TenantContextService); // Only this dependency

  // Use TenantContextService for all tenant and auth info
  private getTenantApiUrl(): string {
    const tenantDomain = this.tenantContext.getTenantDomain();
    if (!tenantDomain) {
      console.error("ApiService: Cannot get tenant API URL, tenant domain is missing!");
      return 'error-tenant-domain-missing/api/';
    }
    const protocol = 'http';
    const port = '8000';
    const basePath = '/api/';
    const apiUrl = `${protocol}://${tenantDomain}:${port}${basePath}`;
    return apiUrl;
  }

  private getAuthHeaders(): HttpHeaders {
    // Use TenantContextService to get access token
    const token = this.tenantContext.getAccessToken();
    if (!token) {
      console.warn("ApiService: No access token found for auth headers.");
      return new HttpHeaders();
    }
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  get<T>(path: string, params: HttpParams = new HttpParams()): Observable<T> {
    const apiUrl = this.getTenantApiUrl();
    const fullPath = `${apiUrl}${path}`;
    console.log(`ApiService: GET request to: ${fullPath} with params:`, params.toString());
    return this.http.get<T>(fullPath, { headers: this.getAuthHeaders(), params }).pipe(
      catchError(this.handleError)
    );
  }

  post<T>(path: string, body: object = {}): Observable<T> {
    const apiUrl = this.getTenantApiUrl();
    const fullPath = `${apiUrl}${path}`;
    console.log(`ApiService: POST request to: ${fullPath} with body:`, body);
    return this.http.post<T>(fullPath, body, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError)
    );
  }

  // --- ADD PUT METHOD ---
  put<T>(path: string, body: object = {}): Observable<T> {
    const apiUrl = this.getTenantApiUrl();
    const fullPath = `${apiUrl}${path}`;
    console.log(`ApiService: PUT request to: ${fullPath} with body:`, body);
    return this.http.put<T>(fullPath, body, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError)
    );
  }

  // --- ADD DELETE METHOD ---
  delete<T>(path: string): Observable<T> {
    const apiUrl = this.getTenantApiUrl();
    const fullPath = `${apiUrl}${path}`;
    console.log(`ApiService: DELETE request to: ${fullPath}`);
    return this.http.delete<T>(fullPath, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: any): Observable<never> {
    console.error('ApiService: An error occurred', error);
    
    // For setup_instance endpoint, log but don't throw to prevent setup interruption
    if (error.url && error.url.includes('setup_instance')) {
      console.warn('Setup instance API error - continuing anyway since installation likely succeeded');
      return throwError(() => ({
        success: false,
        error: error,
        message: 'API error, but continuing with setup',
        _continue: true // Special flag to indicate we should continue
      }));
    }
    
    return throwError(() => error);
  }
}