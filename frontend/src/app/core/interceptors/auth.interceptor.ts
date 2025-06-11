// filepath: c:\Users\defin\WCTPROJECTMVP6.0\frontend\src\app\core\interceptors\auth.interceptor.ts
import { inject } from '@angular/core';
import { HttpEvent, HttpInterceptorFn, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service'; // Adjust path if needed
// No need to import environment here if only checking paths

// List of public URL paths that should NOT receive the Authorization header
const publicPaths = [
  '/api/token/',
  '/api/token/refresh/',
  '/api/tenants/signup/'
];

/**
 * Functional HTTP Interceptor to add Authorization header for non-public requests.
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {

  // Inject AuthService inside the function
  const authService = inject(AuthService);
  const token = authService.getAccessToken();

  // Check if the request URL path matches any of the public paths
  const isPublicPath = publicPaths.some(path => req.url.includes(path));

  console.log(`authInterceptor: Request URL: ${req.url}, Is Public: ${isPublicPath}, Token Exists: ${!!token}`); // Debug log

  // Only add the token if it exists AND the request is NOT for a public path
  if (token && !isPublicPath) {
    console.log(`authInterceptor: Adding token to request for ${req.url}`); // Debug log
    // Clone the request and add the authorization header
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    // Pass the cloned request instead of the original request to the next handle
    return next(authReq);
  } else {
     if (token && isPublicPath) {
        console.log(`authInterceptor: NOT adding token to public request for ${req.url}`); // Debug log
    } else if (!token) {
        console.log(`authInterceptor: No token found for request to ${req.url}`); // Debug log
    }
    // If no token or it's a public path, pass the original request
    return next(req);
  }
};