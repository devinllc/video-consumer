// API Base URL Configuration
// Use the current server's hostname to build the API URL
// This automatically adapts to IP changes when EC2 instances restart
const hostname = window.location.hostname;
const port = '3001'; // The backend server port
window.API_BASE_URL = `http://${hostname}:${port}`;
console.log('API Base URL set to:', window.API_BASE_URL);

// For local development testing, uncommenting this line if needed:
// window.API_BASE_URL = 'http://localhost:3001'; 