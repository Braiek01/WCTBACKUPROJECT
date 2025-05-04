import { Routes } from '@angular/router';
import { LandingpageComponent } from './startingUI/landingpage/landingpage.component';
import { SignupComponent } from './startingUI/signup/signup.component';
import { LoginComponent } from './startingUI/login/login.component';

import { UsersComponent } from './tenantUI/users/users.component';
import { UserDetailsComponent } from './tenantUI/user-details/user-details.component';

export const routes: Routes = [
    { title:'Whitecape Backup Service | Home ', path:'', component: LandingpageComponent, data: { animation: 'HomePage' } }, // Example
    { title:'Whitecape Backup Service | Signup' , path:'signup', component: SignupComponent, data: { animation: 'SignupPage' } }, // Example
    { title:'Whitecape Backup Service | Login' , path:'login', component: LoginComponent, data: { animation: 'LoginPage' } }, // Example
    {
      title:'Whitecape Backup Service | Dashboard',
      path:'dashboard',
      loadComponent: () => import('./startingUI/dashboard/dashboard.component').then(c => c.DashboardComponent),
      data: { animation: 'DashboardPage' } // Example
    },
    { title:'Whitecape Backup Service | Users' , path:'users', component: UsersComponent, data: { animation: 'UsersPage' } },
   
    { path: 'users/:username', component: UserDetailsComponent, data: { animation: 'UserDetailsPage' } },
];
