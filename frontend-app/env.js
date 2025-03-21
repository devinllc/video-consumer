// Environment configuration
(function () {
    // Default API URL (local development)
    window.API_BASE_URL = 'http://localhost:3001';

    // Production URL when deployed
    if (window.location.hostname !== 'localhost') {
        // Using the actual deployed backend URL
        window.API_BASE_URL = 'https://video-consumer-backend.vercel.app';

        // Detect if we're in a development environment
        if (window.location.hostname.includes('vercel.app')) {
            // For preview deployments
            console.log('Running in Vercel preview environment');
        }
    }

    console.log('API Base URL:', window.API_BASE_URL);
})(); 
