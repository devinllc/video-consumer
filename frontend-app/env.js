// Environment configuration for video-consumer app
// For same-origin requests (frontend and backend on same server)
const API_BASE_URL = '';  // Empty string means use the same origin

// Uncomment the line below when deploying to production with HTTPS:
// const API_BASE_URL = 'https://your-ec2-domain.com';

// Previous configurations:
// const API_BASE_URL = 'https://63e1-13-201-186-249.ngrok-free.app';
// const API_BASE_URL = 'http://13.235.75.73:3001';

// Don't modify below this line
console.log('Environment loaded:', API_BASE_URL || 'same origin'); 
