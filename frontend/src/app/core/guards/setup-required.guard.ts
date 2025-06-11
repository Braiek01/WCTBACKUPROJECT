import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { SetupService } from '../services/setup.service';

export const setupRequiredGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const setupService = inject(SetupService);
  
  const tenantName = authService.getTenantName();
  
  if (!tenantName) {
    return router.parseUrl('/login');
  }
  
  console.log(`Checking setup for tenant: ${tenantName}`);
  
  // FIRST CHECK LOCALSTORAGE - FOR QUICK RESPONSE
  const cachedStatus = localStorage.getItem('backrest_setup_status');
  let skipBackendCheck = false;
  
  if (cachedStatus) {
    try {
      const status = JSON.parse(cachedStatus);
      // If very recently set (less than 10 seconds ago), trust localStorage without API call
      if (status.timestamp && (Date.now() - status.timestamp) < 10000) {
        console.log('Using very recent cached setup status - skipping backend check');
        if (status.setupNeeded === false) {
          return true;
        } else {
          return router.parseUrl(`/${tenantName}/setup`);
        }
      }
    } catch (e) {
      console.error('Error parsing cached setup status:', e);
    }
  }
  
  // ALWAYS CHECK WITH BACKEND for definitive answer
  return setupService.checkSetupStatus(true).pipe(
    map(response => {
      console.log('Backend setup status check result:', response);
      if (response.setupNeeded === true) {
        console.log('Setup needed according to backend, redirecting to setup');
        return router.parseUrl(`/${tenantName}/setup`);
      }
      console.log('Setup not needed according to backend, proceeding to dashboard');
      return true;
    }),
    catchError(error => {
      console.error('Error checking setup status with backend:', error);
      // On error, fall back to localStorage if available
      if (cachedStatus) {
        try {
          const status = JSON.parse(cachedStatus);
          if (status.setupNeeded === false) {
            console.warn('Backend check failed, using cached status as fallback');
            return of(true);
          }
        } catch (e) {}
      }
      // If no usable cache, direct to setup
      console.warn('No reliable setup status, directing to setup page');
      return of(router.parseUrl(`/${tenantName}/setup`));
    })
  );
};