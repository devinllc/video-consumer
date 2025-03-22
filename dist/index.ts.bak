const { S3Client, PutObjectCommand, ListBucketsCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { ECSClient, RunTaskCommand, DescribeTasksCommand, DescribeClustersCommand, DescribeTaskDefinitionCommand } = require("@aws-sdk/client-ecs");
const { EC2Client, DescribeSubnetsCommand, DescribeSecurityGroupsCommand } = require("@aws-sdk/client-ec2");
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const serverless = require('serverless-http');

const app = express();

// Enable CORS for all routes
app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json());

// Serve static files from frontend-app directory
app.use(express.static('frontend-app'));

// Configure multer for video uploads
const upload = multer({
    storage: multer.diskStorage({
        destination: 'uploads/',
        filename: (_req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
            const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
            cb(null, uniqueName);
        }
    }),
    fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only video files are allowed'));
        }
    },
    limits: {
        fileSize: 1024 * 1024 * 500 // 500MB limit
    }
});

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

let config = null;

// Load configuration from file if it exists
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config = savedConfig;
        console.log('Loaded configuration from file');
    }
} catch (error) {
    console.error('Error loading configuration:', error);
}

// API endpoint to save configuration
app.post('/api/config', (req, res) => {
    try {
        const newConfig = req.body;

        // Validate required fields
        const requiredFields = [
            'AWS_REGION',
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'S3_BUCKET_NAME',
            'ECS_CLUSTER',
            'ECS_TASK_DEFINITION',
            'ECS_SUBNETS',
            'ECS_SECURITY_GROUPS'
        ];

        const missingFields = requiredFields.filter(field => !newConfig[field]);

        if (missingFields.length > 0) {
            return res.status(400).json({
                error: 'Missing required configuration fields',
                missingFields
            });
        }

        // Validate AWS region format
        if (!/^[a-z]{2}-[a-z]+-\d{1}$/.test(newConfig.AWS_REGION)) {
            return res.status(400).json({
                error: 'Invalid AWS region format',
                example: 'ap-south-1'
            });
        }

        // Validate subnet format
        const subnets = newConfig.ECS_SUBNETS.split(',');
        if (!subnets.every(subnet => subnet.trim().startsWith('subnet-'))) {
            return res.status(400).json({
                error: 'Invalid subnet format',
                example: 'subnet-xxx,subnet-yyy'
            });
        }

        // Validate security group format
        const securityGroups = newConfig.ECS_SECURITY_GROUPS.split(',');
        if (!securityGroups.every(sg => sg.trim().startsWith('sg-'))) {
            return res.status(400).json({
                error: 'Invalid security group format',
                example: 'sg-xxx,sg-yyy'
            });
        }

        config = newConfig;

        // Save config to a file for persistence
        fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));

        res.json({
            success: true,
            message: 'Configuration saved successfully'
        });
    } catch (error) {
        console.error('Error saving config:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

// API endpoint to check configuration
app.get('/api/config', (_req, res) => {
    if (!config) {
        return res.json({
            configured: false,
            message: 'System not configured. Please configure the system first.'
        });
    }

    // Return config without sensitive data
    const safeConfig = { ...config };
    delete safeConfig.AWS_SECRET_ACCESS_KEY;

    res.json({
        configured: true,
        config: safeConfig,
        message: 'System configured and ready'
    });
});

// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'Video processing service is running'
    });
});

// API endpoint for test connection (POST)
app.post('/api/test-connection', async (req, res) => {
    try {
        // Use the config from the request body temporarily
        const tempConfig = req.body;

        if (!tempConfig || !tempConfig.AWS_REGION || !tempConfig.AWS_ACCESS_KEY_ID || !tempConfig.AWS_SECRET_ACCESS_KEY) {
            return res.json({
                success: false,
                errors: ['Invalid configuration. Please provide AWS credentials.']
            });
        }

        console.log('Testing connection with provided credentials...');
        console.log('Region:', tempConfig.AWS_REGION);
        console.log('Access Key ID:', tempConfig.AWS_ACCESS_KEY_ID);
        console.log('S3 Bucket:', tempConfig.S3_BUCKET_NAME || 'Not provided');

        // Test S3 connection with provided credentials
        const s3Client = new S3Client({
            region: tempConfig.AWS_REGION,
            credentials: {
                accessKeyId: tempConfig.AWS_ACCESS_KEY_ID,
                secretAccessKey: tempConfig.AWS_SECRET_ACCESS_KEY,
            }
        });

        try {
            await s3Client.send(new ListBucketsCommand({}));

            res.json({
                success: true,
                message: 'Successfully connected to AWS S3 with provided credentials'
            });
        } catch (error) {
            console.error('Error testing S3 connection:', error);
            res.json({
                success: false,
                errors: [`Failed to connect to AWS S3: ${error.message}`]
            });
        }
    } catch (error) {
        console.error('Error in test-connection endpoint:', error);
        res.status(500).json({
            success: false,
            errors: [`Unexpected error: ${error.message}`]
        });
    }
});

// Track active jobs
const activeJobs = new Map();

// API endpoint to get job status and logs
app.get('/api/jobs/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = activeJobs.get(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
        jobId,
        status: job.status,
        startTime: job.startTime,
        videoKey: job.videoKey,
        logs: job.logs || []
    });
});

// API endpoint to list all jobs
app.get('/api/jobs', (_req, res) => {
    const jobs = Array.from(activeJobs.entries()).map(([jobId, job]) => ({
        jobId,
        status: job.status,
        startTime: job.startTime,
        videoKey: job.videoKey
    }));

    res.json(jobs);
});

// Start the server
const PORT = parseInt(process.env.PORT || '3001', 10);

function startServer(port) {
    const server = app.listen(port, '0.0.0.0')
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} is busy, trying ${port + 1}...`);
                server.close();
                startServer(port + 1);
            } else {
                console.error('Server error:', err);
            }
        })
        .on('listening', () => {
            console.log(`Server running on port ${port}`);
            if (process.env.EC2_PUBLIC_IP) {
                console.log(`Access the application at http://${process.env.EC2_PUBLIC_IP}:${port}`);
            }
        });
    return server;
}

// Export the Express app for local development
module.exports = app;

// Export the handler for serverless environments
module.exports.handler = serverless(app);

// Start the server if we're not in a serverless environment
if (process.env.NODE_ENV !== 'production') {
    startServer(PORT);
}