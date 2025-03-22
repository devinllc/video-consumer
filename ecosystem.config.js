module.exports = {
    apps: [
        {
            name: 'video-backend',
            script: 'dist/index.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
                PORT: 3001,
                CORS_ALLOW_ORIGIN: '*',
                AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE: '1'
            },
            // Optional merge logs with current timestamp
            time: true,
            // Restart after unexpected crashes
            max_restarts: 10,
            restart_delay: 5000
        }
    ]
};