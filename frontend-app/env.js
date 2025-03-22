// Environment configuration for video-consumer app
// For same-origin requests (frontend and backend on same server)
// const API_BASE_URL = '';  // Empty string means use the same origin

// IMPORTANT: We're using HTTP instead of HTTPS to avoid SSL errors
// Define on window object to ensure global availability
window.API_BASE_URL = 'http://13.235.75.73:3001';

// Previous configurations:
// window.API_BASE_URL = 'https://63e1-13-201-186-249.ngrok-free.app';
// window.API_BASE_URL = 'http://13.201.186.249:3001';
// window.API_BASE_URL = '';  // Empty string means use the same origin

// Don't modify below this line
console.log('Environment loaded:', window.API_BASE_URL || 'same origin'); 
