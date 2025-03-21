#!/bin/bash

# Exit on any error
set -e

# Check required environment variables
if [ -z "$BUCKET_NAME" ] || [ -z "$KEY" ] || [ -z "$AWS_REGION" ]; then
    echo "Error: Required environment variables BUCKET_NAME, KEY, and AWS_REGION must be set"
    exit 1
fi

# Set up variables
INPUT_FILE="input.mp4"
OUTPUT_DIR="output"
MANIFEST_FILE="$OUTPUT_DIR/playlist.m3u8"

# Create output directory
mkdir -p $OUTPUT_DIR

# Download input file from S3
echo "Downloading input file from S3..."
aws s3 cp "s3://$BUCKET_NAME/$KEY" "$INPUT_FILE"

# Get video duration
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$INPUT_FILE")
echo "Video duration: $DURATION seconds"

# Create HLS segments with multiple quality levels
echo "Starting transcoding..."

# 1080p (if source is large enough)
ffmpeg -i "$INPUT_FILE" \
    -vf "scale=w=1920:h=1080:force_original_aspect_ratio=decrease" \
    -c:v h264 -profile:v main -crf 20 -sc_threshold 0 \
    -g 48 -keyint_min 48 \
    -c:a aac -b:a 192k \
    -hls_time 4 \
    -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/1080p_%03d.ts" \
    "$OUTPUT_DIR/1080p.m3u8" &

# 720p
ffmpeg -i "$INPUT_FILE" \
    -vf "scale=w=1280:h=720:force_original_aspect_ratio=decrease" \
    -c:v h264 -profile:v main -crf 22 -sc_threshold 0 \
    -g 48 -keyint_min 48 \
    -c:a aac -b:a 128k \
    -hls_time 4 \
    -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/720p_%03d.ts" \
    "$OUTPUT_DIR/720p.m3u8" &

# 480p
ffmpeg -i "$INPUT_FILE" \
    -vf "scale=w=854:h=480:force_original_aspect_ratio=decrease" \
    -c:v h264 -profile:v main -crf 23 -sc_threshold 0 \
    -g 48 -keyint_min 48 \
    -c:a aac -b:a 96k \
    -hls_time 4 \
    -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/480p_%03d.ts" \
    "$OUTPUT_DIR/480p.m3u8" &

# 360p
ffmpeg -i "$INPUT_FILE" \
    -vf "scale=w=640:h=360:force_original_aspect_ratio=decrease" \
    -c:v h264 -profile:v main -crf 23 -sc_threshold 0 \
    -g 48 -keyint_min 48 \
    -c:a aac -b:a 96k \
    -hls_time 4 \
    -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/360p_%03d.ts" \
    "$OUTPUT_DIR/360p.m3u8"

# Wait for all background jobs to complete
wait

# Create master playlist
echo "#EXTM3U" > "$MANIFEST_FILE"
echo "#EXT-X-VERSION:3" >> "$MANIFEST_FILE"

# Add quality variants
echo "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080" >> "$MANIFEST_FILE"
echo "1080p.m3u8" >> "$MANIFEST_FILE"
echo "#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720" >> "$MANIFEST_FILE"
echo "720p.m3u8" >> "$MANIFEST_FILE"
echo "#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480" >> "$MANIFEST_FILE"
echo "480p.m3u8" >> "$MANIFEST_FILE"
echo "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360" >> "$MANIFEST_FILE"
echo "360p.m3u8" >> "$MANIFEST_FILE"

# Upload transcoded files to S3
echo "Uploading transcoded files to S3..."
aws s3 cp "$OUTPUT_DIR" "s3://$BUCKET_NAME/hls/${KEY%.*}" --recursive

# Clean up
rm -rf "$INPUT_FILE" "$OUTPUT_DIR"

echo "Transcoding completed successfully!" 