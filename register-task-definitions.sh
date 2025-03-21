#!/bin/bash

# Get AWS account ID from the cluster ARN
ACCOUNT_ID="767828740984"
REGION="ap-south-1"
S3_BUCKET="trisha.vid.ip"

# Function to create task definition JSON
create_task_definition() {
    local family=$1
    local cpu=$2
    local memory=$3
    local image=$4

    cat << EOF > "${family}.json"
{
    "family": "${family}",
    "networkMode": "awsvpc",
    "requiresCompatibilities": [
        "FARGATE"
    ],
    "cpu": "${cpu}",
    "memory": "${memory}",
    "executionRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskExecutionRole",
    "taskRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskExecutionRole",
    "containerDefinitions": [
        {
            "name": "video-transcoder",
            "image": "${image}",
            "essential": true,
            "cpu": ${cpu},
            "memory": ${memory},
            "environment": [
                {
                    "name": "AWS_REGION",
                    "value": "${REGION}"
                },
                {
                    "name": "BUCKET_NAME",
                    "value": "${S3_BUCKET}"
                }
            ],
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": {
                    "awslogs-group": "/ecs/video-transcoder",
                    "awslogs-region": "${REGION}",
                    "awslogs-stream-prefix": "ecs"
                }
            }
        }
    ]
}
EOF
}

# Create and register task definitions for each performance level
create_task_definition "video-transcoder-small" "1024" "2048" "767828740984.dkr.ecr.ap-south-1.amazonaws.com/sasa-trnscd:latest"
aws ecs register-task-definition --cli-input-json file://video-transcoder-small.json

create_task_definition "video-transcoder-medium" "2048" "4096" "767828740984.dkr.ecr.ap-south-1.amazonaws.com/sasa-trnscd:latest"
aws ecs register-task-definition --cli-input-json file://video-transcoder-medium.json

create_task_definition "video-transcoder-large" "4096" "8192" "767828740984.dkr.ecr.ap-south-1.amazonaws.com/sasa-trnscd:latest"
aws ecs register-task-definition --cli-input-json file://video-transcoder-large.json

# Clean up temporary files
rm video-transcoder-small.json video-transcoder-medium.json video-transcoder-large.json

echo "Task definitions registered successfully!" 