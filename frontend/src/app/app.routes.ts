import { Routes } from '@angular/router';
import { LoginComponent } from './startingUI/login/login.component';
import { SignupComponent } from './startingUI/signup/signup.component';
import { OverviewComponent } from './startingUI/overview/overview.component';
import { LandingpageComponent } from './startingUI/landingpage/landingpage.component';
import { QuicksetupComponent } from './startingUI/quicksetup/quicksetup.component';
import { tenantGuard } from '../../src/app/core/guards/tenant.guard';
import { SetupWizardComponent } from './tenantUI/setup/setup.component';
import { setupRequiredGuard } from '../../src/app/core/guards/setup-required.guard';
import { authGuard } from '../../src/app/core/guards/auth.guards';

export const routes: Routes = [
  // Public routes (no tenant in URL)
  { title:'Whitecape Backup Service | Home ', path:'', component: LandingpageComponent, data: { animation: 'HomePage' } },
  { title:'Whitecape Backup Service | Signup' , path:'signup', component: SignupComponent, data: { animation: 'SignupPage' } },
  { title:'Whitecape Backup Service | Login' , path:'login', component: LoginComponent, data: { animation: 'LoginPage' } },
  { title:'Whitecape Backup Service | Overview' , path:'overview', component: OverviewComponent, data: { animation: 'OverviewPage' } },
  { title:'Whitecape Backup Service | Quick Setup' , path:'quicksetup', component: QuicksetupComponent, data: { animation: 'QuickSetupPage' } },
  
  // Tenant-specific routes (with tenant name in URL)
  { 
    path: ':tenantName', 
    canActivate: [tenantGuard, authGuard],
    children: [
      {
        path: 'setup',
        component: SetupWizardComponent
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./tenantUI/dashboard/dashboard.component')
          .then(m => m.DashboardComponent),
        canActivate: [setupRequiredGuard]
      },
      {
        path: 'users',
        loadComponent: () => import('./tenantUI/users/users.component')
          .then(m => m.UsersComponent),
        canActivate: [authGuard]
      },
      {
        path: 'suboverview',
        loadComponent: () => import('./subuserUI/suboverview/suboverview.component')
          .then(m => m.SuboverviewComponent),
        canActivate: [authGuard]
      },
      //{
       // path: 'settings',
       // loadComponent: () => import('../tenantUI/settings/settings.component')
         // .then(m => m.SettingsComponent),
       // canActivate: [authGuard]
     // },
      // Add other tenant routes here
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  
  // Fallback route
  { path: '**', redirectTo: '' }
];
