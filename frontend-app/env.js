// Environment configuration for video-consumer app
// For same-origin requests (frontend and backend on same server)
// const API_BASE_URL = '';  // Empty string means use the same origin

// IMPORTANT: We're using HTTP instead of HTTPS to avoid SSL errors
// Define on window object to ensure global availability

// API Base URL Configuration
// Use the current server's hostname to build the API URL
// This automatically adapts to IP changes when EC2 instances restart
const hostname = window.location.hostname;
const port = '3001'; // The backend server port
window.API_BASE_URL = `http://${hostname}:${port}`;
console.log('API Base URL set to:', window.API_BASE_URL);

// For local development testing, uncommenting this line if needed:
// window.API_BASE_URL = 'http://localhost:3001';

// Previous configurations:
// window.API_BASE_URL = 'https://63e1-13-201-186-249.ngrok-free.app';
// window.API_BASE_URL = 'http://13.201.186.249:3001';
// window.API_BASE_URL = '';  // Empty string means use the same origin

// Don't modify below this line
console.log('Environment loaded:', window.API_BASE_URL || 'same origin'); 
