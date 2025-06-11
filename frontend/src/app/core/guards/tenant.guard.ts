import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const tenantGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  // Skip tenant guard for static assets like CSS map files
  if (state.url.includes('.map') || state.url.includes('.css') || state.url.includes('.js')) {
    console.log('Skipping tenant guard for static asset:', state.url);
    return true;
  }
  
  // Get tenant name from URL
  const tenantNameFromUrl = route.paramMap.get('tenantName');
  
  console.log('tenantGuard running with URL tenant:', tenantNameFromUrl);
  
  // Get tenant name from auth service
  const authenticatedTenantName = authService.getTenantName();
  console.log('Authenticated tenant name:', authenticatedTenantName);
  
  if (!authenticatedTenantName) {
    console.error('No authenticated tenant name - redirecting to login');
    
    // Don't redirect to login for the login page itself
    if (state.url.includes('/login')) {
      return true;
    }
    
    router.navigate(['/login']);
    return false;
  }
  
  // Check if URL tenant matches authenticated tenant
  if (tenantNameFromUrl !== authenticatedTenantName) {
    console.log(`Tenant mismatch: URL has "${tenantNameFromUrl}" but authenticated tenant is "${authenticatedTenantName}"`);
    
    // FIXED: Add protection against infinite loop
    // If we're already in a redirection loop, just allow the navigation
    if (state.url.includes(`/${authenticatedTenantName}/`)) {
      console.log('Already redirecting to correct tenant, allowing navigation');
      return true;
    }
    
    console.log('Redirecting to correct tenant URL:', `/${authenticatedTenantName}/dashboard`);
    router.navigate([`/${authenticatedTenantName}/dashboard`]);
    return false;
  }
  
  return true;
};