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

        // Start the actual ECS task for transcoding
        startActualTranscoding(jobId, videoKey, performanceLevel);

    } catch (error) {
        console.error('Error starting transcoding:', error);
        res.status(500).json({ error: 'Failed to start transcoding', details: error.message });
    }
});

// Function to start the actual transcoding process using ECS
async function startActualTranscoding(jobId, videoKey, performanceLevel = 'standard') {
    const job = activeJobs.get(jobId);
    if (!job) return;

    try {
        // Update job status
        job.status = 'RUNNING';
        job.logs.push({
            timestamp: new Date().toISOString(),
            message: 'Task status changed to RUNNING'
        });

        // Initialize ECS client
        const ecsClient = new ECSClient({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY
            }
        });

        // Determine the task definition based on performance level
        let taskDefinition = config.ECS_TASK_DEFINITION;

        // Start ECS task
        const command = new RunTaskCommand({
            cluster: config.ECS_CLUSTER,
            taskDefinition: taskDefinition,
            launchType: 'FARGATE',
            networkConfiguration: {
                awsvpcConfiguration: {
                    subnets: config.ECS_SUBNETS.split(','),
                    securityGroups: config.ECS_SECURITY_GROUPS.split(','),
                    assignPublicIp: 'ENABLED'
                }
            },
            overrides: {
                containerOverrides: [{
                    name: 'video-transcoder',
                    environment: [
                        { name: 'AWS_ACCESS_KEY_ID', value: config.AWS_ACCESS_KEY_ID },
                        { name: 'AWS_SECRET_ACCESS_KEY', value: config.AWS_SECRET_ACCESS_KEY },
                        { name: 'AWS_REGION', value: config.AWS_REGION },
                        { name: 'BUCKET_NAME', value: config.S3_BUCKET_NAME },
                        { name: 'KEY', value: videoKey },
                        { name: 'PERFORMANCE_LEVEL', value: performanceLevel }
                    ]
                }]
            }
        });

        const response = await ecsClient.send(command);
        console.log('Started ECS task:', response);

        if (response.tasks && response.tasks.length > 0) {
            // Store the task ARN for monitoring
            job.taskArn = response.tasks[0].taskArn;
            job.logs.push({
                timestamp: new Date().toISOString(),
                message: `Started ECS task: ${job.taskArn}`
            });

            // Monitor the ECS task
            monitorEcsTask(jobId, job.taskArn);
        } else {
            // Handle case where no tasks were created
            job.status = 'FAILED';
            job.logs.push({
                timestamp: new Date().toISOString(),
                message: 'Failed to start ECS task: No tasks were created'
            });
            console.error('No tasks were created by ECS');
        }
    } catch (error) {
        console.error('Error starting ECS task:', error);
        job.status = 'FAILED';
        job.logs.push({
            timestamp: new Date().toISOString(),
            message: `Failed to start ECS task: ${error.message}`
        });
    }
}

// Function to monitor an ECS task
async function monitorEcsTask(jobId, taskArn) {
    const job = activeJobs.get(jobId);
    if (!job) return;

    try {
        // Initialize ECS client
        const ecsClient = new ECSClient({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY
            }
        });

        // Get task details
        const command = new DescribeTasksCommand({
            cluster: config.ECS_CLUSTER,
            tasks: [taskArn]
        });

        const response = await ecsClient.send(command);
        const task = response.tasks?.[0];

        if (task) {
            console.log(`Task ${taskArn} status:`, task.lastStatus);

            // Add log entry for status changes
            job.logs.push({
                timestamp: new Date().toISOString(),
                message: `Task status: ${task.lastStatus}`
            });

            // If there are task stopped reason, log it
            if (task.stoppedReason) {
                job.logs.push({
                    timestamp: new Date().toISOString(),
                    message: `Task stopped reason: ${task.stoppedReason}`
                });
            }

            // Log container status details
            task.containers?.forEach(container => {
                if (container.reason) {
                    job.logs.push({
                        timestamp: new Date().toISOString(),
                        message: `Container reason: ${container.reason}`
                    });
                }
            });

            if (task.lastStatus === 'STOPPED') {
                // Determine if task completed successfully or failed
                if (task.stopCode === 'EssentialContainerExited') {
                    const container = task.containers?.[0];
                    if (container?.exitCode === 0) {
                        job.status = 'COMPLETED';
                        job.logs.push({
                            timestamp: new Date().toISOString(),
                            message: 'Task status changed to COMPLETED'
                        });
                        console.log(`Job ${jobId} completed successfully`);
                    } else {
                        job.status = 'FAILED';
                        job.logs.push({
                            timestamp: new Date().toISOString(),
                            message: `Task failed with exit code ${container?.exitCode}`
                        });
                        console.log(`Job ${jobId} failed with exit code ${container?.exitCode}`);
                    }
                } else {
                    job.status = 'FAILED';
                    job.logs.push({
                        timestamp: new Date().toISOString(),
                        message: `Task failed with stop code ${task.stopCode}`
                    });
                    console.log(`Job ${jobId} failed with stop code ${task.stopCode}`);
                }
            } else if (task.lastStatus === 'RUNNING' ||
                task.lastStatus === 'PROVISIONING' ||
                task.lastStatus === 'PENDING') {
                // Continue monitoring for these states
                job.status = 'RUNNING';

                // Add progress information
                if (task.lastStatus === 'RUNNING') {
                    // Check if we already added information about the task running
                    if (!job.notifiedRunning) {
                        job.logs.push({
                            timestamp: new Date().toISOString(),
                            message: 'Task is now running and processing your video'
                        });
                        job.notifiedRunning = true;
                    }
                }

                // Check again in 15 seconds
                setTimeout(() => monitorEcsTask(jobId, taskArn), 15000);
            } else {
                console.log(`Task ${taskArn} in state:`, task.lastStatus);
                // Continue monitoring for any other state
                setTimeout(() => monitorEcsTask(jobId, taskArn), 15000);
            }
        } else {
            console.log(`Task ${taskArn} not found`);
            job.status = 'FAILED';
            job.logs.push({
                timestamp: new Date().toISOString(),
                message: 'Task not found. It may have been deleted or failed to start.'
            });
        }
    } catch (error) {
        console.error('Error monitoring ECS task:', error);
        // Don't mark the job as failed if we can't monitor it
        // It might still be running correctly
        job.logs.push({
            timestamp: new Date().toISOString(),
            message: `Error monitoring task: ${error.message}`
        });
        job.logs.push({
            timestamp: new Date().toISOString(),
            message: 'The task may still be running correctly. Please check your AWS ECS console.'
        });

        // Stop monitoring to prevent logs filled with the same error
    }
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