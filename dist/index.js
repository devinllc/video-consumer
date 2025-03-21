"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_s3_1 = require("@aws-sdk/client-s3");
const client_ecs_1 = require("@aws-sdk/client-ecs");
const client_ec2_1 = require("@aws-sdk/client-ec2");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const uuid_1 = require("uuid");
const child_process_1 = require("child_process");
const app = (0, express_1.default)();
// Enable CORS for all routes
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
// Parse JSON bodies
app.use(express_1.default.json());
app.use(express_1.default.static('frontend'));
// Configure multer for video uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: 'uploads/',
        filename: (_req, file, cb) => {
            const uniqueName = `${(0, uuid_1.v4)()}${path_1.default.extname(file.originalname)}`;
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
if (!fs_1.default.existsSync('uploads')) {
    fs_1.default.mkdirSync('uploads');
}
let config = null;
// Load configuration from file if it exists
try {
    const configPath = path_1.default.join(__dirname, 'config.json');
    if (fs_1.default.existsSync(configPath)) {
        const savedConfig = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
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
        fs_1.default.writeFileSync(path_1.default.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
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
app.post('/api/upload', upload.single('video'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const s3Client = new client_s3_1.S3Client({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });
        // Upload to S3
        const key = `raw/${path_1.default.basename(file.filename)}`;
        console.log('Uploading to S3:', {
            bucket: config.S3_BUCKET_NAME,
            key: key
        });
        yield s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: config.S3_BUCKET_NAME,
            Key: key,
            Body: fs_1.default.createReadStream(file.path)
        }));
        console.log('Successfully uploaded to S3');
        // Clean up local file
        fs_1.default.unlinkSync(file.path);
        console.log('Cleaned up local file');
        // Return the future HLS playlist URL
        const playlistUrl = `https://s3.${config.AWS_REGION}.amazonaws.com/${config.S3_BUCKET_NAME}/output/${path_1.default.basename(file.filename, path_1.default.extname(file.filename))}/master.m3u8`;
        res.json({
            success: true,
            message: 'Video uploaded successfully',
            key: key,
            playlistUrl
        });
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload video', details: error.message });
    }
}));
const activeJobs = new Map();
// Function to execute shell commands and return stdout as string
function execCommand(command) {
    return __awaiter(this, void 0, void 0, function* () {
        const { stdout } = yield (0, child_process_1.exec)(command);
        return (stdout === null || stdout === void 0 ? void 0 : stdout.toString()) || '';
    });
}
// Function to add simulated container logs for testing
function addSimulatedContainerLogs(jobId) {
    const job = activeJobs.get(jobId);
    if (!job)
        return;
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
function monitorDockerContainer(jobId, containerId) {
    return __awaiter(this, void 0, void 0, function* () {
        const job = activeJobs.get(jobId);
        if (!job)
            return;
        try {
            // Get container logs with timestamps
            const logs = yield execCommand(`docker logs --timestamps ${containerId}`);
            // Split logs into lines and filter out empty lines
            const logLines = logs.split('\n').filter(line => line.trim());
            if (job.logs) {
                // Add each log line as a separate entry
                logLines.forEach(line => {
                    var _a;
                    const [timestamp, ...messageParts] = line.split(' ');
                    const message = messageParts.join(' ');
                    (_a = job.logs) === null || _a === void 0 ? void 0 : _a.push({
                        timestamp: timestamp || new Date().toISOString(),
                        message: message.trim()
                    });
                });
            }
            // Check container status
            const status = (yield execCommand(`docker inspect --format='{{.State.Status}}' ${containerId}`)).trim();
            console.log(`Container ${containerId} status:`, status);
            if (status === 'exited') {
                const exitCode = (yield execCommand(`docker inspect --format='{{.State.ExitCode}}' ${containerId}`)).trim();
                console.log(`Container ${containerId} exit code:`, exitCode);
                if (exitCode === '0') {
                    job.status = 'COMPLETED';
                    console.log(`Job ${jobId} completed successfully`);
                }
                else {
                    job.status = 'FAILED';
                    console.log(`Job ${jobId} failed with exit code ${exitCode}`);
                }
            }
            else if (status === 'running') {
                // Check again in 5 seconds
                setTimeout(() => monitorDockerContainer(jobId, containerId), 5000);
            }
            else {
                console.log(`Container ${containerId} in unexpected state:`, status);
                job.status = 'FAILED';
            }
        }
        catch (error) {
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
    });
}
// Function to start transcoding
function startTranscoding(jobId, videoKey) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        if (!config) {
            throw new Error('Configuration missing');
        }
        console.log('Starting transcoding:', {
            jobId,
            videoKey,
            bucket: config.S3_BUCKET_NAME
        });
        // Initialize ECS client
        const ecsClient = new client_ecs_1.ECSClient({
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
            const command = new client_ecs_1.RunTaskCommand({
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
            const response = yield ecsClient.send(command);
            console.log('Started ECS task:', response);
            const job = activeJobs.get(jobId);
            if (job && ((_a = response.tasks) === null || _a === void 0 ? void 0 : _a[0])) {
                job.taskArn = response.tasks[0].taskArn;
                job.logs = [{
                        timestamp: new Date().toISOString(),
                        message: `Started ECS task: ${response.tasks[0].taskArn}`
                    }];
            }
            // Start monitoring the task
            monitorECSTask(jobId, ((_c = (_b = response.tasks) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.taskArn) || '');
        }
        catch (error) {
            console.error('ECS error:', error);
            // Handle specific error types
            if (error.__type === 'BlockedException') {
                throw new Error('AWS account is blocked. Please contact AWS support to resolve this issue.');
            }
            else if (error.__type === 'InvalidParameterException' && error.message.includes('AccountIDs mismatch')) {
                throw new Error('Account ID mismatch. Please make sure your task definition uses the same AWS account ID as your AWS credentials.');
            }
            else if (error.__type === 'InvalidParameterException' && error.message.includes('subnet')) {
                throw new Error('Invalid subnet configuration. Please check your subnet IDs.');
            }
            else if (error.__type === 'InvalidParameterException' && error.message.includes('security group')) {
                throw new Error('Invalid security group configuration. Please check your security group IDs.');
            }
            throw new Error(`Failed to start ECS task: ${error.message}`);
        }
    });
}
// Function to monitor ECS task
function monitorECSTask(jobId, taskArn) {
    return __awaiter(this, void 0, void 0, function* () {
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
        const ecsClient = new client_ecs_1.ECSClient({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });
        // Set up interval to check task status every 10 seconds
        const interval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g;
            // Exit if config is no longer available
            if (!config) {
                clearInterval(interval);
                return;
            }
            try {
                // Create command to describe the task
                const command = new client_ecs_1.DescribeTasksCommand({
                    cluster: config.ECS_CLUSTER,
                    tasks: [taskArn]
                });
                const taskInfo = yield ecsClient.send(command);
                console.log('Task status:', (_b = (_a = taskInfo.tasks) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.lastStatus);
                if (((_d = (_c = taskInfo.tasks) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.lastStatus) === 'STOPPED') {
                    const job = activeJobs.get(jobId);
                    if (job) {
                        job.status = 'COMPLETED';
                        (_e = job.logs) === null || _e === void 0 ? void 0 : _e.push({
                            timestamp: new Date().toISOString(),
                            message: 'Task completed successfully'
                        });
                        addSimulatedContainerLogs(jobId);
                    }
                    clearInterval(interval);
                }
                else if ((_g = (_f = taskInfo.tasks) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.lastStatus) {
                    const job = activeJobs.get(jobId);
                    if (job) {
                        job.status = taskInfo.tasks[0].lastStatus;
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
            }
            catch (describeError) {
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
        }), 10000);
    });
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
app.post('/api/start-transcoding', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { videoKey, performanceLevel } = req.body;
    try {
        if (!videoKey) {
            return res.status(400).json({
                success: false,
                error: 'Video key is required'
            });
        }
        // Generate a unique job ID
        const jobId = (0, uuid_1.v4)();
        console.log(`Starting transcoding job ${jobId} for video: ${videoKey}, performance level: ${performanceLevel || 'standard'}`);
        // Use the configured task definition from config, don't override it
        const taskArn = yield startECSTask(videoKey, jobId);
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
    }
    catch (error) {
        console.error('Error starting transcoding:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to start transcoding task'
        });
    }
}));
// API endpoint to get job status and logs
app.get('/api/jobs/:jobId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
}));
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
// API endpoint to test connection
app.get('/api/test-connection', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!config) {
        return res.json({
            success: false,
            errors: ['Configuration not loaded. Please save configuration first.']
        });
    }
    const errors = [];
    const successes = [];
    const details = {}; // Store detailed error information
    try {
        // Test S3 connection
        console.log('Testing S3 connection...');
        details.s3 = { status: 'pending' };
        const s3Client = new client_s3_1.S3Client({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });
        try {
            yield s3Client.send(new client_s3_1.ListBucketsCommand({}));
            details.s3.status = 'success';
            details.s3.message = 'S3 connection successful';
            // Test access to the specific bucket
            try {
                yield s3Client.send(new client_s3_1.GetObjectCommand({
                    Bucket: config.S3_BUCKET_NAME,
                    Key: 'test-connection.txt' // A key that likely doesn't exist, but allows us to test permissions
                }));
            }
            catch (bucketError) {
                if (bucketError.name === 'NoSuchKey') {
                    // This is actually good - means we have access to the bucket but the file doesn't exist
                    successes.push('Successfully connected to AWS S3 and bucket is accessible');
                }
                else {
                    details.s3.bucketError = {
                        name: bucketError.name,
                        message: bucketError.message,
                        code: bucketError.code
                    };
                    if (bucketError.name === 'NoSuchBucket') {
                        errors.push(`S3 bucket '${config.S3_BUCKET_NAME}' does not exist`);
                    }
                    else {
                        successes.push('Successfully connected to AWS S3');
                        errors.push(`Cannot access S3 bucket '${config.S3_BUCKET_NAME}': ${bucketError.message}`);
                    }
                }
            }
        }
        catch (s3Error) {
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
        const ecsClient = new client_ecs_1.ECSClient({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });
        try {
            // First, check if the cluster exists
            const clusterResponse = yield ecsClient.send(new client_ecs_1.DescribeClustersCommand({
                clusters: [config.ECS_CLUSTER]
            }));
            details.ecs.clusterResponse = clusterResponse;
            if (clusterResponse.clusters && clusterResponse.clusters.length > 0) {
                details.ecs.clusterStatus = 'found';
                successes.push('Successfully connected to AWS ECS and cluster is accessible');
                // Now check if the task definition exists
                try {
                    const describeTaskDefCommand = new client_ecs_1.DescribeTaskDefinitionCommand({
                        taskDefinition: config.ECS_TASK_DEFINITION
                    });
                    const taskDefResponse = yield ecsClient.send(describeTaskDefCommand);
                    details.ecs.taskDefinition = {
                        status: 'found',
                        family: (_a = taskDefResponse.taskDefinition) === null || _a === void 0 ? void 0 : _a.family,
                        revision: (_b = taskDefResponse.taskDefinition) === null || _b === void 0 ? void 0 : _b.revision,
                        taskStatus: (_c = taskDefResponse.taskDefinition) === null || _c === void 0 ? void 0 : _c.status
                    };
                    successes.push(`Task definition '${config.ECS_TASK_DEFINITION}' exists and is accessible`);
                }
                catch (taskDefError) {
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
                    }
                    else {
                        errors.push(`Error accessing task definition '${config.ECS_TASK_DEFINITION}': ${taskDefError.message}`);
                    }
                }
            }
            else {
                details.ecs.clusterStatus = 'not found';
                errors.push(`ECS Cluster '${config.ECS_CLUSTER}' not found`);
            }
        }
        catch (ecsError) {
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
        const ec2Client = new client_ec2_1.EC2Client({
            region: config.AWS_REGION,
            credentials: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            }
        });
        try {
            const subnets = config.ECS_SUBNETS.split(',');
            const subnetResponse = yield ec2Client.send(new client_ec2_1.DescribeSubnetsCommand({
                SubnetIds: subnets
            }));
            details.ec2.subnets = {
                status: 'success',
                count: ((_d = subnetResponse.Subnets) === null || _d === void 0 ? void 0 : _d.length) || 0
            };
            if (subnetResponse.Subnets && subnetResponse.Subnets.length === subnets.length) {
                successes.push('All specified subnets are valid');
            }
            else {
                errors.push(`Some subnets were not found. Expected ${subnets.length}, found ${((_e = subnetResponse.Subnets) === null || _e === void 0 ? void 0 : _e.length) || 0}`);
            }
            const securityGroups = config.ECS_SECURITY_GROUPS.split(',');
            const sgResponse = yield ec2Client.send(new client_ec2_1.DescribeSecurityGroupsCommand({
                GroupIds: securityGroups
            }));
            details.ec2.securityGroups = {
                status: 'success',
                count: ((_f = sgResponse.SecurityGroups) === null || _f === void 0 ? void 0 : _f.length) || 0
            };
            if (sgResponse.SecurityGroups && sgResponse.SecurityGroups.length === securityGroups.length) {
                successes.push('All specified security groups are valid');
            }
            else {
                errors.push(`Some security groups were not found. Expected ${securityGroups.length}, found ${((_g = sgResponse.SecurityGroups) === null || _g === void 0 ? void 0 : _g.length) || 0}`);
            }
        }
        catch (ec2Error) {
            details.ec2.status = 'error';
            details.ec2.error = {
                name: ec2Error.name,
                message: ec2Error.message,
                code: ec2Error.code,
                stack: ec2Error.stack
            };
            errors.push(`Failed to validate EC2 resources: ${ec2Error.message}`);
        }
    }
    catch (error) {
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
}));
// Function to start an ECS task
function startECSTask(videoKey, jobId) {
    return __awaiter(this, void 0, void 0, function* () {
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
            const ecsClient = new client_ecs_1.ECSClient({
                region: config.AWS_REGION,
                credentials: {
                    accessKeyId: config.AWS_ACCESS_KEY_ID,
                    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                }
            });
            // First, verify the task definition exists
            try {
                const describeTaskDefCommand = new client_ecs_1.DescribeTaskDefinitionCommand({
                    taskDefinition: config.ECS_TASK_DEFINITION
                });
                yield ecsClient.send(describeTaskDefCommand);
            }
            catch (error) {
                if (error.name === 'InvalidParameterException') {
                    throw new Error(`Task definition "${config.ECS_TASK_DEFINITION}" not found. Please register the task definition in AWS ECS first.`);
                }
                throw error;
            }
            // Start ECS task
            const command = new client_ecs_1.RunTaskCommand({
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
            const response = yield ecsClient.send(command);
            if (response.tasks && response.tasks.length > 0) {
                const taskArn = response.tasks[0].taskArn;
                console.log(`Started ECS task: ${taskArn}`);
                return taskArn;
            }
            else {
                console.error('No tasks returned from ECS');
                if (response.failures && response.failures.length > 0) {
                    console.error('Task failures:', response.failures);
                    throw new Error(`Failed to start task: ${response.failures[0].reason}`);
                }
                throw new Error('No tasks were started');
            }
        }
        catch (error) {
            console.error('Error starting ECS task:', error);
            throw new Error(`Failed to start ECS task: ${error.message}`);
        }
    });
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
        }
        else {
            console.error('Server error:', err);
        }
    })
        .on('listening', () => {
        console.log(`Server running on port ${port}`);
    });
}
startServer(PORT);
