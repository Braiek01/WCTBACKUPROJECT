// filepath: c:\Users\defin\WCTPROJECTMVP6.0\frontend\src\environments\environment.development.ts
export const environment = {
  production: false,
  // Base URL for public APIs (login, signup)
  publicApiUrl: 'http://localhost:8000/api',
  // Base URL pattern for tenant APIs. Use a placeholder like '{tenant}'
  // We'll replace '{tenant}' with the actual tenant schema/domain later.
  tenantApiUrlPattern: 'http://{tenant}.localhost:8000/api'
  // For production, these would be your actual domain names
  // publicApiUrl: 'https://your-backend.com/api',
  // tenantApiUrlPattern: 'https://{tenant}.your-backend.com/api'
};