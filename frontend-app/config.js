// API configuration
window.API_CONFIG = {
    // If API_BASE_URL is set in env.js, use that; otherwise fall back to current origin
    BASE_URL: typeof API_BASE_URL !== 'undefined' && API_BASE_URL !== '' ? API_BASE_URL : '',
    ENDPOINTS: {
        UPLOAD: '/api/upload',
        TRANSCODE: '/api/start-transcoding',
        CONFIG: '/api/config',
        JOBS: '/api/jobs',
        JOB: '/api/jobs',
        TEST_CONNECTION: '/api/test-connection',
        TEST_S3: '/api/test-s3',
        HEALTH: '/health'
    }
};

// Function to get the full API URL (handles both relative and absolute URLs)
window.getApiUrl = function (endpoint) {
    // If BASE_URL is empty, it's a same-origin request
    if (!window.API_CONFIG.BASE_URL) {
        return endpoint;
    }
    // Otherwise, combine BASE_URL with endpoint
    return window.API_CONFIG.BASE_URL + endpoint;
};

// Log the configuration
console.log('API Configuration loaded', window.API_CONFIG.BASE_URL ? 'with base URL' : 'using same origin');

// Default performance levels
window.API_CONFIG.PERFORMANCE_LEVELS = {
    ECONOMY: {
        name: 'economy',
        description: 'Economy mode uses fewer resources and costs less, but takes longer to process videos (5-10 min for a 5 min video).'
    },
    STANDARD: {
        name: 'standard',
        description: 'Standard mode balances performance and cost (2-5 min for a 5 min video).'
    },
    PREMIUM: {
        name: 'premium',
        description: 'Premium mode provides the fastest processing but at a higher cost (1-2 min for a 5 min video).'
    }
}; 