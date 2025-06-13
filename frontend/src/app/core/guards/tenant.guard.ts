import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const tenantGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  
  // Skip tenant guard for static assets like CSS map files
  if (state.url.includes('.map') || state.url.includes('.css') || state.url.includes('.js')) {
    console.log('Skipping tenant guard for static asset:', state.url);
    return true;
  }
  
  const urlTenant = route.params['tenantName'];
  console.log('tenantGuard running with URL tenant:', urlTenant);
  
  // Check if user is authenticated first
  if (!authService.isAuthenticated()) {
    console.log('User not authenticated - redirecting to login');
    router.navigate(['/login']);
    return false;
  }
  
  // Now check tenant
  const authenticatedTenant = authService.getTenantName();
  console.log('Authenticated tenant name:', authenticatedTenant);
  
  if (!authenticatedTenant) {
    console.log('No authenticated tenant name - redirecting to login');
    router.navigate(['/login']);
    return false;
  }
  
  // Check if URL tenant matches authenticated tenant
  if (urlTenant !== authenticatedTenant) {
    console.log('Tenant mismatch - redirecting to correct tenant');
    router.navigate(['/', authenticatedTenant, 'dashboard']);
    return false;
  }
  
  return true;
};