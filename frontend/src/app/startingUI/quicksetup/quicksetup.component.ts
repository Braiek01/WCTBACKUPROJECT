import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { FooterComponent } from '../../../components/footer/footer.component';
import { NavbarComponent } from "../../../components/navbar/navbar.component";

@Component({
  selector: 'app-quicksetup',
  imports: [ButtonModule, FooterComponent, NavbarComponent],
  templateUrl: './quicksetup.component.html',
  styleUrl: './quicksetup.component.css'
})
export class QuicksetupComponent {

}
