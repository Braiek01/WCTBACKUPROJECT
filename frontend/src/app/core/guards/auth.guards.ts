// filepath: c:\Users\defin\WCTPROJECTMVP6.0\frontend\src\app\core\guards\auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service'; // Adjust path
import { map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isLoggedIn$.pipe(
    take(1), // Take the current value and complete
    map(isLoggedIn => {
      if (isLoggedIn) {
        // *** ADDED CHECK for tenant domain ***
        const tenantDomain = authService.getCurrentTenantDomain();
        if (tenantDomain) {
          // Logged in AND has tenant context, allow access
          return true;
        } else {
          // Logged in but NO tenant context (e.g., login failed partially, storage cleared?)
          console.error("AuthGuard: Access denied. User is logged in but tenant domain is missing.");
          authService.logout(); // Log out to reset state
          // No need to navigate here, logout() already redirects to login
          return false;
        }
      } else {
        // Not logged in, redirect to login page, preserving the intended URL
        console.log('AuthGuard: Access denied. User not logged in. Redirecting to login.');
        router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
        return false;
      }
    })
  );
};