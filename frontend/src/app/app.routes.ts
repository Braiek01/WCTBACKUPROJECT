import { Routes } from '@angular/router';
import { LandingpageComponent } from './startingUI/landingpage/landingpage.component';
//import { SignupComponent } from './startingUI/signup/signup.component';
//import { LoginComponent } from './startingUI/login/login.component';
//import { DashboardComponent } from './startingUI/dashboard/dashboard.component';
//import { UsersComponent } from './admintenantuicomponents/users/users.component';
//import { UserDetailsComponent } from './admintenantuicomponents/user-details/user-details.component';

export const routes: Routes = [
    { title:'Whitecape Backup Service | Home ', path:'', component: LandingpageComponent, data: { animation: 'HomePage' } },
    //{ title:'Whitecape Backup Service | Signup' , path:'signup', component: SignupComponent, data: { animation: 'SignupPage' } },
    //{ title:'Whitecape Backup Service | Login' , path:'login', component: LoginComponent, data: { animation: 'LoginPage' } },
    //{
     // title:'Whitecape Backup Service | Dashboard',
      //path:'dashboard',
      //loadComponent: () => import('./startingUI/dashboard/dashboard.component').then(c => c.DashboardComponent),
      //data: { animation: 'DashboardPage' }
    //},
    //{ title:'Whitecape Backup Service | Users' , path:'users', component: UsersComponent, data: { animation: 'UsersPage' } },
    //{ path: 'users/:username', component: UserDetailsComponent, data: { animation: 'UserDetailsPage' } },
];
