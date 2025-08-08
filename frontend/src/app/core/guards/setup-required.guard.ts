import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SetupService } from '../services/setup.service';
import { map, catchError, of } from 'rxjs';

export const setupRequiredGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const setupService = inject(SetupService);
  
  // Get tenant name from auth service
  const tenantName = authService.getTenantName();
  
  if (!tenantName) {
    return router.parseUrl('/login');
  }
  
  console.log(`Setup guard checking for tenant: ${tenantName}`);
  
  // Always clear cache to ensure fresh check
  setupService.clearSetupStatusCache();
  
  // Check with backend for setup status
  return setupService.forceCheckSetupStatus().pipe(
    map(response => {
      console.log('Setup guard check result:', response);
      
      if (response.setupNeeded === true) {
        console.log('Setup needed, redirecting to setup component');
        
        // Check if database migration is needed
        if (response.migrationNeeded) {
          // Redirect to a special migration error page or show a message
          return router.parseUrl(`/error/database-migration`);
        }
        
        // If we're already headed to setup, allow it
        if (state.url.includes(`/${tenantName}/setup`)) {
          return true;
        }
        
        // Otherwise redirect to setup
        return router.parseUrl(`/${tenantName}/setup`);
      }
      
      // Allow normal navigation
      return true;
    }),
    catchError(error => {
      console.error('Error in setup guard:', error);
      // On error, allow access to avoid locking users out
      return of(true);
    })
  );
};