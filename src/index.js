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

const app = express();

// Enable CORS for all routes
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json());

app.use(express.static('frontend'));

// Configure multer for video uploads
const upload = multer({
    storage: multer.diskStorage({
        destination: 'uploads/',
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
}
catch (error) {
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
    }
    catch (error) {
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
        
        // Initialize S3 client with force path style for custom endpoints
        const s3Client = new S3Client({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });
        
        // Upload to S3
        const key = `raw/${path.basename(file.filename)}`;
        console.log('Uploading to S3:', {
            bucket: config.S3_BUCKET_NAME,
            key: key
        });
        
        await s3Client.send(new PutObjectCommand({
            Bucket: config.S3_BUCKET_NAME,
            Key: key,
            Body: fs.createReadStream(file.path)
        }));
        
        console.log('Successfully uploaded to S3');
        
        // Clean up local file
        fs.unlinkSync(file.path);
        console.log('Cleaned up local file');
        
        // Start transcoding process
        const jobId = uuidv4();
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
        
        // Return the future HLS playlist URL and job ID
        const playlistUrl = `https://s3.${config.AWS_REGION}.amazonaws.com/${config.S3_BUCKET_NAME}/output/${path.basename(file.filename, path.extname(file.filename))}/master.m3u8`;
        
        res.json({
            success: true,
            message: 'Video uploaded successfully and transcoding started',
            key: key,
            jobId: jobId,
            playlistUrl
        });
    }
    catch (error) {
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

// Test AWS connectivity
app.get('/api/test-connection', async (_req, res) => {
    if (!config) {
        return res.status(400).json({ error: 'System not configured' });
    }
    
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
        
        // EC2 connection test for subnets and security groups
        console.log('Testing EC2 connection...');
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
        
        const securityGroups = config.ECS_SECURITY_GROUPS.split(',').map(sg => sg.trim());
        await ec2Client.send(new DescribeSecurityGroupsCommand({
            GroupIds: securityGroups
        }));
        
        res.json({
            success: true,
            message: 'AWS connection tests passed successfully'
        });
    }
    catch (error) {
        console.error('Connection test error:', error);
        res.status(500).json({
            error: 'AWS connection test failed',
            details: error.message
        });
    }
});

// Track active transcoding jobs
const activeJobs = new Map();

// Function to execute shell commands and return stdout as string
async function execCommand(command) {
    const { stdout } = await exec(command);
    return stdout?.toString() || '';
}

// Start the server
const PORT = parseInt(process.env.PORT || '3001', 10);

function startServer(port) {
    const server = app.listen(port)
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
        });
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
        // Get AWS account ID for task execution role
        const accountId = await getAwsAccountId();
        console.log(`Using user account ID: ${accountId}`);
        
        // Initialize ECS client
        const ecsClient = new ECSClient({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });
        
        // Prepare task definition
        const taskDefinition = config.ECS_TASK_DEFINITION;
        
        // Prepare subnets and security groups
        const subnets = config.ECS_SUBNETS.split(',').map(s => s.trim());
        const securityGroups = config.ECS_SECURITY_GROUPS.split(',').map(sg => sg.trim());
        
        // Determine CPU and memory based on performance level
        let cpu, memory;
        switch (performanceLevel) {
            case 'high':
                cpu = '2048';
                memory = '4096';
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
                        name: 'video-transcoder',
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
        
        // Start the task
        const runTaskResult = await ecsClient.send(new RunTaskCommand(params));
        
        if (runTaskResult.tasks.length === 0) {
            throw new Error(`Failed to start task: ${runTaskResult.failures[0]?.reason || 'Unknown error'}`);
        }
        
        const taskArn = runTaskResult.tasks[0].taskArn;
        console.log(`Started ECS task: ${taskArn}`);
        
        // Start monitoring the task
        monitorECSTask(jobId, taskArn);
        
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

startServer(PORT); 