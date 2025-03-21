// API Configuration
window.API_CONFIG = {
    // Base URL for API endpoints
    // Change this when deploying to production
    API_URL: window.API_BASE_URL || 'http://localhost:3001',

    // API endpoints
    ENDPOINTS: {
        UPLOAD: '/api/upload',
        TRANSCODE: '/api/start-transcoding',
        JOBS: '/api/jobs',
        CONFIG: '/api/config',
        TEST_CONNECTION: '/api/test-connection'
    },

    // Default performance levels
    PERFORMANCE_LEVELS: {
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
    }
};

// Helper function to get full API URL
window.getApiUrl = function (endpoint) {
    return window.API_CONFIG.API_URL + endpoint;
}; 