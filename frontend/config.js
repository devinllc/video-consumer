// Configuration for API endpoints
window.API_CONFIG = {
    // Base URL - will be set by env.js
    BASE_URL: window.API_BASE_URL || '',

    // API Endpoints
    ENDPOINTS: {
        // Configuration
        CONFIG: '/api/config',
        TEST_CONNECTION: '/api/test-connection',
        TEST_S3: '/api/test-s3',
        HEALTH: '/health',
        CHECK_UPLOAD_READY: '/api/check-upload-ready',

        // Upload and Transcoding
        UPLOAD: '/api/upload',
        TRANSCODE: '/api/start-transcoding',

        // Jobs
        JOBS: '/api/jobs',
        JOB: '/api/jobs',
        IMPORT_JOBS: '/api/import-jobs',
        CREATE_TEST_JOB: '/api/create-test-job'
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

// Helper function to get API URL
window.getApiUrl = function (endpoint) {
    if (!window.API_CONFIG.BASE_URL) {
        return endpoint;
    }
    return window.API_CONFIG.BASE_URL + endpoint;
};

console.log('API configuration loaded for:', window.API_CONFIG.BASE_URL); 