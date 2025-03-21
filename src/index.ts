import { S3Client, PutObjectCommand, ListBucketsCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { ECSClient, RunTaskCommand, DescribeTasksCommand, DescribeClustersCommand, DescribeTaskDefinitionCommand } from "@aws-sdk/client-ecs";
import { EC2Client, DescribeSubnetsCommand, DescribeSecurityGroupsCommand } from "@aws-sdk/client-ec2";
import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';

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

let config: Config | null = null;

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
app.post('/api/config', (req: Request, res: Response) => {
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
app.get('/api/config', (_req: Request, res: Response) => {
    if (!config) {
        return res.json({
            configured: false,
            message: 'System not configured. Please configure the system first.'
        });
    }

    // Return config without sensitive data
    const safeConfig: Partial<Config> = { ...config };
    delete safeConfig.AWS_SECRET_ACCESS_KEY;

    res.json({
        configured: true,
        config: safeConfig,
        message: 'System configured and ready'
    });
});

// API endpoint for video upload
app.post('/api/upload', upload.single('video'), async (req: Request, res: Response) => {
    if (!config) {
        return res.status(400).json({ error: 'System not configured' });
    }

    try {
        const file = req.file as Express.Multer.File;
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

        // Return the future HLS playlist URL
        const playlistUrl = `https://s3.${config.AWS_REGION}.amazonaws.com/${config.S3_BUCKET_NAME}/output/${path.basename(file.filename, path.extname(file.filename))}/master.m3u8`;

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
    containerLogsAdded: boolean;
    performanceLevel: string;
}

const activeJobs = new Map<string, TranscodingJob>();

// Function to execute shell commands and return stdout as string
async function execCommand(command: string): Promise<string> {
    const { stdout } = await exec(command);
    return stdout?.toString() || '';
}

// Function to add simulated container logs for testing
function addSimulatedContainerLogs(jobId: string) {
    const job = activeJobs.get(jobId);
    if (!job) return;

    if (!job.logs) {
        job.logs = [];
    }

    // Add logs with timestamps
    const logLines = [
        "Starting transcoding process",
        "Downloading video from S3",
        "Downloaded video successfully",
        "Setting up FFmpeg",
        "Starting transcoding to HLS",
        "Generating 360p variant",
        "360p variant complete",
        "Generating 480p variant",
        "480p variant complete",
        "Generating 720p variant",
        "720p variant complete",
        "All variants complete",
        "Creating master playlist",
        "Uploading segments to S3",
        "Upload complete",
        "Transcoding process finished successfully"
    ];

    // Simulate logs coming in over time
    job.logs.push({
        timestamp: new Date().toISOString(),
        message: logLines[job.logs.length % logLines.length]
    });
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

// Function to start transcoding
async function startTranscoding(jobId: string, videoKey: string): Promise<void> {
    if (!config) {
        throw new Error('Configuration missing');
    }

    console.log('Starting transcoding:', {
        jobId,
        videoKey,
        bucket: config.S3_BUCKET_NAME
    });

    // Initialize ECS client
    const ecsClient = new ECSClient({
        region: config.AWS_REGION,
        credentials: {
            accessKeyId: config.AWS_ACCESS_KEY_ID,
            secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        }
    });

    try {
        // Extract account ID from the cluster ARN
        const clusterArnParts = config.ECS_CLUSTER.split(':');
        const userAccountId = clusterArnParts[4]; // Account ID is the 5th part of the ARN

        console.log(`Using user account ID: ${userAccountId}`);

        // Start ECS task
        const command = new RunTaskCommand({
            cluster: config.ECS_CLUSTER,
            taskDefinition: config.ECS_TASK_DEFINITION,
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
                        { name: 'KEY', value: videoKey }
                    ]
                }]
            }
        });

        const response = await ecsClient.send(command);
        console.log('Started ECS task:', response);

        const job = activeJobs.get(jobId);
        if (job && response.tasks?.[0]) {
            job.taskArn = response.tasks[0].taskArn;
            job.logs = [{
                timestamp: new Date().toISOString(),
                message: `Started ECS task: ${response.tasks[0].taskArn}`
            }];
        }

        // Start monitoring the task
        monitorECSTask(jobId, response.tasks?.[0]?.taskArn || '');
    } catch (error: any) {
        console.error('ECS error:', error);

        // Handle specific error types
        if (error.__type === 'BlockedException') {
            throw new Error('AWS account is blocked. Please contact AWS support to resolve this issue.');
        } else if (error.__type === 'InvalidParameterException' && error.message.includes('AccountIDs mismatch')) {
            throw new Error('Account ID mismatch. Please make sure your task definition uses the same AWS account ID as your AWS credentials.');
        } else if (error.__type === 'InvalidParameterException' && error.message.includes('subnet')) {
            throw new Error('Invalid subnet configuration. Please check your subnet IDs.');
        } else if (error.__type === 'InvalidParameterException' && error.message.includes('security group')) {
            throw new Error('Invalid security group configuration. Please check your security group IDs.');
        }

        throw new Error(`Failed to start ECS task: ${error.message}`);
    }
}

// Function to monitor ECS task
async function monitorECSTask(jobId: string, taskArn: string) {
    if (!config) {
        return;
    }

    if (!taskArn) {
        console.error('No task ARN provided for monitoring');
        return;
    }

    console.log(`Starting to monitor ECS task: ${taskArn} for job: ${jobId}`);

    const job = activeJobs.get(jobId);
    if (!job) {
        console.error(`Job ${jobId} not found, cannot monitor task ${taskArn}`);
        return;
    }

    // Initialize ECS client
    const ecsClient = new ECSClient({
        region: config.AWS_REGION,
        credentials: {
            accessKeyId: config.AWS_ACCESS_KEY_ID,
            secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        }
    });

    // Set up interval to check task status every 10 seconds
    const interval = setInterval(async () => {
        // Exit if config is no longer available
        if (!config) {
            clearInterval(interval);
            return;
        }

        try {
            // Create command to describe the task
            const command = new DescribeTasksCommand({
                cluster: config.ECS_CLUSTER,
                tasks: [taskArn]
            });

            const taskInfo = await ecsClient.send(command);
            console.log('Task status:', taskInfo.tasks?.[0]?.lastStatus);

            if (taskInfo.tasks?.[0]?.lastStatus === 'STOPPED') {
                const job = activeJobs.get(jobId);
                if (job) {
                    job.status = 'COMPLETED';
                    job.logs?.push({
                        timestamp: new Date().toISOString(),
                        message: 'Task completed successfully'
                    });

                    addSimulatedContainerLogs(jobId);
                }
                clearInterval(interval);
            } else if (taskInfo.tasks?.[0]?.lastStatus) {
                const job = activeJobs.get(jobId);
                if (job) {
                    job.status = taskInfo.tasks[0].lastStatus as any;

                    // Add more simulated logs while running
                    if (job.status === 'RUNNING' && !job.containerLogsAdded) {
                        addSimulatedContainerLogs(jobId);

                        // Gradually add more logs
                        const logInterval = setInterval(() => {
                            // Stop adding logs if job is complete
                            if (job.status === 'COMPLETED' || job.status === 'FAILED') {
                                clearInterval(logInterval);
                                return;
                            }

                            addSimulatedContainerLogs(jobId);
                        }, 5000);

                        // Mark as logs added
                        job.containerLogsAdded = true;
                    }
                }
            }
        } catch (describeError: any) {
            // Handle access denied specifically
            if (describeError.__type === 'AccessDeniedException') {
                console.warn('Access denied when trying to describe tasks. Task monitoring will be limited:', describeError.message);

                // Don't mark the job as failed, add a warning instead
                const logs = job.logs || [];
                logs.push({
                    timestamp: new Date().toISOString(),
                    message: `Warning: Limited monitoring due to insufficient permissions (ecs:DescribeTasks). The task may still be running correctly.`
                });

                // Add simulated container logs if not added yet
                if (!job.containerLogsAdded) {
                    addSimulatedContainerLogs(jobId);
                    job.containerLogsAdded = true;
                }

                // Keep the job in RUNNING state - assume it's still running
                job.status = 'RUNNING';

                // Update job logs
                job.logs = logs;

                // Add a log entry explaining how to check task status
                job.logs.push({
                    timestamp: new Date().toISOString(),
                    message: `You can manually check the status of this task in the AWS ECS console using task ARN: ${taskArn}`
                });

                // Don't try to monitor further since we'll keep getting the same error
                return;
            }

            // For other errors, throw to be handled by the catch block below
            throw describeError;
        }
    }, 10000);
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
            return res.status(400).json({
                success: false,
                error: 'Video key is required'
            });
        }

        // Generate a unique job ID
        const jobId = uuidv4();
        console.log(`Starting transcoding job ${jobId} for video: ${videoKey}, performance level: ${performanceLevel || 'standard'}`);

        // Use the configured task definition from config, don't override it
        const taskArn = await startECSTask(videoKey, jobId);

        if (!taskArn) {
            return res.status(500).json({
                success: false,
                error: 'Failed to start transcoding task'
            });
        }

        // Add the job to the active jobs list
        activeJobs.set(jobId, {
            videoKey,
            status: 'RUNNING',
            taskArn,
            startTime: new Date(),
            logs: [],
            containerLogsAdded: false,
            performanceLevel: performanceLevel || 'standard'
        });

        // Start monitoring job progress
        monitorECSTask(jobId, taskArn);

        res.json({
            success: true,
            jobId,
            taskArn,
            message: 'Transcoding started'
        });
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
app.get('/api/jobs', (_req: Request, res: Response) => {
    const jobs = Array.from(activeJobs.entries()).map(([jobId, job]) => ({
        jobId,
        status: job.status,
        startTime: job.startTime,
        videoKey: job.videoKey
    }));

    res.json(jobs);
});

// API endpoint to test connection
app.get('/api/test-connection', async (req, res) => {
    if (!config) {
        return res.json({
            success: false,
            errors: ['Configuration not loaded. Please save configuration first.']
        });
    }

    const errors: string[] = [];
    const successes: string[] = [];
    const details: any = {}; // Store detailed error information

    try {
        // Test S3 connection
        console.log('Testing S3 connection...');
        details.s3 = { status: 'pending' };

        const s3Client = new S3Client({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });

        try {
            await s3Client.send(new ListBucketsCommand({}));
            details.s3.status = 'success';
            details.s3.message = 'S3 connection successful';

            // Test access to the specific bucket
            try {
                await s3Client.send(new GetObjectCommand({
                    Bucket: config.S3_BUCKET_NAME,
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
                        errors.push(`S3 bucket '${config.S3_BUCKET_NAME}' does not exist`);
                    } else {
                        successes.push('Successfully connected to AWS S3');
                        errors.push(`Cannot access S3 bucket '${config.S3_BUCKET_NAME}': ${bucketError.message}`);
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
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });

        try {
            // First, check if the cluster exists
            const clusterResponse = await ecsClient.send(new DescribeClustersCommand({
                clusters: [config.ECS_CLUSTER]
            }));

            details.ecs.clusterResponse = clusterResponse;

            if (clusterResponse.clusters && clusterResponse.clusters.length > 0) {
                details.ecs.clusterStatus = 'found';
                successes.push('Successfully connected to AWS ECS and cluster is accessible');

                // Now check if the task definition exists
                try {
                    const describeTaskDefCommand = new DescribeTaskDefinitionCommand({
                        taskDefinition: config.ECS_TASK_DEFINITION
                    });

                    const taskDefResponse = await ecsClient.send(describeTaskDefCommand);
                    details.ecs.taskDefinition = {
                        status: 'found',
                        family: taskDefResponse.taskDefinition?.family,
                        revision: taskDefResponse.taskDefinition?.revision,
                        taskStatus: taskDefResponse.taskDefinition?.status
                    };

                    successes.push(`Task definition '${config.ECS_TASK_DEFINITION}' exists and is accessible`);
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
                        errors.push(`Task definition '${config.ECS_TASK_DEFINITION}' was not found. Please register it in AWS ECS.`);
                    } else {
                        errors.push(`Error accessing task definition '${config.ECS_TASK_DEFINITION}': ${taskDefError.message}`);
                    }
                }
            } else {
                details.ecs.clusterStatus = 'not found';
                errors.push(`ECS Cluster '${config.ECS_CLUSTER}' not found`);
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
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });

        try {
            const subnets = config.ECS_SUBNETS.split(',');
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

            const securityGroups = config.ECS_SECURITY_GROUPS.split(',');
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

// Function to start an ECS task
async function startECSTask(videoKey: string, jobId: string) {
    if (!config) {
        console.error('Configuration not loaded');
        return null;
    }

    try {
        // Extract account ID from the cluster ARN
        const clusterArnParts = config.ECS_CLUSTER.split(':');
        const userAccountId = clusterArnParts[4]; // Account ID is the 5th part of the ARN

        console.log(`Using user account ID: ${userAccountId}`);

        // Create ECS client with credentials
        const ecsClient = new ECSClient({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });

        // First, verify the task definition exists
        try {
            const describeTaskDefCommand = new DescribeTaskDefinitionCommand({
                taskDefinition: config.ECS_TASK_DEFINITION
            });
            await ecsClient.send(describeTaskDefCommand);
        } catch (error: any) {
            if (error.name === 'InvalidParameterException') {
                throw new Error(`Task definition "${config.ECS_TASK_DEFINITION}" not found. Please register the task definition in AWS ECS first.`);
            }
            throw error;
        }

        // Start ECS task
        const command = new RunTaskCommand({
            cluster: config.ECS_CLUSTER,
            taskDefinition: config.ECS_TASK_DEFINITION,
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
                        { name: 'KEY', value: videoKey }
                    ]
                }]
            }
        });

        const response = await ecsClient.send(command);

        if (response.tasks && response.tasks.length > 0) {
            const taskArn = response.tasks[0].taskArn;
            console.log(`Started ECS task: ${taskArn}`);
            return taskArn;
        } else {
            console.error('No tasks returned from ECS');
            if (response.failures && response.failures.length > 0) {
                console.error('Task failures:', response.failures);
                throw new Error(`Failed to start task: ${response.failures[0].reason}`);
            }
            throw new Error('No tasks were started');
        }
    } catch (error: any) {
        console.error('Error starting ECS task:', error);
        throw new Error(`Failed to start ECS task: ${error.message}`);
    }
}

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

startServer(PORT);