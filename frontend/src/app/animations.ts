import { trigger, transition, style, query, animate } from '@angular/animations';

export const routeFadeAnimation =
  trigger('routeAnimations', [
    transition('* <=> *', [ // Apply to all route transitions
      query(':enter', [ // Target the component being added
        style({ opacity: 0, transform: 'translateY(10px)' }) // Start transparent and slightly down
      ], { optional: true }),

      query(':enter', [
        animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })) // Fade in and move up
      ], { optional: true })
    ])
  ]);