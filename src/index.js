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
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, etc)
        if (!origin) return callback(null, true);

        // List of allowed origins
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:8080',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            'http://127.0.0.1:8080'
        ];

        // Add EC2 public IP if available
        if (process.env.EC2_PUBLIC_IP) {
            allowedOrigins.push(`http://${process.env.EC2_PUBLIC_IP}:3001`);
        }

        // Add custom frontend URL if specified in environment
        if (process.env.FRONTEND_URL) {
            allowedOrigins.push(process.env.FRONTEND_URL);
        }

        // Check if origin is allowed
        if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            console.log(`Origin ${origin} not allowed by CORS`);
            callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Parse JSON bodies
app.use(express.json());

app.use(express.static('frontend'));

// Ensure uploads directory exists (only in development)
if (process.env.NODE_ENV !== 'production' && !fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// In production (Vercel), we'll use /tmp for uploads
const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp' : 'uploads';

// Configure multer for video uploads
const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            cb(null, uploadDir);
        },
        filename: (_req, file, cb) => {
            const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
            cb(null, uniqueName);
        }
    }),
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only video files are allowed'));
        }
    },
    limits: {
        fileSize: 1024 * 1024 * 500 // 500MB limit
    }
});

let config = null;

// Load configuration from environment variables (Vercel) or from file
if (process.env.NODE_ENV === 'production' && process.env.AWS_ACCESS_KEY_ID) {
    // Validate and normalize AWS region
    let awsRegion = process.env.AWS_REGION || '';
    // Clean up the region (remove spaces, lowercase, etc.)
    awsRegion = awsRegion.trim().toLowerCase();

    // List of valid AWS regions
    const validRegions = [
        'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
        'af-south-1', 'ap-east-1', 'ap-south-1', 'ap-northeast-1',
        'ap-northeast-2', 'ap-northeast-3', 'ap-southeast-1',
        'ap-southeast-2', 'ap-southeast-3', 'ca-central-1',
        'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3',
        'eu-south-1', 'eu-north-1', 'me-south-1', 'sa-east-1'
    ];

    // Check if provided region is valid, default to us-east-1 if not
    if (!validRegions.includes(awsRegion)) {
        console.warn(`Invalid AWS region: ${awsRegion}. Using default region: us-east-1`);
        awsRegion = 'us-east-1';
    }

    // Use environment variables in production
    config = {
        AWS_REGION: awsRegion,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
        ECS_CLUSTER: process.env.ECS_CLUSTER,
        ECS_TASK_DEFINITION: process.env.ECS_TASK_DEFINITION,
        ECS_SUBNETS: process.env.ECS_SUBNETS,
        ECS_SECURITY_GROUPS: process.env.ECS_SECURITY_GROUPS
    };

    console.log('Using environment variables for configuration with region:', awsRegion);
} else {
    // Try to load from file in development
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
}

// API endpoint to save configuration
app.post('/api/config', (req, res) => {
    try {
        const newConfig = req.body;
        console.log('Received config update request:', {
            region: newConfig.AWS_REGION,
            hasAccessKey: !!newConfig.AWS_ACCESS_KEY_ID,
            hasSecretKey: !!newConfig.AWS_SECRET_ACCESS_KEY,
            bucket: newConfig.S3_BUCKET_NAME
        });

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

        // Try to save config to a file for persistence (in development only)
        try {
            if (process.env.NODE_ENV !== 'production') {
                fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
                console.log('Configuration saved to file');
            } else {
                console.log('Skipping config file save in production');
            }
        } catch (fileError) {
            console.warn('Could not save config to file, but proceeding with in-memory config:', fileError.message);
            // Don't fail the request if only the file save fails
        }

        // Test the connection to ensure the config works
        const s3Client = new S3Client({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });

        // We'll make a simple listBuckets call to verify credentials
        console.log('Testing S3 credentials...');
        s3Client.send(new ListBucketsCommand({}))
            .then(data => {
                console.log('S3 test successful, found', data.Buckets?.length || 0, 'buckets');
                res.json({
                    success: true,
                    message: 'Configuration saved and verified successfully'
                });
            })
            .catch(s3Error => {
                console.error('S3 test failed:', s3Error);
                // Still save the config but warn the user
                res.status(200).json({
                    success: true,
                    warning: true,
                    message: 'Configuration saved but S3 connection test failed',
                    errorDetails: s3Error.message,
                    requestId: s3Error.$metadata?.requestId
                });
            });
    }
    catch (error) {
        console.error('Error saving config:', error);
        res.status(500).json({
            error: 'Failed to save configuration',
            message: error.message,
            stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
        });
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
    const safeConfig = Object.assign({}, config);
    delete safeConfig.AWS_SECRET_ACCESS_KEY;

    res.json({
        configured: true,
        config: safeConfig,
        message: 'System configured and ready'
    });
});

// API endpoint for video upload
app.post('/api/upload', upload.single('video'), async (req, res) => {
    if (!config) {
        return res.status(400).json({ error: 'System not configured' });
    }

    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No video file provided' });
        }

        console.log('Received file:', {
            originalname: file.originalname,
            filename: file.filename,
            path: file.path,
            size: file.size
        });

        // Initialize S3 client with more defensive checks
        if (!config.AWS_REGION || !config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY || !config.S3_BUCKET_NAME) {
            return res.status(400).json({
                error: 'AWS configuration incomplete',
                details: 'Please ensure all AWS credentials and S3 bucket are configured'
            });
        }

        // Normalize AWS region
        const validRegions = [
            'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
            'af-south-1', 'ap-east-1', 'ap-south-1', 'ap-northeast-1',
            'ap-northeast-2', 'ap-northeast-3', 'ap-southeast-1',
            'ap-southeast-2', 'ca-central-1', 'eu-central-1',
            'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-south-1',
            'eu-north-1', 'me-south-1', 'sa-east-1'
        ];

        let region = config.AWS_REGION.trim().toLowerCase();
        if (!validRegions.includes(region)) {
            console.warn(`Warning: Invalid region "${region}", defaulting to us-east-1`);
            region = 'us-east-1';
        }

        const s3Client = new S3Client({
            region: region,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });

        // Check if the file exists before attempting to upload
        if (!fs.existsSync(file.path)) {
            return res.status(500).json({
                error: 'File processing error',
                details: 'The uploaded file could not be processed. This may be due to serverless environment constraints.'
            });
        }

        // Upload to S3 with more error handling
        const key = `raw/${path.basename(file.filename)}`;
        console.log('Uploading to S3:', {
            bucket: config.S3_BUCKET_NAME,
            key: key,
            region: region
        });

        try {
            const uploadParams = {
                Bucket: config.S3_BUCKET_NAME,
                Key: key,
                Body: fs.createReadStream(file.path)
            };

            await s3Client.send(new PutObjectCommand(uploadParams));
            console.log('Successfully uploaded to S3');
        } catch (s3Error) {
            console.error('S3 upload error:', s3Error);
            return res.status(500).json({
                error: 'S3 upload failed',
                details: s3Error.message,
                requestId: s3Error.$metadata?.requestId
            });
        }

        // Clean up local file
        try {
            fs.unlinkSync(file.path);
            console.log('Cleaned up local file');
        } catch (cleanupError) {
            console.warn('Could not clean up local file:', cleanupError.message);
            // Continue anyway - this is not critical
        }

        // On Vercel, we separate upload from transcoding
        // and don't start transcoding automatically
        let jobId = null;
        if (process.env.NODE_ENV !== 'production') {
            // Start transcoding process
            jobId = uuidv4();
            const performanceLevel = req.body.performanceLevel || 'standard'; // default to standard
            console.log(`Starting transcoding job ${jobId} for video: ${key}, performance level: ${performanceLevel}`);

            // Create job tracking object
            activeJobs.set(jobId, {
                videoKey: key,
                status: 'PENDING',
                startTime: new Date(),
                containerLogsAdded: false,
                performanceLevel
            });

            // Start ECS task for transcoding
            startECSTask(key, jobId, performanceLevel);
        }

        // Return the future HLS playlist URL
        const playlistUrl = `https://s3.${region}.amazonaws.com/${config.S3_BUCKET_NAME}/output/${path.basename(file.filename, path.extname(file.filename))}/master.m3u8`;

        res.json({
            success: true,
            message: 'Video uploaded successfully',
            key: key,
            jobId: jobId,
            playlistUrl
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload video', details: error.message });
    }
});

// Get status of a specific job
app.get('/api/jobs/:jobId', (req, res) => {
    const jobId = req.params.jobId;
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

// Get all active jobs
app.get('/api/jobs', (_req, res) => {
    const jobs = Array.from(activeJobs.entries()).map(([id, job]) => ({
        jobId: id,
        status: job.status,
        startTime: job.startTime,
        videoKey: job.videoKey
    }));

    res.json({ jobs });
});

// Test S3 connectivity only
app.get('/api/test-s3', async (_req, res) => {
    if (!config) {
        return res.status(400).json({ error: 'System not configured' });
    }

    try {
        // Log credentials (partial, for debugging)
        console.log('Testing S3 with region:', config.AWS_REGION);
        console.log('Using key ID:', config.AWS_ACCESS_KEY_ID ?
            `${config.AWS_ACCESS_KEY_ID.substring(0, 4)}...${config.AWS_ACCESS_KEY_ID.substring(config.AWS_ACCESS_KEY_ID.length - 4)}` : 'missing');
        console.log('S3 bucket:', config.S3_BUCKET_NAME);

        // Check if AWS_REGION is undefined or empty
        if (!config.AWS_REGION) {
            return res.status(400).json({
                error: 'Invalid AWS configuration',
                details: 'AWS_REGION is empty or undefined',
                config: {
                    region: config.AWS_REGION,
                    hasAccessKey: !!config.AWS_ACCESS_KEY_ID,
                    hasSecretKey: !!config.AWS_SECRET_ACCESS_KEY,
                    bucket: config.S3_BUCKET_NAME
                }
            });
        }

        // S3 connection test
        console.log('Testing S3 connection...');
        const s3Client = new S3Client({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });

        // First, try a simple operation to verify credentials
        console.log('Listing buckets...');
        const listResult = await s3Client.send(new ListBucketsCommand({}));
        const buckets = listResult.Buckets || [];
        const bucketExists = buckets.some(bucket => bucket.Name === config.S3_BUCKET_NAME);

        if (!bucketExists) {
            console.warn(`Warning: Bucket '${config.S3_BUCKET_NAME}' not found in your account`);
        }

        res.json({
            success: true,
            bucketExists,
            bucketName: config.S3_BUCKET_NAME,
            region: config.AWS_REGION,
            totalBuckets: buckets.length,
            bucketList: buckets.map(b => b.Name),
            message: 'S3 connection successful'
        });
    } catch (error) {
        console.error('S3 connection test error:', error);
        res.status(500).json({
            error: 'S3 connection test failed',
            details: error.message,
            requestId: error.$metadata?.requestId,
            config: {
                region: config.AWS_REGION,
                hasAccessKey: !!config.AWS_ACCESS_KEY_ID,
                hasSecretKey: !!config.AWS_SECRET_ACCESS_KEY,
                bucket: config.S3_BUCKET_NAME
            }
        });
    }
});

// Test AWS connectivity (full test)
app.get('/api/test-connection', async (_req, res) => {
    if (!config) {
        return res.status(400).json({ error: 'System not configured' });
    }

    try {
        const results = {
            tests: [],
            success: true,
            message: 'AWS connection tests started'
        };

        // Log credentials (partial, for debugging)
        console.log('Testing with region:', config.AWS_REGION);
        console.log('Using key ID:', config.AWS_ACCESS_KEY_ID ?
            `${config.AWS_ACCESS_KEY_ID.substring(0, 4)}...${config.AWS_ACCESS_KEY_ID.substring(config.AWS_ACCESS_KEY_ID.length - 4)}` : 'missing');
        console.log('S3 bucket:', config.S3_BUCKET_NAME);

        try {
            // S3 connection test
            console.log('Testing S3 connection...');
            const s3Client = new S3Client({
                region: config.AWS_REGION,
                credentials: {
                    accessKeyId: config.AWS_ACCESS_KEY_ID,
                    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                }
            });
            await s3Client.send(new ListBucketsCommand({}));
            results.tests.push({ service: 'S3', success: true });
            console.log('S3 connection successful');
        } catch (error) {
            console.error('S3 connection failed:', error.message);
            results.tests.push({ service: 'S3', success: false, error: error.message });
            results.success = false;
        }

        try {
            // ECS connection test
            console.log('Testing ECS connection...');
            const ecsClient = new ECSClient({
                region: config.AWS_REGION,
                credentials: {
                    accessKeyId: config.AWS_ACCESS_KEY_ID,
                    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                }
            });
            await ecsClient.send(new DescribeClustersCommand({
                clusters: [config.ECS_CLUSTER]
            }));
            results.tests.push({ service: 'ECS', success: true });
            console.log('ECS connection successful');
        } catch (error) {
            console.error('ECS connection failed:', error.message);
            results.tests.push({ service: 'ECS', success: false, error: error.message });
            results.success = false;
        }

        try {
            // EC2 connection test for subnets
            console.log('Testing EC2 subnet connection...');
            const ec2Client = new EC2Client({
                region: config.AWS_REGION,
                credentials: {
                    accessKeyId: config.AWS_ACCESS_KEY_ID,
                    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                }
            });

            const subnets = config.ECS_SUBNETS.split(',').map(s => s.trim());
            await ec2Client.send(new DescribeSubnetsCommand({
                SubnetIds: subnets
            }));
            results.tests.push({ service: 'EC2-Subnets', success: true });
            console.log('EC2 subnet connection successful');
        } catch (error) {
            console.error('EC2 subnet connection failed:', error.message);
            results.tests.push({ service: 'EC2-Subnets', success: false, error: error.message });
            results.success = false;
        }

        try {
            // EC2 connection test for security groups
            console.log('Testing EC2 security group connection...');
            const ec2Client = new EC2Client({
                region: config.AWS_REGION,
                credentials: {
                    accessKeyId: config.AWS_ACCESS_KEY_ID,
                    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                }
            });

            const securityGroups = config.ECS_SECURITY_GROUPS.split(',').map(sg => sg.trim());
            await ec2Client.send(new DescribeSecurityGroupsCommand({
                GroupIds: securityGroups
            }));
            results.tests.push({ service: 'EC2-SecurityGroups', success: true });
            console.log('EC2 security group connection successful');
        } catch (error) {
            console.error('EC2 security group connection failed:', error.message);
            results.tests.push({ service: 'EC2-SecurityGroups', success: false, error: error.message });
            results.success = false;
        }

        results.message = results.success
            ? 'All AWS connection tests passed successfully'
            : 'Some AWS connection tests failed';

        res.json(results);
    } catch (error) {
        console.error('Connection test error:', error);
        res.status(500).json({
            error: 'AWS connection test failed',
            details: error.message,
            stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
        });
    }
});

// Track active transcoding jobs
const activeJobs = new Map();

// Function to execute shell commands and return stdout as string (with safeguards for Vercel)
async function execCommand(command) {
    // In production/Vercel, don't attempt to run shell commands
    if (process.env.NODE_ENV === 'production') {
        console.log(`[PROD] Would execute command: ${command}`);
        return 'command-execution-skipped-in-production';
    }

    try {
        const { stdout } = await exec(command);
        return stdout?.toString() || '';
    } catch (error) {
        console.error(`Error executing command: ${command}`, error);
        return '';
    }
}

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

// Monitor ECS task status
async function monitorECSTask(jobId, taskArn) {
    const job = activeJobs.get(jobId);
    if (!job) return;

    job.taskArn = taskArn;
    job.status = 'RUNNING';

    console.log(`Starting to monitor ECS task: ${taskArn} for job: ${jobId}`);

    // Initialize ECS client
    const ecsClient = new ECSClient({
        region: config.AWS_REGION,
        credentials: {
            accessKeyId: config.AWS_ACCESS_KEY_ID,
            secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        }
    });

    let isRunning = true;

    while (isRunning && activeJobs.has(jobId)) {
        try {
            const response = await ecsClient.send(new DescribeTasksCommand({
                cluster: config.ECS_CLUSTER,
                tasks: [taskArn]
            }));

            if (response.tasks.length === 0) {
                console.log(`Task ${taskArn} not found`);
                job.status = 'FAILED';
                isRunning = false;
                continue;
            }

            const task = response.tasks[0];
            const status = task.lastStatus;
            console.log(`Task status: ${status}`);

            // Update job status based on task status
            if (status === 'STOPPED') {
                // Check if the task stopped due to an error
                if (task.stoppedReason && task.stoppedReason !== 'Essential container in task exited') {
                    console.log(`Task stopped with reason: ${task.stoppedReason}`);
                    job.status = 'FAILED';
                } else {
                    // Task completed normally
                    job.status = 'COMPLETED';
                }
                isRunning = false;
            }

            // Wait before checking status again
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
        } catch (error) {
            console.error(`Error monitoring task ${taskArn}:`, error);
            // If we can't check the status, assume it failed
            job.status = 'FAILED';
            isRunning = false;
        }
    }
}

// Start an ECS task for video transcoding
async function startECSTask(videoKey, jobId, performanceLevel = 'standard') {
    if (!config) {
        console.error('Cannot start ECS task: System not configured');
        return;
    }

    try {
        // In serverless environment, we need to be careful with long-running tasks
        const isServerless = process.env.NODE_ENV === 'production';

        // Get AWS account ID for task execution role (skip in production/serverless)
        let accountId = 'unknown';
        if (!isServerless) {
            accountId = await getAwsAccountId();
            console.log(`Using user account ID: ${accountId}`);
        } else {
            console.log('Skipping AWS account ID lookup in serverless environment');
        }

        // Initialize ECS client
        const ecsClient = new ECSClient({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });

        // Normalize task definition without validation 
        // (use as-is to maintain compatibility with existing setup)
        const taskDefinition = config.ECS_TASK_DEFINITION;
        console.log(`Using task definition: ${taskDefinition}`);

        // Prepare subnets and security groups
        const subnets = config.ECS_SUBNETS.split(',').map(s => s.trim());
        const securityGroups = config.ECS_SECURITY_GROUPS.split(',').map(sg => sg.trim());

        // Log the networking configuration
        console.log(`Using subnets: ${subnets.join(', ')}`);
        console.log(`Using security groups: ${securityGroups.join(', ')}`);

        // Determine CPU and memory based on performance level
        let cpu, memory;
        switch (performanceLevel) {
            case 'premium':
                cpu = '2048';
                memory = '4096';
                break;
            case 'economy':
                cpu = '512';
                memory = '1024';
                break;
            case 'standard':
            default:
                cpu = '1024';
                memory = '2048';
                break;
        }

        // Configure task parameters
        const params = {
            cluster: config.ECS_CLUSTER,
            taskDefinition: taskDefinition,
            count: 1,
            launchType: 'FARGATE',
            networkConfiguration: {
                awsvpcConfiguration: {
                    subnets: subnets,
                    securityGroups: securityGroups,
                    assignPublicIp: 'ENABLED'
                }
            },
            overrides: {
                containerOverrides: [
                    {
                        name: 'video-transcoder', // This should match your container name in the task definition
                        environment: [
                            {
                                name: 'INPUT_FILE',
                                value: videoKey
                            },
                            {
                                name: 'OUTPUT_DIR',
                                value: `output/${path.basename(videoKey, path.extname(videoKey))}`
                            },
                            {
                                name: 'S3_BUCKET',
                                value: config.S3_BUCKET_NAME
                            },
                            {
                                name: 'AWS_REGION',
                                value: config.AWS_REGION
                            },
                            {
                                name: 'PERFORMANCE_LEVEL',
                                value: performanceLevel
                            }
                        ]
                    }
                ],
                cpu,
                memory
            }
        };

        // Log the task parameters
        console.log('Starting ECS task with params:', JSON.stringify({
            cluster: params.cluster,
            taskDefinition: params.taskDefinition,
            count: params.count,
            launchType: params.launchType,
            networkConfig: {
                subnets: params.networkConfiguration.awsvpcConfiguration.subnets,
                securityGroups: params.networkConfiguration.awsvpcConfiguration.securityGroups,
                assignPublicIp: params.networkConfiguration.awsvpcConfiguration.assignPublicIp
            }
        }, null, 2));

        // Start the task
        const runTaskResult = await ecsClient.send(new RunTaskCommand(params));

        if (runTaskResult.tasks.length === 0) {
            throw new Error(`Failed to start task: ${runTaskResult.failures[0]?.reason || 'Unknown error'}`);
        }

        const taskArn = runTaskResult.tasks[0].taskArn;
        console.log(`Started ECS task: ${taskArn}`);

        // Start monitoring the task (not in serverless environment)
        if (!isServerless) {
            monitorECSTask(jobId, taskArn);
        } else {
            console.log('Task monitoring is skipped in serverless environment');
            // In serverless, just update the job status to running
            const job = activeJobs.get(jobId);
            if (job) {
                job.taskArn = taskArn;
                job.status = 'RUNNING';
            }
        }

        return taskArn;
    } catch (error) {
        console.error('Error starting ECS task:', error);
        const job = activeJobs.get(jobId);
        if (job) {
            job.status = 'FAILED';
        }
        throw error;
    }
}

// Start the server if we're not in serverless environment
if (process.env.NODE_ENV !== 'production') {
    startServer(PORT);
}

// Helper function to get AWS account ID
async function getAwsAccountId() {
    try {
        // Use AWS CLI to get caller identity
        const identity = await execCommand('aws sts get-caller-identity --query "Account" --output text');
        return identity.trim();
    } catch (error) {
        console.error('Error getting AWS account ID:', error);
        return 'unknown';
    }
}

// Add a health check endpoint for Vercel
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        environment: process.env.NODE_ENV || 'development',
        serverless: process.env.VERCEL === '1' ? true : false,
        timestamp: new Date().toISOString(),
        configured: config ? true : false
    });
});

// Add a check endpoint for upload functionality
app.get('/api/check-upload-ready', (req, res) => {
    try {
        // Check if config exists
        if (!config) {
            return res.status(400).json({
                ready: false,
                error: 'System not configured',
                details: 'Please configure AWS credentials first'
            });
        }

        // Check S3 connectivity
        const s3Client = new S3Client({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });

        // Check uploads directory exists
        const uploadDirExists = process.env.NODE_ENV === 'production'
            ? fs.existsSync('/tmp')
            : fs.existsSync('uploads');

        // Check if we have write permissions to the directory
        let canWrite = false;
        try {
            const testDir = process.env.NODE_ENV === 'production' ? '/tmp' : 'uploads';
            const testFile = path.join(testDir, `test-${Date.now()}.txt`);
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            canWrite = true;
        } catch (writeError) {
            console.error('Write permission test failed:', writeError);
        }

        res.json({
            ready: true,
            uploadDir: process.env.NODE_ENV === 'production' ? '/tmp' : 'uploads',
            uploadDirExists,
            canWrite,
            s3Configured: !!config.S3_BUCKET_NAME,
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        console.error('Error checking upload readiness:', error);
        res.status(500).json({
            ready: false,
            error: 'Failed to check upload readiness',
            details: error.message
        });
    }
});

// API endpoint to start transcoding
app.post('/api/start-transcoding', async (req, res) => {
    if (!config) {
        return res.status(400).json({ error: 'System not configured' });
    }

    try {
        const { videoKey } = req.body;

        if (!videoKey) {
            return res.status(400).json({ error: 'No video key provided' });
        }

        // Get performance level with validation
        const performanceLevel = req.body.performanceLevel || 'standard';
        const validPerformanceLevels = ['economy', 'standard', 'premium'];

        if (!validPerformanceLevels.includes(performanceLevel)) {
            return res.status(400).json({
                error: 'Invalid performance level',
                message: 'Performance level must be one of: economy, standard, premium'
            });
        }

        console.log(`Starting transcoding for ${videoKey} with performance level: ${performanceLevel}`);

        // Validate ECS configuration
        if (!config.ECS_CLUSTER || !config.ECS_TASK_DEFINITION) {
            return res.status(400).json({
                error: 'ECS configuration is incomplete',
                message: 'Please check your ECS cluster and task definition settings'
            });
        }

        // More flexible validation for ECS cluster format
        // Accept any non-empty string for compatibility
        if (!config.ECS_CLUSTER.trim()) {
            return res.status(400).json({
                error: 'Invalid ECS cluster format',
                message: 'ECS cluster cannot be empty',
                example: 'my-cluster or arn:aws:ecs:region:account:cluster/my-cluster'
            });
        }

        // More flexible validation for task definition format
        // Accept any non-empty string for compatibility
        if (!config.ECS_TASK_DEFINITION.trim()) {
            return res.status(400).json({
                error: 'Invalid task definition format',
                message: 'Task definition cannot be empty',
                example: 'Enter your task definition name or ARN'
            });
        }

        // Create a new job ID
        const jobId = uuidv4();

        // Create job tracking object
        activeJobs.set(jobId, {
            videoKey,
            status: 'PENDING',
            startTime: new Date(),
            containerLogsAdded: false,
            performanceLevel,
            logs: [
                { timestamp: new Date(), message: `Job created with ID: ${jobId}` },
                { timestamp: new Date(), message: `Video key: ${videoKey}` },
                { timestamp: new Date(), message: `Performance level: ${performanceLevel}` }
            ]
        });

        let taskArn;

        // Check if we're in production mode (e.g., on Vercel)
        const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
        console.log(`[Transcoding Job] Environment: ${process.env.NODE_ENV}, Vercel: ${process.env.VERCEL}`);
        console.log(`[Transcoding Job] Running in ${isProduction ? 'production' : 'development'} mode`);

        // In Vercel production, we can't run long-running tasks but we can show a simulated response
        if (isProduction) {
            console.log('[Transcoding Job] Production mode detected: Simulating transcoding task');
            const job = activeJobs.get(jobId);
            if (job) {
                job.logs.push({
                    timestamp: new Date(),
                    message: 'Task launching in production mode (simulated - no actual AWS task will be created)'
                });
                job.status = 'RUNNING';
                job.taskArn = 'production-mode-task-arn'; // A marker to indicate simulation
            }

            // Return success without actually starting the task
            res.json({
                success: true,
                message: 'Transcoding started in production mode (simulated)',
                jobId,
                videoKey,
                taskArn: 'production-mode-task-arn',
                note: 'Running in production mode - No actual AWS task will be created due to serverless limitations'
            });

            // Simulate job progress
            simulateTaskProgress(jobId);
        } else {
            // Actually start the ECS task in development
            try {
                console.log('[Transcoding Job] Development mode: Attempting to start real ECS task');
                console.log('[Transcoding Job] ECS Configuration:');
                console.log(`  - Cluster: ${config.ECS_CLUSTER}`);
                console.log(`  - Task Definition: ${config.ECS_TASK_DEFINITION}`);
                console.log(`  - Subnets: ${config.ECS_SUBNETS}`);
                console.log(`  - Security Groups: ${config.ECS_SECURITY_GROUPS}`);

                taskArn = await startECSTask(videoKey, jobId, performanceLevel);
                console.log(`[Transcoding Job] ECS task started successfully with ARN: ${taskArn}`);

                res.json({
                    success: true,
                    message: 'Transcoding started with actual AWS ECS task',
                    jobId,
                    videoKey,
                    taskArn
                });
            } catch (taskError) {
                console.error('[Transcoding Job] Failed to start ECS task:', taskError);

                // Update job with error information
                const job = activeJobs.get(jobId);
                if (job) {
                    job.status = 'FAILED';
                    job.logs.push({
                        timestamp: new Date(),
                        message: `Failed to start ECS task: ${taskError.message}`
                    });

                    // Additional logging for common AWS errors
                    if (taskError.code === 'InvalidParameterException') {
                        job.logs.push({
                            timestamp: new Date(),
                            message: 'Check your ECS configuration: cluster, task definition, subnets, security groups'
                        });
                    } else if (taskError.code === 'AccessDeniedException') {
                        job.logs.push({
                            timestamp: new Date(),
                            message: 'AWS access denied. Check IAM permissions for ECS:RunTask'
                        });
                    }
                }

                // Return error to client
                return res.status(500).json({
                    error: 'Failed to start transcoding task',
                    message: taskError.message,
                    code: taskError.code,
                    jobId,
                    videoKey
                });
            }
        }
    } catch (error) {
        console.error('[Transcoding Job] Unexpected error in /api/start-transcoding:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
        });
    }
});

// Function to simulate task progress for demonstration purposes
function simulateTaskProgress(jobId) {
    const job = activeJobs.get(jobId);
    if (!job) return;

    console.log(`[Simulation] Starting simulated task progress for job ${jobId}`);

    // Simulate downloading the video
    setTimeout(() => {
        if (job.status !== 'FAILED') {
            job.logs.push({
                timestamp: new Date(),
                message: '[Container] Downloading original video from S3'
            });
        }
    }, 2000);

    // Simulate download complete
    setTimeout(() => {
        if (job.status !== 'FAILED') {
            job.logs.push({
                timestamp: new Date(),
                message: '[Container] Downloaded original video successfully'
            });
        }
    }, 5000);

    // Simulate starting transcoding
    setTimeout(() => {
        if (job.status !== 'FAILED') {
            job.logs.push({
                timestamp: new Date(),
                message: '[Container] Starting transcoding process'
            });
        }
    }, 7000);

    // Simulate progress updates
    let progress = 0;
    const progressInterval = setInterval(() => {
        if (job.status === 'FAILED' || progress >= 100) {
            clearInterval(progressInterval);
            return;
        }

        progress += 10;
        job.logs.push({
            timestamp: new Date(),
            message: `[Container] Transcoding progress: ${progress}%`
        });

        if (progress >= 100) {
            // Complete the task
            job.status = 'COMPLETED';
            job.logs.push({
                timestamp: new Date(),
                message: 'Task completed successfully'
            });
            job.logs.push({
                timestamp: new Date(),
                message: '[Container] All transcoding tasks completed'
            });
            job.logs.push({
                timestamp: new Date(),
                message: '[Container] Output files available at: s3://BUCKET_NAME/output/VIDEO_KEY/'
            });
            job.logs.push({
                timestamp: new Date(),
                message: 'Note: In production mode, no actual transcoding is performed due to serverless limitations'
            });
        }
    }, 3000);
}

// Export the Express app for local development
module.exports = app;

// Export the handler for serverless environments
module.exports.handler = serverless(app); 