# Video Processing System API Documentation

## Base URL
```
http://localhost:3001
```

## Authentication
All API endpoints require AWS credentials to be configured first using the `/api/config` endpoint.

## Endpoints

### 1. Configure AWS Settings
Configure AWS credentials and settings for the system.

**Endpoint:** `POST /api/config`

**Request Body:**
```json
{
    "AWS_REGION": "ap-south-1",
    "AWS_ACCESS_KEY_ID": "your_access_key",
    "AWS_SECRET_ACCESS_KEY": "your_secret_key",
    "S3_BUCKET_NAME": "your_bucket_name",
    "ECS_CLUSTER": "arn:aws:ecs:ap-south-1:your_account_id:cluster/video-transcoder-cluster",
    "ECS_TASK_DEFINITION": "video-transcoder:1",
    "ECS_SUBNETS": "subnet-xxx,subnet-yyy",
    "ECS_SECURITY_GROUPS": "sg-xxx,sg-yyy"
}
```

**Response:**
```json
{
    "success": true,
    "message": "Configuration saved successfully"
}
```

### 2. Get Current Configuration
Retrieve the current AWS configuration (without sensitive data).

**Endpoint:** `GET /api/config`

**Response:**
```json
{
    "configured": true,
    "config": {
        "AWS_REGION": "ap-south-1",
        "AWS_ACCESS_KEY_ID": "your_access_key",
        "S3_BUCKET_NAME": "your_bucket_name",
        "ECS_CLUSTER": "arn:aws:ecs:ap-south-1:your_account_id:cluster/video-transcoder-cluster",
        "ECS_TASK_DEFINITION": "video-transcoder:1",
        "ECS_SUBNETS": "subnet-xxx,subnet-yyy",
        "ECS_SECURITY_GROUPS": "sg-xxx,sg-yyy"
    },
    "message": "System configured and ready"
}
```

### 3. Upload Video
Upload a video file for processing.

**Endpoint:** `POST /api/upload`

**Content-Type:** `multipart/form-data`

**Form Data:**
- Key: `video`
- Type: File
- Value: Your video file

**Response:**
```json
{
    "success": true,
    "message": "Video uploaded successfully",
    "key": "raw/filename.mp4",
    "playlistUrl": "https://s3.ap-south-1.amazonaws.com/your_bucket/output/filename/master.m3u8"
}
```

### 4. Start Video Transcoding
Start the transcoding process for an uploaded video.

**Endpoint:** `POST /api/start-transcoding`

**Request Body:**
```json
{
    "videoKey": "raw/filename.mp4",
    "performanceLevel": "standard"
}
```

**Response:**
```json
{
    "success": true,
    "jobId": "uuid",
    "taskArn": "arn:aws:ecs:...",
    "message": "Transcoding started"
}
```

### 5. Get Job Status
Get the status and logs of a specific transcoding job.

**Endpoint:** `GET /api/jobs/:jobId`

**Response:**
```json
{
    "jobId": "uuid",
    "status": "RUNNING",
    "startTime": "2024-03-21T10:00:00.000Z",
    "videoKey": "raw/filename.mp4",
    "logs": [
        {
            "timestamp": "2024-03-21T10:00:00.000Z",
            "message": "Task status: RUNNING"
        }
    ]
}
```

### 6. List All Jobs
Get a list of all transcoding jobs.

**Endpoint:** `GET /api/jobs`

**Response:**
```json
[
    {
        "jobId": "uuid",
        "status": "RUNNING",
        "startTime": "2024-03-21T10:00:00.000Z",
        "videoKey": "raw/filename.mp4"
    }
]
```

### 7. Test AWS Connection
Test the AWS credentials and configuration.

**Endpoint:** `GET /api/test-connection`

**Response:**
```json
{
    "success": true,
    "successes": [
        "Successfully connected to AWS S3",
        "Successfully connected to AWS ECS"
    ],
    "errors": [],
    "details": {
        "s3": { "status": "success" },
        "ecs": { "status": "success" },
        "ec2": { "status": "success" }
    }
}
```

## Testing with Postman

1. **Setup Postman Collection**
   - Create a new collection named "Video Processing System"
   - Set the base URL variable to `http://localhost:3001`

2. **Configure AWS Settings**
   - Create a new request: `POST /api/config`
   - Set Content-Type to `application/json`
   - Add the configuration JSON in the request body
   - Send the request to configure AWS settings

3. **Upload Video**
   - Create a new request: `POST /api/upload`
   - Set Content-Type to `multipart/form-data`
   - Add a form field:
     - Key: `video`
     - Type: File
     - Value: Select your video file
   - Send the request to upload a video

4. **Start Transcoding**
   - Create a new request: `POST /api/start-transcoding`
   - Set Content-Type to `application/json`
   - Add the request body with videoKey and performanceLevel
   - Send the request to start transcoding

5. **Monitor Job Status**
   - Create a new request: `GET /api/jobs/:jobId`
   - Replace `:jobId` with the jobId from the start-transcoding response
   - Send the request to check job status

6. **List All Jobs**
   - Create a new request: `GET /api/jobs`
   - Send the request to see all jobs

7. **Test Connection**
   - Create a new request: `GET /api/test-connection`
   - Send the request to verify AWS configuration

## Example Postman Collection

```json
{
    "info": {
        "name": "Video Processing System",
        "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    "variable": [
        {
            "key": "baseUrl",
            "value": "http://localhost:3001"
        }
    ],
    "item": [
        {
            "name": "Configure AWS Settings",
            "request": {
                "method": "POST",
                "header": [
                    {
                        "key": "Content-Type",
                        "value": "application/json"
                    }
                ],
                "url": "{{baseUrl}}/api/config",
                "body": {
                    "mode": "raw",
                    "raw": "{\n    \"AWS_REGION\": \"ap-south-1\",\n    \"AWS_ACCESS_KEY_ID\": \"your_access_key\",\n    \"AWS_SECRET_ACCESS_KEY\": \"your_secret_key\",\n    \"S3_BUCKET_NAME\": \"your_bucket_name\",\n    \"ECS_CLUSTER\": \"arn:aws:ecs:ap-south-1:your_account_id:cluster/video-transcoder-cluster\",\n    \"ECS_TASK_DEFINITION\": \"video-transcoder:1\",\n    \"ECS_SUBNETS\": \"subnet-xxx,subnet-yyy\",\n    \"ECS_SECURITY_GROUPS\": \"sg-xxx,sg-yyy\"\n}"
                }
            }
        },
        {
            "name": "Upload Video",
            "request": {
                "method": "POST",
                "header": [],
                "url": "{{baseUrl}}/api/upload",
                "body": {
                    "mode": "formdata",
                    "formdata": [
                        {
                            "key": "video",
                            "type": "file",
                            "src": []
                        }
                    ]
                }
            }
        },
        {
            "name": "Start Transcoding",
            "request": {
                "method": "POST",
                "header": [
                    {
                        "key": "Content-Type",
                        "value": "application/json"
                    }
                ],
                "url": "{{baseUrl}}/api/start-transcoding",
                "body": {
                    "mode": "raw",
                    "raw": "{\n    \"videoKey\": \"raw/filename.mp4\",\n    \"performanceLevel\": \"standard\"\n}"
                }
            }
        },
        {
            "name": "Get Job Status",
            "request": {
                "method": "GET",
                "url": "{{baseUrl}}/api/jobs/:jobId"
            }
        },
        {
            "name": "List All Jobs",
            "request": {
                "method": "GET",
                "url": "{{baseUrl}}/api/jobs"
            }
        },
        {
            "name": "Test Connection",
            "request": {
                "method": "GET",
                "url": "{{baseUrl}}/api/test-connection"
            }
        }
    ]
}
```

## Error Handling

All endpoints may return the following error responses:

1. **400 Bad Request**
```json
{
    "error": "Error message"
}
```

2. **500 Internal Server Error**
```json
{
    "error": "Server error message"
}
```

3. **404 Not Found**
```json
{
    "error": "Resource not found"
}
```

## Notes

1. Make sure the server is running on port 3001 before testing
2. Configure AWS credentials first using the `/api/config` endpoint
3. Test the connection using `/api/test-connection` before starting any operations
4. Video files should be in a supported format (MP4, MOV, etc.)
5. The maximum file size is 500MB
6. Job status can be monitored using the `/api/jobs/:jobId` endpoint
7. Transcoding jobs may take several minutes to complete depending on the video size and performance level 