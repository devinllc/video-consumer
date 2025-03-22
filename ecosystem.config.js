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
                PORT: 3001
            },
            // Optional merge logs with current timestamp
            time: true
        }
    ]
}; 