// Environment configuration
(function () {
    // Default API URL (local development)
    window.API_BASE_URL = 'https://video-consumer-backend.vercel.app';

    // Production URL when deployed
    if (window.location.hostname !== 'localhost') {
        // Replace with your actual backend URL when deployed
        window.API_BASE_URL = 'https://your-backend-url.vercel.app';

        // Uncomment and edit the line below if you want to use the hostname-based approach
        // This is useful if your backend and frontend are on the same domain but different subdomains
        // window.API_BASE_URL = 'https://backend.' + window.location.hostname;
    }

    console.log('API Base URL:', window.API_BASE_URL);
})(); 
