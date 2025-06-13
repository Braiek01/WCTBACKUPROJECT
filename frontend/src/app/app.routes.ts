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
import { DashboardComponent } from './tenantUI/dashboard/dashboard.component';
import { ReposComponent } from './tenantUI/repos/repos.component';
import { PlansComponent } from './tenantUI/plans/plans.component';
import { BackupsComponent } from './tenantUI/backup/backup.component';

import { RestoreComponent } from './tenantUI/restore/restore.component';
import { JobLogsComponent } from './tenantUI/joblogs/joblogs.component';
import { ProfileComponent } from './tenantUI/profile/profile.component';
import { AnalyticsComponent } from './tenantUI/analytics/analytics.component';


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
      // Tenant admin routes
      {
        path: 'setup',
        component: SetupWizardComponent
      },
      {
        path: 'dashboard',
        component: DashboardComponent,
        canActivate: [authGuard]
      },
      {
        path: 'users',
        loadComponent: () => import('./tenantUI/users/users.component')
          .then(m => m.UsersComponent),
        canActivate: [authGuard]
      },
      {
        path: 'users/:username',
        canActivate: [tenantGuard],
        loadComponent: () => import('./tenantUI/user-details/user-details.component')
          .then(c => c.UserDetailsComponent)
      },
      {
        path: 'repos',
        component: ReposComponent,
        canActivate: [authGuard]
      },
      {
        path: 'plans',
        component: PlansComponent,
        canActivate: [authGuard]
      },
      {
        path: 'backups',
        component: BackupsComponent,
        canActivate: [authGuard]
      },
      {
        path: 'restore',
        component: RestoreComponent,
        canActivate: [authGuard]
      },
      {
        path: 'job-logs',
        component: JobLogsComponent,
        canActivate: [authGuard]
      },
      {
        path: 'profile',
        component: ProfileComponent,
        canActivate: [authGuard]
      },
      {
        path: 'analytics',
        component: AnalyticsComponent,
        canActivate: [authGuard]
      },
      
      // SubUser routes
      {
        path: 'suboverview',
        loadComponent: () => import('./subuserUI/suboverview/suboverview.component')
          .then(m => m.SuboverviewComponent),
        canActivate: [authGuard]
      },
      {
        path: 'subbackup',
        loadComponent: () => import('./subuserUI/subbackup/subbackup.component')
          .then(m => m.SubbackupComponent),
        canActivate: [authGuard]
      },
      {
        path: 'subrestore',
        loadComponent: () => import('./subuserUI/subrestore/subrestore.component')
          .then(m => m.SubrestoreComponent),
        canActivate: [authGuard]
      },
      {
        path: 'subjob-logs',
        loadComponent: () => import('./subuserUI/subjoblogs/subjoblogs.component')
          .then(m => m.SubjoblogsComponent),
        canActivate: [authGuard]
      },
      {
        path: 'subuser-profile',
          loadComponent: () => import('./subuserUI/subuser-profile/subuser-profile.component').then(m => m.SubuserProfileComponent),
        canActivate: [authGuard]      },
      
      // Default route
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  
  // Fallback route
  { path: '**', redirectTo: '' }
];
