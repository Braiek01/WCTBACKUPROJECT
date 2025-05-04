import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router'; // Import Router
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { MessageService } from 'primeng/api'; // Optional: For showing messages
import { ToastModule } from 'primeng/toast'; // Optional: For showing messages

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [
    CommonModule,
    InputGroupModule,
    CardModule,
    InputTextModule,
    PasswordModule,
    ButtonModule,
    DividerModule,
    InputGroupAddonModule,
    FormsModule,
    RouterLink,
    ToastModule // Optional: Add ToastModule
  ],
  providers: [], // Optional: Add MessageService provider
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css']
})
export class SignupComponent {
  username = '';
  email = '';
  password = '';
  confirmPassword = '';
  isLoading = false; // Optional: For loading indicator

  // Inject AuthService and Router
  constructor(

    private router: Router,
    private messageService: MessageService // Optional
  ) {}

  signUp(): void {
    this.isLoading = true;
    this.messageService.clear(); // Optional

    if (this.password !== this.confirmPassword) {
      this.isLoading = false;
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Passwords do not match.' });
      return;
    }

    // Prepare user data based on what your backend /api/register/ expects
    const userData = {
      username: this.username,
      email: this.email,
      password: this.password
      // Add other fields if your backend requires them (e.g., password2 for confirmation)
    };

   
  }

  signInWithGoogle(): void {
    console.log('Sign in with Google clicked');
    // TODO: Implement actual Google Sign-In logic here
  }
}
