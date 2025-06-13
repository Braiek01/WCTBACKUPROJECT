import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class RoleRedirectService {
  private router = inject(Router);
  private authService = inject(AuthService);

  /**
   * Redirect the user based on their role in the tenant
   */
  redirectBasedOnRole() {
    console.log('Starting role-based redirection');
    
    // Get the tenant name first - this is essential for all redirects
    const tenantName = this.authService.getTenantName();
    if (!tenantName) {
      console.error('Cannot redirect: No tenant name available');
      this.router.navigate(['/login']);
      return;
    }

    // Get the user's role 
    const userRole = this.authService.getUserRole();
    console.log(`Redirecting user with role: ${userRole} in tenant: ${tenantName}`);

    // Determine target path based on role
    switch (userRole) {
      case 'owner':
      case 'admin':
        // For admins and owners, go to admin dashboard
        this.router.navigate([`/${tenantName}/dashboard`]);
        break;
      case 'operator':
        // For subusers, go to subuser overview
        this.router.navigate([`/${tenantName}/suboverview`]);
        break;
      default:
        console.warn(`Unknown role "${userRole}", redirecting to default dashboard`);
        // Default to dashboard for unknown roles
        this.router.navigate([`/${tenantName}/suboverview`]);
    }
  }
}