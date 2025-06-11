// filepath: c:\Users\defin\WCTPROJECTMVP6.0\frontend\src\app\core\services\auth.service.ts
import { Injectable, inject, PLATFORM_ID } from '@angular/core'; // Import PLATFORM_ID
import { isPlatformBrowser } from '@angular/common'; // Import isPlatformBrowser
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, catchError, throwError, map, of } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../../environment/environment.devlopment'; // Adjust path
// Import the new shared service instead
import { TenantContextService } from './tenant-context.service';
// Add this import
import { SetupService } from './setup.service';

// IMPORTANT: Remove this import to break the circular dependency
// import { SetupService } from './setup.service';

// Add user interface
export interface User {
  id?: number;
  username?: string;
  email?: string;
  role_in_tenant?: string;
  // Add other user properties as needed
}

export interface AuthResponse {
  access: string;
  refresh: string;
  tenant_domain?: string;
  user?: User;
}

export interface SignupData {
    name: string;
    company_name?: string;
    first_name?: string;
    last_name: string;
    email: string;
    password: string;
    // Add username here if your backend requires it for tenant signup
    // username?: string;
}

export interface SignupResponse {
    id: number;
    name: string;
    schema_name: string;
    domain: string;
}


@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID); // Inject PLATFORM_ID
  private tenantContext = inject(TenantContextService);
  // Add this line to inject SetupService
  private setupService = inject(SetupService);

  private readonly ACCESS_TOKEN_KEY = 'access_token';
  private readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private readonly TENANT_DOMAIN_KEY = 'tenant_domain';
  private readonly USER_INFO_KEY = 'user_info'; // New key for user info
  private readonly TENANT_NAME_KEY = 'tenant_name'; // New key for tenant name

  // Internal state for tokens/domain, initialized carefully
  private _accessToken: string | null = null;
  private _refreshToken: string | null = null;
  private _tenantDomain: string | null = null;
  private _tenantName: string | null = null; // New state for tenant name
  private _currentUser: User | null = null; // Add current user state

  // Use BehaviorSubject for broader compatibility or signals for newer Angular versions
  private loggedIn = new BehaviorSubject<boolean>(false); // Initialize as false, check on init
  isLoggedIn$ = this.loggedIn.asObservable(); // Observable for components

  // Store tenant domain
  private tenantDomain = new BehaviorSubject<string | null>(null); // Initialize as null
  tenantDomain$ = this.tenantDomain.asObservable(); // Observable if needed

  // Store tenant name
  private tenantName = new BehaviorSubject<string | null>(null); // Initialize as null
  tenantName$ = this.tenantName.asObservable(); // Observable if needed

  // Add user subject
  private currentUser = new BehaviorSubject<User | null>(null);
  currentUser$ = this.currentUser.asObservable();

  constructor() {
    // Load initial state only if in browser
    if (isPlatformBrowser(this.platformId)) {
      this._accessToken = localStorage.getItem(this.ACCESS_TOKEN_KEY);
      this._refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);
      this._tenantDomain = localStorage.getItem(this.TENANT_DOMAIN_KEY);
      
      // Load user info from storage
      const userJson = localStorage.getItem(this.USER_INFO_KEY);
      this._currentUser = userJson ? JSON.parse(userJson) : null;
      
      this.loggedIn.next(!!this._accessToken);
      this.tenantDomain.next(this._tenantDomain);
      this.currentUser.next(this._currentUser);
    }
  }

  // Helper to safely access localStorage
  private getItem(key: string): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem(key);
    }
    return null;
  }

  // Helper to safely set localStorage item
  private setItem(key: string, value: string): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(key, value);
    }
  }

  // Helper to safely remove localStorage item
  private removeItem(key: string): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(key);
    }
  }


  getAccessToken(): string | null {
    // Return internal state or check storage again if needed
    return this._accessToken ?? this.getItem(this.ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
     return this._refreshToken ?? this.getItem(this.REFRESH_TOKEN_KEY);
  }

  getCurrentTenantDomain(): string | null {
    return this._tenantDomain ?? this.getItem(this.TENANT_DOMAIN_KEY);
  }

  private hasToken(): boolean {
    // Check internal state first
    return !!this._accessToken || !!this.getItem(this.ACCESS_TOKEN_KEY);
  }

  private getTenantDomainFromStorage(): string | null {
     // Use the helper
     return this.getItem(this.TENANT_DOMAIN_KEY);
  }

  // Add method to get current user
  getCurrentUser(): User | null {
    // Return internal state or check storage again if needed
    if (this._currentUser) return this._currentUser;
    
    const userJson = this.getItem(this.USER_INFO_KEY);
    if (userJson) {
      try {
        this._currentUser = JSON.parse(userJson);
        return this._currentUser;
      } catch (e) {
        console.error('Error parsing user info from storage', e);
        return null;
      }
    }
    return null;
  }

  // Add a getter method for the tenant name
  getTenantName(): string | null {
    if (!this._tenantName) {
      this._tenantName = this.getItem(this.TENANT_NAME_KEY);
    }
    return this._tenantName;
  }

  login(credentials: { email: string; password: string }): Observable<AuthResponse> {
    const loginUrl = `${environment.publicApiUrl}/token/`;

    const payload = {
      email: credentials.email,
      password: credentials.password
    };

    return this.http.post<AuthResponse>(loginUrl, payload).pipe(
      tap((response) => {
        if (response.access && response.refresh) {
          // Store tokens using TenantContextService
          this.tenantContext.setAccessToken(response.access);
          this.tenantContext.setRefreshToken(response.refresh);
          this._accessToken = response.access;
          this._refreshToken = response.refresh;

          // Handle tenant domain and extract tenant name
          if (response.tenant_domain) {
            console.log('Setting tenant domain:', response.tenant_domain);
            this.tenantContext.setTenantDomain(response.tenant_domain);
            this._tenantDomain = response.tenant_domain;
            this.tenantDomain.next(response.tenant_domain);
            
            // Extract and store the tenant name
            const tenantName = response.tenant_domain.split('.')[0];
            console.log('Setting tenant name:', tenantName);
            this.tenantContext.setTenantName(tenantName);
            this._tenantName = tenantName;
            this.tenantName.next(tenantName);
            
            // Store user information
            if (response.user) {
              // Store complete user object
              this._currentUser = response.user;
              this.currentUser.next(response.user);
              this.setItem(this.USER_INFO_KEY, JSON.stringify(response.user));
              
              // Also store username separately for convenience
              if (response.user.username) {
                this.setItem('username', response.user.username);
              } else if (response.user.email) {
                // Fallback to email if no username
                this.setItem('username', response.user.email);
              }
              
              // Store role for redirection
              const userRole = response.user.role_in_tenant || 'unknown';
              this.setItem('user_role', userRole);
            }
          } else {
            console.error('Tenant domain missing in login response!');
            this.removeItem(this.TENANT_DOMAIN_KEY);
            this.removeItem(this.TENANT_NAME_KEY);
            this._tenantDomain = null;
            this._tenantName = null;
            this.tenantDomain.next(null);
            this.tenantName.next(null);
          }
          this.loggedIn.next(true); // Update login status

          // After successful login, force check setup status using the shared service
          this.checkSetupStatus();
        } else {
           console.error('Access or Refresh token missing in login response!');
           this.logout(); // Log out if tokens are invalid
        }
      }),
      catchError((error) => {
        console.error('Login failed:', error);
        this.logout(); // Ensure clean state on error
        return throwError(() => new Error('Login failed. Please check credentials.')); // Rethrow a user-friendly error
      })
    );
  }
  
  // Updated to use the shared service
  private checkSetupStatus(): void {
    // Use setTimeout to defer this call until after all services are initialized
    setTimeout(() => {
      // Call SetupService directly instead of through tenantContext
      this.setupService.forceCheckSetupStatus().subscribe({
        next: (status) => console.log('Setup status checked after login:', status),
        error: (err) => console.error('Failed to check setup status after login:', err)
      });
    }, 0);
  }

  // Signup method (using public API)
  signup(signupData: SignupData): Observable<SignupResponse> {
     const signupUrl = `${environment.publicApiUrl}/tenants/signup/`;
     return this.http.post<SignupResponse>(signupUrl, signupData);
     // Handle response/errors as needed in the component
  }


  logout(): Observable<boolean> {
    console.log('AuthService: logout called');
    
    // Log current state before removing
    console.log('Before logout - Access token exists:', !!this.getItem(this.ACCESS_TOKEN_KEY));
    console.log('Before logout - Username:', this.getItem('username'));
    
    // Clear data from TenantContextService
    this.tenantContext.clearTokens();
    this.tenantContext.clearTenantContext();
    
    // Also clear internal state
    this._accessToken = null;
    this._refreshToken = null;
    this._tenantDomain = null;
    this._tenantName = null;
    
    // Reset observables
    this.loggedIn.next(false);
    this.tenantDomain.next(null);
    this.tenantName.next(null);
    this.currentUser.next(null);
    
    return of(true);
  }
  isAuthenticated(): boolean {
    // Check if the user is authenticated based on the access token
    return !!this.getAccessToken();
  }
  getTenantDomain(): string | null {
    // Return the tenant domain from internal state or storage
    return this._tenantDomain ?? this.getTenantDomainFromStorage();
  }

  getUserRole(): string | null {
    // First try from the current user object
    const currentUser = this.getCurrentUser();
    if (currentUser?.role_in_tenant) {
      return currentUser.role_in_tenant;
    }
    
    // Fall back to localStorage if needed
    return localStorage.getItem('user_role');
  }

  getUsername(): string | null {
    // Get username from localStorage
    return this.getItem('username');
  }

  // Make sure this is called when setting the user after login
  private setCurrentUser(user: User | null): void {
    this.currentUser.next(user);
    if (user) {
      if (user.role_in_tenant) {
        localStorage.setItem('user_role', user.role_in_tenant);
      }
    }
  }
}