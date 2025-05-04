import { Component, Input } from '@angular/core'; // Import Input

import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [
    CommonModule,

  ],
  templateUrl: './loader.component.html',
  styleUrls: ['./loader.component.css']
})
export class LoaderComponent {
  @Input() visible: boolean = true; // Input to control visibility/fade
}
