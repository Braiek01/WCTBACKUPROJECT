import { Component } from '@angular/core';
import  { ButtonModule } from 'primeng/button';
import { FooterComponent } from '../../../components/footer/footer.component';
import { NavbarComponent } from "../../../components/navbar/navbar.component";

@Component({
  selector: 'app-overview',
  imports: [ButtonModule, FooterComponent, NavbarComponent],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css'
})
export class OverviewComponent {

}
