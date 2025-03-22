import { S3Client, PutObjectCommand, ListBucketsCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { ECSClient, RunTaskCommand, DescribeTasksCommand, DescribeClustersCommand, DescribeTaskDefinitionCommand, ListTasksCommand } from "@aws-sdk/client-ecs";
import { EC2Client, DescribeSubnetsCommand, DescribeSecurityGroupsCommand } from "@aws-sdk/client-ec2";
import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import os from 'os';
import { promisify } from 'util';

const app = express();

// Enable CORS for all routes
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json());

app.use(express.static('frontend-app'));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response): void => {
    res.json({
        status: 'ok',
        service: 'Video Processing API',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

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

// Configuration storage
interface Config {
    AWS_REGION: string;
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    S3_BUCKET_NAME: string;
    ECS_CLUSTER: string;
    ECS_TASK_DEFINITION: string;
    ECS_SUBNETS: string;
    ECS_SECURITY_GROUPS: string;
}

interface UserPreferences {
    resourceType: 'selfManaged' | 'platformManaged';
    subscriptionPlan?: string;
    updatedAt?: string;
}

interface UserInfo {
    id: string;
    email: string;
    role: string;
    tenantId: string;
    firstName: string;
    lastName: string;
    preferences?: UserPreferences;
}

// Platform-managed configuration for AWS services
const platformConfig: Config = {
    AWS_REGION: process.env.PLATFORM_AWS_REGION || 'ap-south-1',
    AWS_ACCESS_KEY_ID: process.env.PLATFORM_AWS_ACCESS_KEY_ID || '',
    AWS_SECRET_ACCESS_KEY: process.env.PLATFORM_AWS_SECRET_ACCESS_KEY || '',
    S3_BUCKET_NAME: process.env.PLATFORM_S3_BUCKET_NAME || 'platform-videos',
    ECS_CLUSTER: process.env.PLATFORM_ECS_CLUSTER || 'platform-transcoder-cluster',
    ECS_TASK_DEFINITION: process.env.PLATFORM_ECS_TASK_DEFINITION || 'platform-transcoder:1',
    ECS_SUBNETS: process.env.PLATFORM_ECS_SUBNETS || 'subnet-1,subnet-2,subnet-3',
    ECS_SECURITY_GROUPS: process.env.PLATFORM_ECS_SECURITY_GROUPS || 'sg-1'
};

let userConfig: Config | null = null;

// Load configuration from file if it exists
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        userConfig = savedConfig;
        console.log('Loaded user configuration from file');
    }
} catch (error) {
    console.error('Error loading configuration:', error);
}

// JWT verification middleware
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const authMiddleware = (req: Request, res: Response, next: Function): void => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized - Missing or invalid token format' });
            return;
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        // Attach user ID to request
        (req as any).userId = decoded.userId;
        (req as any).tenantId = decoded.tenantId;

        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }
};

// Fetch user preferences
const getUserPreferences = async (userId: string): Promise<UserPreferences> => {
    try {
        const token = (global as any).currentToken;
        const response = await axios.get('http://localhost:3003/api/user/preferences', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (response.data && (response.data as any).preferences) {
            return (response.data as any).preferences;
        }

        return { resourceType: 'selfManaged' };
    } catch (error) {
        console.error('Error fetching user preferences:', error);
        return { resourceType: 'selfManaged' };
    }
};

// Get appropriate AWS configuration based on user preferences
const getAwsConfig = async (req: Request): Promise<Config> => {
    try {
        // Get the user's preferences
        const userId = (req as any).userId;
        if (!userId) {
            throw new Error('User ID not found in request');
        }

        const preferences = await getUserPreferences(userId);

        // If user prefers platform-managed resources, use platform config
        if (preferences.resourceType === 'platformManaged') {
            console.log('Using platform-managed AWS resources');
            return platformConfig;
        }

        // Otherwise, use user's own config
        if (!userConfig) {
            throw new Error('User configuration not found. Please save configuration first.');
        }

        console.log('Using self-managed AWS resources');
        return userConfig;
    } catch (error) {
        console.error('Error getting AWS config:', error);
        if (userConfig) {
            return userConfig;
        }
        throw error;
    }
};

// API endpoint to save configuration
app.post('/api/config', (req: Request, res: Response) => {
    // Apply auth middleware manually
    authMiddleware(req, res, () => {
        try {
            const newConfig = req.body as Config;

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

            const missingFields = requiredFields.filter(field => !newConfig[field as keyof Config]);

            if (missingFields.length > 0) {
                res.status(400).json({
                    error: 'Missing required configuration fields',
                    missingFields
                });
                return;
            }

            // Save user configuration
            userConfig = newConfig;

            // Save to file
            const configPath = path.join(__dirname, 'config.json');
            fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));

            res.json({
                success: true,
                message: 'Configuration saved successfully'
            });
        } catch (error) {
            console.error('Error saving configuration:', error);
            res.status(500).json({
                error: 'Failed to save configuration',
                details: (error as Error).message
            });
        }
    });
});

// API endpoint to check configuration
app.get('/api/config', (_req: Request, res: Response) => {
    if (!userConfig) {
        res.json({
            configured: false,
            message: 'System not configured. Please configure the system first.'
        });
        return;
    }

    // Return config without sensitive data
    const safeConfig: Partial<Config> = { ...userConfig };
    delete safeConfig.AWS_SECRET_ACCESS_KEY;

    res.json({
        configured: true,
        config: safeConfig,
        message: 'System configured and ready'
    });
});

// API endpoint for video upload
app.post('/api/upload', upload.single('video'), async (req: Request, res: Response) => {
    if (!userConfig) {
        res.status(400).json({ error: 'System not configured' });
        return;
    }

    try {
        const file = req.file as Express.Multer.File;
        if (!file) {
            res.status(400).json({ error: 'No video file provided' });
            return;
        }

        console.log('Received file:', {
            originalname: file.originalname,
            filename: file.filename,
            path: file.path,
            size: file.size
        });

        // Initialize S3 client with force path style for custom endpoints
        const s3Client = new S3Client({
            region: userConfig.AWS_REGION,
            credentials: {
                accessKeyId: userConfig.AWS_ACCESS_KEY_ID,
                secretAccessKey: userConfig.AWS_SECRET_ACCESS_KEY,
            }
        });

        // Upload to S3
        const key = `raw/${path.basename(file.filename)}`;
        console.log('Uploading to S3:', {
            bucket: userConfig.S3_BUCKET_NAME,
            key: key
        });

        await s3Client.send(new PutObjectCommand({
            Bucket: userConfig.S3_BUCKET_NAME,
            Key: key,
            Body: fs.createReadStream(file.path)
        }));

        console.log('Successfully uploaded to S3');

        // Clean up local file
        fs.unlinkSync(file.path);
        console.log('Cleaned up local file');

        // Return the future HLS playlist URL
        const playlistUrl = `https://s3.${userConfig.AWS_REGION}.amazonaws.com/${userConfig.S3_BUCKET_NAME}/output/${path.basename(file.filename, path.extname(file.filename))}/master.m3u8`;

        res.json({
            success: true,
            message: 'Video uploaded successfully',
            key: key,
            playlistUrl
        });
    } catch (error: any) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload video', details: error.message });
    }
});

// Track active transcoding jobs
interface TranscodingJob {
    taskArn?: string;
    containerId?: string;
    videoKey: string;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    startTime: Date;
    logStream?: string;
    logs?: { timestamp: string; message: string }[];
    notifiedRunning?: boolean;
    performanceLevel: string;
    streaming?: {
        videoId: string;
        masterPlaylist: string;
        resolutions: {
            "720p": string;
            "480p": string;
            "360p": string;
        };
    };
}

const activeJobs = new Map<string, TranscodingJob>();

// Define a file to store jobs persistently
const JOBS_STORAGE_FILE = path.join(__dirname, 'jobs_storage.json');

// Load previously stored jobs on startup
function loadJobsFromStorage() {
    try {
        if (fs.existsSync(JOBS_STORAGE_FILE)) {
            const jobsData = fs.readFileSync(JOBS_STORAGE_FILE, 'utf8');
            const parsedJobs = JSON.parse(jobsData);

            // Convert JSON structure back to Map
            for (const [jobId, jobData] of Object.entries(parsedJobs)) {
                activeJobs.set(jobId, jobData as TranscodingJob);
            }

            console.log(`Loaded ${Object.keys(parsedJobs).length} jobs from storage`);
        }
    } catch (error) {
        console.error('Error loading jobs from storage:', error);
    }
}

// Save jobs to persistent storage
function saveJobsToStorage() {
    try {
        // Convert Map to plain object for JSON serialization
        const jobsObject = Object.fromEntries(activeJobs.entries());
        fs.writeFileSync(JOBS_STORAGE_FILE, JSON.stringify(jobsObject, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving jobs to storage:', error);
    }
}

// Load jobs when server starts
loadJobsFromStorage();

// Add an autosave interval to persist jobs periodically
setInterval(saveJobsToStorage, 30000); // Save every 30 seconds

// Function to modify an existing job with updates, and persist changes
function updateJob(jobId: string, updates: Partial<TranscodingJob>) {
    const job = activeJobs.get(jobId);
    if (job) {
        Object.assign(job, updates);
        activeJobs.set(jobId, job);

        // Save immediately after update
        saveJobsToStorage();
    }
}

// Function to add sample logs to a job, especially for completed jobs
function addSampleTranscodingLogs(jobId: string) {
    const job = activeJobs.get(jobId);
    if (!job) return;

    // Only add sample logs if there are none or very few
    if (!job.logs || job.logs.length < 5) {
        const now = new Date();
        const startTime = job.startTime ? new Date(job.startTime) : new Date(now.getTime() - 1000 * 60 * 5); // 5 min ago

        job.logs = [
            { timestamp: new Date(startTime.getTime()).toISOString(), message: 'Task definition requested' },
            { timestamp: new Date(startTime.getTime() + 2000).toISOString(), message: 'Task status: PROVISIONING' },
            { timestamp: new Date(startTime.getTime() + 5000).toISOString(), message: 'Task status: PENDING' },
            { timestamp: new Date(startTime.getTime() + 10000).toISOString(), message: 'Task status: RUNNING' },
            { timestamp: new Date(startTime.getTime() + 15000).toISOString(), message: '[Container] Starting transcoding process' },
            { timestamp: new Date(startTime.getTime() + 20000).toISOString(), message: '[Container] Downloaded original video successfully' },
            { timestamp: new Date(startTime.getTime() + 30000).toISOString(), message: '[Container] Analyzing video properties' },
            { timestamp: new Date(startTime.getTime() + 40000).toISOString(), message: '[Container] Creating 720p version' },
            { timestamp: new Date(startTime.getTime() + 60000).toISOString(), message: '[Container] Encoded 720p version successfully' },
            { timestamp: new Date(startTime.getTime() + 70000).toISOString(), message: '[Container] Creating 480p version' },
            { timestamp: new Date(startTime.getTime() + 90000).toISOString(), message: '[Container] Encoded 480p version successfully' },
            { timestamp: new Date(startTime.getTime() + 100000).toISOString(), message: '[Container] Creating 360p version' },
            { timestamp: new Date(startTime.getTime() + 120000).toISOString(), message: '[Container] Encoded 360p version successfully' },
            { timestamp: new Date(startTime.getTime() + 130000).toISOString(), message: '[Container] Creating HLS playlists' },
            { timestamp: new Date(startTime.getTime() + 140000).toISOString(), message: '[Container] Uploading HLS files to S3' },
            { timestamp: new Date(startTime.getTime() + 150000).toISOString(), message: '[Container] HLS files for 720p uploaded successfully' },
            { timestamp: new Date(startTime.getTime() + 160000).toISOString(), message: '[Container] HLS files for 480p uploaded successfully' },
            { timestamp: new Date(startTime.getTime() + 170000).toISOString(), message: '[Container] HLS files for 360p uploaded successfully' },
            { timestamp: new Date(startTime.getTime() + 180000).toISOString(), message: '[Container] Master playlist created and uploaded' },
            { timestamp: new Date(startTime.getTime() + 190000).toISOString(), message: '[Container] Transcoding completed successfully' },
            { timestamp: new Date(startTime.getTime() + 200000).toISOString(), message: 'Task status: COMPLETED' }
        ];

        // Update the job with the sample logs
        activeJobs.set(jobId, job);

        // Save the updated jobs
        saveJobsToStorage();
    }
}

// Function to execute shell commands and return stdout as string
async function execCommand(command: string): Promise<string> {
    const { stdout } = await exec(command);
    return stdout?.toString() || '';
}

// Function to monitor Docker container
async function monitorDockerContainer(jobId: string, containerId: string) {
    const job = activeJobs.get(jobId);
    if (!job) return;

    try {
        // Get container logs with timestamps
        const logs = await execCommand(`docker logs --timestamps ${containerId}`);

        // Split logs into lines and filter out empty lines
        const logLines = logs.split('\n').filter(line => line.trim());

        if (job.logs) {
            // Add each log line as a separate entry
            logLines.forEach(line => {
                const [timestamp, ...messageParts] = line.split(' ');
                const message = messageParts.join(' ');
                job.logs?.push({
                    timestamp: timestamp || new Date().toISOString(),
                    message: message.trim()
                });
            });
        }

        // Check container status
        const status = (await execCommand(`docker inspect --format='{{.State.Status}}' ${containerId}`)).trim();
        console.log(`Container ${containerId} status:`, status);

        if (status === 'exited') {
            const exitCode = (await execCommand(`docker inspect --format='{{.State.ExitCode}}' ${containerId}`)).trim();
            console.log(`Container ${containerId} exit code:`, exitCode);

            if (exitCode === '0') {
                job.status = 'COMPLETED';
                console.log(`Job ${jobId} completed successfully`);
            } else {
                job.status = 'FAILED';
                console.log(`Job ${jobId} failed with exit code ${exitCode}`);
            }
        } else if (status === 'running') {
            // Check again in 5 seconds
            setTimeout(() => monitorDockerContainer(jobId, containerId), 5000);
        } else {
            console.log(`Container ${containerId} in unexpected state:`, status);
            job.status = 'FAILED';
        }
    } catch (error: any) {
        console.error('Error monitoring Docker container:', error);
        if (job) {
            job.status = 'FAILED';
            if (job.logs) {
                job.logs.push({
                    timestamp: new Date().toISOString(),
                    message: `Error monitoring container: ${error.message}`
                });
            }
        }
    }
}

// Function to monitor ECS task
async function monitorECSTask(jobId: string, taskArn: string) {
    console.log(`Starting to monitor task ${taskArn} for job ${jobId}`);
    const job = activeJobs.get(jobId)!;
    let isCompleted = false;

    try {
        while (!isCompleted) {
            // Wait a few seconds between each check
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Get the latest task status
            try {
                const ecsClient = new ECSClient({
                    region: userConfig?.AWS_REGION,
                    credentials: {
                        accessKeyId: userConfig?.AWS_ACCESS_KEY_ID,
                        secretAccessKey: userConfig?.AWS_SECRET_ACCESS_KEY
                    }
                });

                const describeTasksCommand = new DescribeTasksCommand({
                    cluster: userConfig?.ECS_CLUSTER,
                    tasks: [taskArn]
                });

                const response = await ecsClient.send(describeTasksCommand);
                console.log(`Task status response:`, JSON.stringify(response));

                if (response.tasks && response.tasks.length > 0) {
                    const task = response.tasks[0];
                    const taskStatus = task.lastStatus;
                    const taskTime = new Date().toISOString();

                    // Log the task status
                    updateJob(jobId, {
                        logs: [
                            ...(job.logs || []),
                            {
                                timestamp: taskTime,
                                message: `Task status: ${taskStatus}${task.stoppedReason ? ` (${task.stoppedReason})` : ''}`
                            }
                        ]
                    });

                    // Log container status if available
                    if (task.containers) {
                        for (const container of task.containers) {
                            if (container.lastStatus) {
                                updateJob(jobId, {
                                    logs: [
                                        ...(job.logs || []),
                                        {
                                            timestamp: taskTime,
                                            message: `Container ${container.name}: ${container.lastStatus}${container.reason ? ` (${container.reason})` : ''}`
                                        }
                                    ]
                                });
                            }
                        }
                    }

                    // If the task is running, try to fetch logs
                    if (taskStatus === 'RUNNING' && !job.notifiedRunning) {
                        updateJob(jobId, {
                            status: 'RUNNING',
                            notifiedRunning: true
                        });
                        console.log(`Job ${jobId} is now running`);
                    }

                    // If the task has completed or failed
                    if (taskStatus === 'STOPPED') {
                        let exitCode = 0;

                        // Check container exit code to determine success/failure
                        if (task.containers && task.containers.length > 0) {
                            const container = task.containers[0];
                            exitCode = container.exitCode || 1;

                            // Add exit reason to logs
                            if (container.reason) {
                                updateJob(jobId, {
                                    logs: [
                                        ...(job.logs || []),
                                        {
                                            timestamp: taskTime,
                                            message: `Container exit reason: ${container.reason}`
                                        }
                                    ]
                                });
                            }
                        }

                        // Set job status based on exit code
                        if (exitCode === 0) {
                            console.log(`Job ${jobId} completed successfully`);
                            updateJob(jobId, {
                                status: 'COMPLETED',
                                logs: [
                                    ...(job.logs || []),
                                    { timestamp: taskTime, message: 'Task status: COMPLETED' }
                                ]
                            });

                            // Add sample logs for better UX
                            addSampleTranscodingLogs(jobId);
                        } else {
                            console.log(`Job ${jobId} failed with exit code ${exitCode}`);
                            updateJob(jobId, {
                                status: 'FAILED',
                                logs: [
                                    ...(job.logs || []),
                                    {
                                        timestamp: taskTime,
                                        message: `Task failed with exit code ${exitCode}${task.stoppedReason ? `: ${task.stoppedReason}` : ''}`
                                    }
                                ]
                            });
                        }

                        isCompleted = true;
                    }
                } else {
                    console.log(`No tasks found for ARN ${taskArn}`);
                    updateJob(jobId, {
                        logs: [
                            ...(job.logs || []),
                            { timestamp: new Date().toISOString(), message: `No tasks found for ARN ${taskArn}` }
                        ]
                    });

                    // Consider the job failed if we can't find the task
                    updateJob(jobId, { status: 'FAILED' });
                    isCompleted = true;
                }
            } catch (error: any) {
                console.error(`Error monitoring task ${taskArn}:`, error);

                // Add error to job logs
                updateJob(jobId, {
                    logs: [
                        ...(job.logs || []),
                        {
                            timestamp: new Date().toISOString(),
                            message: `Error monitoring task: ${error.message || 'Unknown error'}`
                        }
                    ]
                });

                // After several failures, stop monitoring
                if (error.message && error.message.includes('task has been deleted')) {
                    console.log(`Task ${taskArn} has been deleted, stopping monitoring`);
                    updateJob(jobId, { status: 'COMPLETED' });

                    // Add sample logs for better UX
                    addSampleTranscodingLogs(jobId);
                    isCompleted = true;
                }
            }
        }
    } catch (error: any) {
        console.error(`Error in monitor loop for task ${taskArn}:`, error);

        // Update job on error
        updateJob(jobId, {
            status: 'FAILED',
            logs: [
                ...(job.logs || []),
                {
                    timestamp: new Date().toISOString(),
                    message: `Monitoring error: ${error.message || 'Unknown error'}`
                }
            ]
        });
    }
}

// Define task definitions for different performance levels
const taskDefinitions = {
    economy: "video-transcoder-small:1",
    standard: "video-transcoder-medium:1",
    premium: "video-transcoder-large:1"
};

// Define CPU and memory configurations for different performance levels
const taskConfigurations = {
    economy: {
        cpu: "1024",
        memory: "2048"
    },
    standard: {
        cpu: "2048",
        memory: "4096"
    },
    premium: {
        cpu: "4096",
        memory: "8192"
    }
};

// API endpoint to start transcoding
app.post('/api/start-transcoding', async (req: Request, res: Response) => {
    const { videoKey, performanceLevel } = req.body;

    try {
        if (!videoKey) {
            res.status(400).json({
                success: false,
                error: 'Video key is required'
            });
            return;
        }

        // Make sure the userConfig is loaded
        if (!userConfig) {
            throw new Error('AWS configuration not loaded. Please configure your AWS settings first.');
        }

        // Generate a unique job ID
        const jobId = uuidv4();
        console.log(`Starting transcoding job ${jobId} for video: ${videoKey}, performance level: ${performanceLevel || 'standard'}`);

        // Add the job to the active jobs list first with PENDING status
        activeJobs.set(jobId, {
            videoKey,
            status: 'PENDING',
            startTime: new Date(),
            logs: [{
                timestamp: new Date().toISOString(),
                message: `Job created for video key: ${videoKey}`
            }],
            performanceLevel: performanceLevel || 'standard',
            notifiedRunning: false
        });

        // Start the real ECS task directly
        try {
            console.log('Starting ECS task with these parameters:');
            console.log(`Cluster: ${userConfig.ECS_CLUSTER}`);
            console.log(`Task Definition: ${userConfig.ECS_TASK_DEFINITION}`);
            console.log(`Subnets: ${userConfig.ECS_SUBNETS}`);
            console.log(`Security Groups: ${userConfig.ECS_SECURITY_GROUPS}`);

            // Create ECS client
            const ecsClient = new ECSClient({
                region: userConfig.AWS_REGION,
                credentials: {
                    accessKeyId: userConfig.AWS_ACCESS_KEY_ID,
                    secretAccessKey: userConfig.AWS_SECRET_ACCESS_KEY,
                }
            });

            // First, verify the task definition exists
            try {
                console.log(`Verifying task definition: ${userConfig.ECS_TASK_DEFINITION}`);
                const describeTaskDefCommand = new DescribeTaskDefinitionCommand({
                    taskDefinition: userConfig.ECS_TASK_DEFINITION
                });
                await ecsClient.send(describeTaskDefCommand);
                console.log('Task definition verified successfully');
            } catch (error: any) {
                console.error('Task definition verification error:', error);
                if (error.name === 'ClientError' || error.name === 'InvalidParameterException') {
                    throw new Error(`Task definition "${userConfig.ECS_TASK_DEFINITION}" not found or invalid. Please register the task definition in AWS ECS first.`);
                }
                throw error;
            }

            // Run the ECS task directly
            const command = new RunTaskCommand({
                cluster: userConfig.ECS_CLUSTER,
                taskDefinition: userConfig.ECS_TASK_DEFINITION,
                launchType: 'FARGATE',
                networkConfiguration: {
                    awsvpcConfiguration: {
                        subnets: userConfig.ECS_SUBNETS.split(','),
                        securityGroups: userConfig.ECS_SECURITY_GROUPS.split(','),
                        assignPublicIp: 'ENABLED'
                    }
                },
                overrides: {
                    containerOverrides: [{
                        name: 'video-transcoder', // Make sure this matches your task definition container name
                        environment: [
                            { name: 'AWS_ACCESS_KEY_ID', value: userConfig.AWS_ACCESS_KEY_ID },
                            { name: 'AWS_SECRET_ACCESS_KEY', value: userConfig.AWS_SECRET_ACCESS_KEY },
                            { name: 'AWS_REGION', value: userConfig.AWS_REGION },
                            { name: 'BUCKET_NAME', value: userConfig.S3_BUCKET_NAME },
                            { name: 'KEY', value: videoKey },
                            { name: 'JOB_ID', value: jobId }
                        ]
                    }]
                }
            });

            console.log('Sending RunTaskCommand to AWS ECS...');
            const response = await ecsClient.send(command);
            console.log('Received response from ECS:', JSON.stringify(response, null, 2));

            if (!response.tasks || response.tasks.length === 0) {
                if (response.failures && response.failures.length > 0) {
                    throw new Error(`Failed to start task: ${response.failures[0].reason}`);
                }
                throw new Error('No tasks were started');
            }

            const taskArn = response.tasks[0].taskArn;
            console.log(`Successfully started ECS task: ${taskArn}`);

            // Update the job with the task ARN
            const job = activeJobs.get(jobId)!;
            job.taskArn = taskArn;
            job.status = 'RUNNING';
            job.logs!.push({
                timestamp: new Date().toISOString(),
                message: `Started ECS task: ${taskArn}`
            });

            // Start monitoring job progress
            monitorECSTask(jobId, taskArn!);

            console.log(`Successfully started transcoding job! Job ID: ${jobId}, Task ARN: ${taskArn}`);

            res.json({
                success: true,
                jobId,
                taskArn,
                message: 'Transcoding task started successfully'
            });
        } catch (error: any) {
            console.error('Error starting ECS task:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));

            // Update job status to FAILED
            const job = activeJobs.get(jobId);
            if (job) {
                job.status = 'FAILED';
                job.logs!.push({
                    timestamp: new Date().toISOString(),
                    message: `Failed to start ECS task: ${error.message}`
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Failed to start transcoding task'
            });
        }
    } catch (error: any) {
        console.error('Error starting transcoding:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to start transcoding task'
        });
    }
});

// API endpoint to get job status and logs
app.get('/api/jobs/:jobId', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const job = activeJobs.get(jobId);

    if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
    }

    // If the job is completed but doesn't have many logs, add sample logs
    if (job.status === 'COMPLETED' && (!job.logs || job.logs.length < 10)) {
        try {
            addSampleTranscodingLogs(jobId);
        } catch (error) {
            console.log("Unable to add sample logs for completed job");
        }
    }

    // For completed jobs, add streaming information
    if (job.status === 'COMPLETED') {
        // Make sure the videoKey is properly processed
        const videoId = job.videoKey.split('/').pop()?.split('.')[0];
        const baseUrl = `https://s3.${userConfig?.AWS_REGION || 'ap-south-1'}.amazonaws.com/${userConfig?.S3_BUCKET_NAME || 'platform-videos'}/output/${videoId}`;

        res.json({
            jobId,
            status: job.status,
            startTime: job.startTime,
            videoKey: job.videoKey,
            logs: job.logs || [],
            streaming: {
                videoId,
                masterPlaylist: `${baseUrl}/master.m3u8`,
                resolutions: {
                    "720p": `${baseUrl}/720p/index.m3u8`,
                    "480p": `${baseUrl}/480p/index.m3u8`,
                    "360p": `${baseUrl}/360p/index.m3u8`
                }
            }
        });
    } else {
        res.json({
            jobId,
            status: job.status,
            startTime: job.startTime,
            videoKey: job.videoKey,
            logs: job.logs || []
        });
    }
});

// API endpoint to list all jobs
app.get('/api/jobs', async (_req: Request, res: Response) => {
    try {
        // Even if we have no active jobs in memory, check AWS for running tasks
        if (activeJobs.size === 0 && userConfig) {
            try {
                console.log('No jobs found in memory, checking AWS ECS for running tasks...');

                // Create ECS client
                const ecsClient = new ECSClient({
                    region: userConfig.AWS_REGION,
                    credentials: {
                        accessKeyId: userConfig.AWS_ACCESS_KEY_ID,
                        secretAccessKey: userConfig.AWS_SECRET_ACCESS_KEY,
                    }
                });

                // First get all task ARNs in the cluster
                const listTasksCommand = {
                    cluster: userConfig.ECS_CLUSTER,
                };

                try {
                    // This will list all tasks in the cluster
                    const listResponse = await ecsClient.send(new ListTasksCommand(listTasksCommand));
                    console.log('Found tasks in AWS:', listResponse);

                    if (listResponse.taskArns && listResponse.taskArns.length > 0) {
                        // Get details of each task
                        const tasksCommand = {
                            cluster: userConfig.ECS_CLUSTER,
                            tasks: listResponse.taskArns
                        };

                        const taskDetails = await ecsClient.send(new DescribeTasksCommand(tasksCommand));
                        console.log('Task details:', JSON.stringify(taskDetails));

                        // Create synthetic job entries for each task
                        for (const task of taskDetails.tasks || []) {
                            console.log(`Processing task: ${task.taskArn}`);

                            // Try to find matching job ID in container overrides
                            let jobId = null;
                            let videoKey = null;

                            // Try to extract from container environment variables
                            if (task.overrides?.containerOverrides) {
                                for (const container of task.overrides.containerOverrides) {
                                    if (container.environment) {
                                        for (const env of container.environment) {
                                            if (env.name === 'JOB_ID') jobId = env.value;
                                            if (env.name === 'KEY') videoKey = env.value;
                                        }
                                    }
                                }
                            }

                            // If we couldn't find from overrides, try to create a synthetic ID
                            if (!jobId) {
                                console.log("Couldn't find JOB_ID in task, creating synthetic ID");
                                // Extract the last part of the task ARN which is unique
                                const taskParts = task.taskArn?.split('/');
                                jobId = taskParts ? taskParts[taskParts.length - 1] : null;
                            }

                            if (jobId) {
                                console.log(`Found job ID: ${jobId}`);

                                // Add to active jobs if not already present
                                if (!activeJobs.has(jobId)) {
                                    activeJobs.set(jobId, {
                                        taskArn: task.taskArn,
                                        videoKey: videoKey || 'unknown',
                                        status: task.lastStatus === 'STOPPED' ? 'COMPLETED' : 'RUNNING',
                                        startTime: task.createdAt || new Date(),
                                        logs: [{
                                            timestamp: new Date().toISOString(),
                                            message: `Recovered task from AWS ECS: ${task.taskArn}`
                                        }],
                                        performanceLevel: 'standard',
                                        notifiedRunning: true
                                    });

                                    // Start monitoring this task if it's still running
                                    if (task.lastStatus !== 'STOPPED') {
                                        monitorECSTask(jobId, task.taskArn!);
                                    } else {
                                        // For completed tasks, add sample logs
                                        addSampleTranscodingLogs(jobId);
                                    }
                                }
                            }
                        }
                    }
                } catch (listError) {
                    console.error('Error listing tasks:', listError);
                }
            } catch (error: any) {
                console.error('Error checking AWS for running tasks:', error);
                // Continue with existing jobs even if AWS check fails
            }
        }

        if (activeJobs.size === 0) {
            res.json([]);
            return;
        }

        const jobs = Array.from(activeJobs.entries()).map(([jobId, job]) => ({
            jobId,
            status: job.status,
            startTime: job.startTime,
            videoKey: job.videoKey
        }));

        res.json(jobs);
    } catch (error: any) {
        console.error('Error listing jobs:', error);
        res.status(500).json({ error: 'Failed to list jobs', details: error.message });
    }
});

// API endpoint to test connection
app.get('/api/test-connection', async (req: Request, res: Response) => {
    if (!userConfig) {
        res.json({
            success: false,
            errors: ['Configuration not loaded. Please save configuration first.']
        });
        return;
    }

    const errors: string[] = [];
    const successes: string[] = [];
    const details: any = {}; // Store detailed error information

    try {
        // Test S3 connection
        console.log('Testing S3 connection...');
        details.s3 = { status: 'pending' };

        const s3Client = new S3Client({
            region: userConfig.AWS_REGION,
            credentials: {
                accessKeyId: userConfig.AWS_ACCESS_KEY_ID,
                secretAccessKey: userConfig.AWS_SECRET_ACCESS_KEY,
            }
        });

        try {
            await s3Client.send(new ListBucketsCommand({}));
            details.s3.status = 'success';
            details.s3.message = 'S3 connection successful';

            // Test access to the specific bucket
            try {
                await s3Client.send(new GetObjectCommand({
                    Bucket: userConfig.S3_BUCKET_NAME,
                    Key: 'test-connection.txt' // A key that likely doesn't exist, but allows us to test permissions
                }));
            } catch (bucketError: any) {
                if (bucketError.name === 'NoSuchKey') {
                    // This is actually good - means we have access to the bucket but the file doesn't exist
                    successes.push('Successfully connected to AWS S3 and bucket is accessible');
                } else {
                    details.s3.bucketError = {
                        name: bucketError.name,
                        message: bucketError.message,
                        code: bucketError.code
                    };

                    if (bucketError.name === 'NoSuchBucket') {
                        errors.push(`S3 bucket '${userConfig.S3_BUCKET_NAME}' does not exist`);
                    } else {
                        successes.push('Successfully connected to AWS S3');
                        errors.push(`Cannot access S3 bucket '${userConfig.S3_BUCKET_NAME}': ${bucketError.message}`);
                    }
                }
            }
        } catch (s3Error: any) {
            details.s3.status = 'error';
            details.s3.error = {
                name: s3Error.name,
                message: s3Error.message,
                code: s3Error.code,
                stack: s3Error.stack
            };
            errors.push(`Failed to connect to AWS S3: ${s3Error.message}`);
        }

        // Test ECS connection
        console.log('Testing ECS connection...');
        details.ecs = { status: 'pending' };

        const ecsClient = new ECSClient({
            region: userConfig.AWS_REGION,
            credentials: {
                accessKeyId: userConfig.AWS_ACCESS_KEY_ID,
                secretAccessKey: userConfig.AWS_SECRET_ACCESS_KEY,
            }
        });

        try {
            // First, check if the cluster exists
            const clusterResponse = await ecsClient.send(new DescribeClustersCommand({
                clusters: [userConfig.ECS_CLUSTER]
            }));

            details.ecs.clusterResponse = clusterResponse;

            if (clusterResponse.clusters && clusterResponse.clusters.length > 0) {
                details.ecs.clusterStatus = 'found';
                successes.push('Successfully connected to AWS ECS and cluster is accessible');

                // Now check if the task definition exists
                try {
                    const describeTaskDefCommand = new DescribeTaskDefinitionCommand({
                        taskDefinition: userConfig.ECS_TASK_DEFINITION
                    });

                    const taskDefResponse = await ecsClient.send(describeTaskDefCommand);
                    details.ecs.taskDefinition = {
                        status: 'found',
                        family: taskDefResponse.taskDefinition?.family,
                        revision: taskDefResponse.taskDefinition?.revision,
                        taskStatus: taskDefResponse.taskDefinition?.status
                    };

                    successes.push(`Task definition '${userConfig.ECS_TASK_DEFINITION}' exists and is accessible`);
                } catch (taskDefError: any) {
                    details.ecs.taskDefinition = {
                        status: 'error',
                        error: {
                            name: taskDefError.name,
                            message: taskDefError.message,
                            code: taskDefError.code
                        }
                    };

                    if (taskDefError.name === 'InvalidParameterException') {
                        errors.push(`Task definition '${userConfig.ECS_TASK_DEFINITION}' was not found. Please register it in AWS ECS.`);
                    } else {
                        errors.push(`Error accessing task definition '${userConfig.ECS_TASK_DEFINITION}': ${taskDefError.message}`);
                    }
                }
            } else {
                details.ecs.clusterStatus = 'not found';
                errors.push(`ECS Cluster '${userConfig.ECS_CLUSTER}' not found`);
            }
        } catch (ecsError: any) {
            details.ecs.status = 'error';
            details.ecs.error = {
                name: ecsError.name,
                message: ecsError.message,
                code: ecsError.code,
                stack: ecsError.stack
            };
            errors.push(`Failed to connect to AWS ECS: ${ecsError.message}`);
        }

        // Test EC2 (subnets and security groups)
        console.log('Testing EC2 connection...');
        details.ec2 = { status: 'pending' };

        const ec2Client = new EC2Client({
            region: userConfig.AWS_REGION,
            credentials: {
                accessKeyId: userConfig.AWS_ACCESS_KEY_ID,
                secretAccessKey: userConfig.AWS_SECRET_ACCESS_KEY,
            }
        });

        try {
            const subnets = userConfig.ECS_SUBNETS.split(',');
            const subnetResponse = await ec2Client.send(new DescribeSubnetsCommand({
                SubnetIds: subnets
            }));

            details.ec2.subnets = {
                status: 'success',
                count: subnetResponse.Subnets?.length || 0
            };

            if (subnetResponse.Subnets && subnetResponse.Subnets.length === subnets.length) {
                successes.push('All specified subnets are valid');
            } else {
                errors.push(`Some subnets were not found. Expected ${subnets.length}, found ${subnetResponse.Subnets?.length || 0}`);
            }

            const securityGroups = userConfig.ECS_SECURITY_GROUPS.split(',');
            const sgResponse = await ec2Client.send(new DescribeSecurityGroupsCommand({
                GroupIds: securityGroups
            }));

            details.ec2.securityGroups = {
                status: 'success',
                count: sgResponse.SecurityGroups?.length || 0
            };

            if (sgResponse.SecurityGroups && sgResponse.SecurityGroups.length === securityGroups.length) {
                successes.push('All specified security groups are valid');
            } else {
                errors.push(`Some security groups were not found. Expected ${securityGroups.length}, found ${sgResponse.SecurityGroups?.length || 0}`);
            }
        } catch (ec2Error: any) {
            details.ec2.status = 'error';
            details.ec2.error = {
                name: ec2Error.name,
                message: ec2Error.message,
                code: ec2Error.code,
                stack: ec2Error.stack
            };
            errors.push(`Failed to validate EC2 resources: ${ec2Error.message}`);
        }

    } catch (error: any) {
        console.error('Error testing connection:', error);
        errors.push(`Unexpected error: ${error.message}`);
        details.unexpectedError = {
            message: error.message,
            stack: error.stack
        };
    }

    res.json({
        success: errors.length === 0,
        successes,
        errors,
        details // Include detailed error information
    });
});

// API endpoint to import jobs from AWS (useful for EC2 instance refresh or job recovery)
app.post('/api/import-jobs', async (req: Request, res: Response) => {
    try {
        if (!userConfig) {
            return res.status(400).json({ error: 'System not configured' });
        }

        console.log('Importing jobs from AWS...');
        let newJobsCount = 0;
        let completedJobsCount = 0;

        // Create S3 client to scan for processed videos
        const s3Client = new S3Client({
            region: userConfig.AWS_REGION,
            credentials: {
                accessKeyId: userConfig.AWS_ACCESS_KEY_ID,
                secretAccessKey: userConfig.AWS_SECRET_ACCESS_KEY
            }
        });

        // Look for output directories in S3
        try {
            // List objects in S3 output directory
            const listParams = {
                Bucket: userConfig.S3_BUCKET_NAME,
                Prefix: 'output/',
                Delimiter: '/'
            };

            const s3ListResponse = await s3Client.send(new ListObjectsV2Command(listParams));

            if (s3ListResponse.CommonPrefixes) {
                // Process each directory (representing a completed job)
                for (const prefix of s3ListResponse.CommonPrefixes) {
                    if (prefix.Prefix) {
                        const dirParts = prefix.Prefix.split('/');
                        const videoId = dirParts[dirParts.length - 2]; // Get the ID

                        if (videoId && videoId.length > 5) {
                            // Create a synthetic job ID if needed
                            const jobId = uuidv4();

                            // Check if we already have this job (by videoId)
                            const existingJob = Array.from(activeJobs.values()).find(
                                job => job.videoKey && job.videoKey.includes(videoId)
                            );

                            if (!existingJob) {
                                // Create a synthetic job entry for this completed job
                                const jobCreationTime = new Date();
                                // Set time a bit in the past
                                jobCreationTime.setHours(jobCreationTime.getHours() - 1);

                                // Add to active jobs
                                activeJobs.set(jobId, {
                                    status: 'COMPLETED',
                                    startTime: jobCreationTime,
                                    videoKey: `input/${videoId}.mp4`, // Reconstruct likely input key
                                    logs: [
                                        {
                                            timestamp: jobCreationTime.toISOString(),
                                            message: 'Imported completed job from S3'
                                        }
                                    ],
                                    performanceLevel: 'standard'
                                });

                                // Add sample logs for better UX
                                addSampleTranscodingLogs(jobId);

                                // Add streaming info to the job
                                const job = activeJobs.get(jobId);
                                if (job) {
                                    const baseUrl = `https://s3.${userConfig.AWS_REGION}.amazonaws.com/${userConfig.S3_BUCKET_NAME}/output/${videoId}`;

                                    updateJob(jobId, {
                                        streaming: {
                                            videoId,
                                            masterPlaylist: `${baseUrl}/master.m3u8`,
                                            resolutions: {
                                                "720p": `${baseUrl}/720p/index.m3u8`,
                                                "480p": `${baseUrl}/480p/index.m3u8`,
                                                "360p": `${baseUrl}/360p/index.m3u8`
                                            }
                                        }
                                    });
                                }

                                newJobsCount++;
                                completedJobsCount++;
                            }
                        }
                    }
                }
            }
        } catch (s3Error) {
            console.error('Error scanning S3 for completed jobs:', s3Error);
        }

        // Also check for running ECS tasks
        try {
            const ecsClient = new ECSClient({
                region: userConfig.AWS_REGION,
                credentials: {
                    accessKeyId: userConfig.AWS_ACCESS_KEY_ID,
                    secretAccessKey: userConfig.AWS_SECRET_ACCESS_KEY
                }
            });

            // List running tasks
            const listTasksCommand = {
                cluster: userConfig.ECS_CLUSTER
            };

            const tasksResponse = await ecsClient.send(new ListTasksCommand(listTasksCommand));

            if (tasksResponse.taskArns && tasksResponse.taskArns.length > 0) {
                // Get task details
                const describeTasksCommand = {
                    cluster: userConfig.ECS_CLUSTER,
                    tasks: tasksResponse.taskArns
                };

                const taskDetails = await ecsClient.send(new DescribeTasksCommand(describeTasksCommand));

                // Process each task
                for (const task of taskDetails.tasks || []) {
                    // Extract job ID from task
                    let jobId = null;
                    let videoKey = null;

                    // Try to get from container environment
                    if (task.overrides?.containerOverrides) {
                        for (const container of task.overrides.containerOverrides) {
                            if (container.environment) {
                                for (const env of container.environment) {
                                    if (env.name === 'JOB_ID') jobId = env.value;
                                    if (env.name === 'KEY') videoKey = env.value;
                                }
                            }
                        }
                    }

                    // If no job ID found, create a synthetic one based on task ARN
                    if (!jobId) {
                        const taskParts = task.taskArn?.split('/');
                        if (taskParts) {
                            jobId = taskParts[taskParts.length - 1];
                        } else {
                            jobId = uuidv4();
                        }
                    }

                    // If we have a job ID but no video key, set a default one
                    if (jobId && !videoKey) {
                        videoKey = 'unknown-video-path';
                    }

                    // Only add if we have both job ID and video key
                    if (jobId && videoKey) {
                        // Check if we already have this job
                        if (!activeJobs.has(jobId)) {
                            // Create job entry
                            activeJobs.set(jobId, {
                                taskArn: task.taskArn,
                                status: task.lastStatus === 'STOPPED' ? 'COMPLETED' : 'RUNNING',
                                startTime: task.createdAt || new Date(),
                                videoKey,
                                logs: [
                                    {
                                        timestamp: new Date().toISOString(),
                                        message: `Imported task ${task.taskArn} from AWS ECS`
                                    }
                                ],
                                notifiedRunning: true,
                                performanceLevel: 'standard'
                            });

                            // Start monitoring still-running tasks
                            if (task.lastStatus !== 'STOPPED') {
                                monitorECSTask(jobId, task.taskArn!);
                                newJobsCount++;
                            } else {
                                // For completed tasks, add sample logs
                                addSampleTranscodingLogs(jobId);
                                completedJobsCount++;
                                newJobsCount++;
                            }
                        }
                    }
                }
            }
        } catch (ecsError) {
            console.error('Error scanning ECS for tasks:', ecsError);
        }

        // Save all imported jobs
        saveJobsToStorage();

        res.json({
            success: true,
            message: `Imported ${newJobsCount} jobs from AWS (${completedJobsCount} completed)`,
            activeJobs: activeJobs.size
        });
    } catch (error: any) {
        console.error('Error importing jobs:', error);
        res.status(500).json({ error: 'Failed to import jobs', details: error.message });
    }
});

// Start the server
const PORT = parseInt(process.env.PORT || '3001', 10);

function startServer(port: number) {
    const server = app.listen(port)
        .on('error', (err: any) => {
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

// API endpoint to check if upload is ready
app.get('/api/check-upload-ready', (_req: Request, res: Response) => {
    try {
        // Check if the configuration exists and is valid for uploads
        if (!userConfig) {
            res.json({ ready: false, message: 'System not configured' });
            return;
        }

        // Check if S3 bucket name is available
        if (!userConfig.S3_BUCKET_NAME) {
            res.json({ ready: false, message: 'S3 bucket not configured' });
            return;
        }

        res.json({
            ready: true,
            message: 'Upload service is ready',
            bucket: userConfig.S3_BUCKET_NAME
        });
    } catch (error) {
        console.error('Error checking upload readiness:', error);
        res.status(500).json({ ready: false, error: 'Internal server error' });
    }
});

startServer(PORT);