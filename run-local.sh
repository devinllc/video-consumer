#!/bin/bash
# run-local.sh - Script to run the application locally

# Prompt for AWS credentials
read -p "Enter your AWS Access Key ID: " AWS_ACCESS_KEY_ID
read -sp "Enter your AWS Secret Access Key: " AWS_SECRET_ACCESS_KEY
echo
read -p "Enter your AWS Region: " AWS_REGION
read -p "Enter your S3 Bucket Name: " S3_BUCKET_NAME

# Export environment variables
export AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
export AWS_REGION=$AWS_REGION
export S3_BUCKET_NAME=$S3_BUCKET_NAME

# Run the application
echo "Starting video consumer application..."
npm start 