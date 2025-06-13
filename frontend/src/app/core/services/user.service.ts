// filepath: c:\Users\defin\WCTPROJECTMVP6.0\frontend\src\app\core\services\user.service.ts
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service'; // Adjust path

// Define an interface for your User data based on Django serializer/model
export interface TenantUser {
  id: number;
  uuid: string;
  username: string | null; // Username might be null if using email login primarily
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  role_in_tenant: 'owner' | 'admin' | 'operator';
  // Add other fields from your UserSerializer
  // Example fields from users.component.html
  accountName?: string; // Map this if it corresponds to a backend field
  tenant?: number | string; // This might come from context, not user object itself
  onlineDevices?: number;
  devices?: number;
  emailAddress?: string; // Likely same as 'email'
  emailReports?: boolean | string; // Adjust type based on backend
  protectedItemsQuota?: string;
  storageVaultSize?: string; // Adjust type
  storageVaultQuota?: string; // Adjust type
  policy?: string;
}

// Interface for data needed to create a user (based on TenantUserCreateSerializer)
export interface CreateTenantUserData {
    username: string; // Required by backend API
    email?: string; // Optional
    first_name?: string;
    last_name?: string;
    password?: string; // Required
    role_in_tenant?: 'owner' | 'admin' | 'operator'; // Default is 'operator'
}

export interface SignupData {
    name: string; // Tenant name
    company_name?: string;
    username: string; // Owner username - NOW REQUIRED
    first_name?: string;
    last_name: string; // Owner last name
    email: string; // Owner email
    password: string; // Owner password
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiService = inject(ApiService);

  // Fetch users for the current tenant
  getUsers(): Observable<TenantUser[]> {
    // Corresponds to UserViewSet list endpoint ('/api/users/')
    return this.apiService.get<TenantUser[]>('users/sub-users/');
  }

  // Fetch a single user by ID/UUID for the current tenant
  getUser(id: number | string): Observable<TenantUser> {
     // Corresponds to UserViewSet retrieve endpoint ('/api/users/{id}/')
    return this.apiService.get<TenantUser>(`users/${id}`);
  }

  // Create a user within the current tenant
  createUser(userData: CreateTenantUserData): Observable<TenantUser> {
    // Corresponds to UserViewSet create endpoint ('/api/users/')
    console.log('UserService: createUser() called. Calling apiService.post("users", userData)');
    // *** Ensure the path is 'users', NOT 'users/create' ***
    return this.apiService.post<TenantUser>('users/create/', userData);
  }

  // Update a user within the current tenant
  updateUser(id: number | string, userData: Partial<TenantUser>): Observable<TenantUser> {
    // Corresponds to UserViewSet update endpoint ('/api/users/{id}/')
    // Note: Use Partial<> as you might only update some fields
    return this.apiService.put<TenantUser>(`users/${id}`, userData);
  }

  // Delete a user within the current tenant
  deleteUser(id: number | string): Observable<void> {
     // Corresponds to UserViewSet destroy endpoint ('/api/users/{id}/')
    return this.apiService.delete<void>(`users/${id}`);
  }
}