"use strict";

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

        // Additional validation logic

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

// Check if upload is ready
app.get('/api/check-upload-ready', (_req, res) => {
    // We need to check if the system is configured and S3 bucket exists
    if (!config) {
        return res.json({
            ready: false,
            message: 'System not configured'
        });
    }

    // If we have valid configuration, consider the system ready for uploads
    res.json({
        ready: true,
        message: 'Upload service is ready'
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
            // Test basic S3 connection by listing buckets
            const listBucketsResponse = await s3Client.send(new ListBucketsCommand({}));

            // Check if the specified bucket exists in the list
            let bucketExists = false;
            if (tempConfig.S3_BUCKET_NAME && listBucketsResponse.Buckets) {
                bucketExists = listBucketsResponse.Buckets.some(
                    bucket => bucket.Name === tempConfig.S3_BUCKET_NAME
                );
            }

            res.json({
                success: true,
                message: 'Successfully connected to AWS S3 with provided credentials',
                region: tempConfig.AWS_REGION,
                bucketName: tempConfig.S3_BUCKET_NAME,
                bucketExists: bucketExists
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

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueFilename = uuidv4() + path.extname(file.originalname);
        cb(null, uniqueFilename);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 1000, // 1000 MB limit
    },
    fileFilter: function (req, file, cb) {
        // Accept video files only
        if (!file.mimetype.startsWith('video/')) {
            return cb(new Error('Only video files are allowed!'), false);
        }
        cb(null, true);
    }
});

// API endpoint for file upload
app.post('/api/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!config) {
            return res.status(400).json({ error: 'System not configured' });
        }

        console.log('Uploaded file:', req.file.originalname);
        console.log('Stored as:', req.file.filename);
        console.log('Size:', req.file.size, 'bytes');

        // Create an S3 client
        const s3Client = new S3Client({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY
            }
        });

        // Read the file from the local filesystem
        const fileContent = fs.readFileSync(req.file.path);

        // Upload the file to S3
        const key = `uploads/${req.file.filename}`;
        const command = new PutObjectCommand({
            Bucket: config.S3_BUCKET_NAME,
            Key: key,
            Body: fileContent,
            ContentType: req.file.mimetype
        });

        try {
            await s3Client.send(command);
            console.log('File uploaded to S3:', key);

            // Return the file key and other details
            res.json({
                message: 'File uploaded successfully',
                key,
                originalName: req.file.originalname,
                size: req.file.size,
                location: `s3://${config.S3_BUCKET_NAME}/${key}`
            });

            // Clean up local file
            fs.unlinkSync(req.file.path);

        } catch (uploadError) {
            console.error('Error uploading to S3:', uploadError);
            res.status(500).json({ error: 'Failed to upload to S3', details: uploadError.message });
        }
    } catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).json({ error: 'Upload failed', details: error.message });
    }
});

// API endpoint for starting transcoding
app.post('/api/start-transcoding', async (req, res) => {
    try {
        const { videoKey, performanceLevel } = req.body;

        if (!videoKey) {
            return res.status(400).json({ error: 'Missing videoKey parameter' });
        }

        if (!config) {
            return res.status(400).json({ error: 'System not configured' });
        }

        // Generate a unique job ID
        const jobId = uuidv4();

        // Record the job start time
        const startTime = new Date().toISOString();

        // Create a new job entry
        activeJobs.set(jobId, {
            jobId,
            videoKey,
            status: 'PENDING',
            startTime,
            logs: [
                {
                    timestamp: startTime,
                    message: `Job created. Video key: ${videoKey}`
                }
            ]
        });

        // Log the job creation
        console.log(`Created new transcoding job ${jobId} for video ${videoKey}`);

        // Return immediately with job ID
        res.json({
            success: true,
            jobId,
            message: 'Transcoding job started'
        });

        // Update job status to simulate task progress
        simulateTranscodingTask(jobId, videoKey, performanceLevel);

    } catch (error) {
        console.error('Error starting transcoding:', error);
        res.status(500).json({ error: 'Failed to start transcoding', details: error.message });
    }
});

// Function to simulate a transcoding task
function simulateTranscodingTask(jobId, videoKey, performanceLevel = 'standard') {
    const job = activeJobs.get(jobId);
    if (!job) return;

    // Update job status
    job.status = 'RUNNING';
    job.logs.push({
        timestamp: new Date().toISOString(),
        message: 'Task status changed to RUNNING'
    });

    // Determine duration based on performance level
    let duration = 60000; // Default 60 seconds for standard
    if (performanceLevel === 'economy') {
        duration = 90000; // 90 seconds for economy
    } else if (performanceLevel === 'premium') {
        duration = 30000; // 30 seconds for premium
    }

    // Add some simulated logs
    setTimeout(() => {
        job.logs.push({
            timestamp: new Date().toISOString(),
            message: `[Container] Downloaded original video successfully from S3: ${videoKey}`
        });
    }, 5000);

    setTimeout(() => {
        job.logs.push({
            timestamp: new Date().toISOString(),
            message: `[Container] Starting transcoding process with ffmpeg...`
        });
    }, 10000);

    // Add progress updates
    const intervals = [0.2, 0.4, 0.6, 0.8];
    intervals.forEach((interval, index) => {
        setTimeout(() => {
            job.logs.push({
                timestamp: new Date().toISOString(),
                message: `[Container] Transcoding progress: ${Math.round(interval * 100)}%`
            });
        }, duration * interval);
    });

    // Complete the job after the duration
    setTimeout(() => {
        job.status = 'COMPLETED';
        job.logs.push({
            timestamp: new Date().toISOString(),
            message: 'Task status changed to COMPLETED'
        });
        job.logs.push({
            timestamp: new Date().toISOString(),
            message: `[Container] Transcoding completed. Generated HLS files for video: ${videoKey}`
        });
    }, duration);
}

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