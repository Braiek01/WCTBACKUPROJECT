import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const role = authService.getUserRole()?.toLowerCase();
  
  if (role === 'admin' || role === 'owner') {
    return true;
  }
  
  // If user is logged in but not admin, redirect to subuser UI
  if (role) {
    const tenantName = authService.getTenantName();
    router.navigate(['/', tenantName, 'suboverview']);
    return false;
  }
  
  // Not logged in or no role, let auth guard handle it
  return true;
};

export const operatorGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const role = authService.getUserRole()?.toLowerCase();
  
  if (role === 'operator' || role === 'viewer') {
    return true;
  }
  
  // Admins can also view operator pages if needed
  if (role === 'admin' || role === 'owner') {
    return true;
  }
  
  return false;
};