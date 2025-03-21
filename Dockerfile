FROM jrottenberg/ffmpeg:4.4-ubuntu

# Install AWS CLI and other dependencies
RUN apt-get update && apt-get install -y \
    python3-pip \
    && pip3 install --no-cache-dir awscli \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy the transcoding script
COPY transcode.sh /app/
RUN chmod +x /app/transcode.sh

# Set the entrypoint
ENTRYPOINT ["/app/transcode.sh"]
