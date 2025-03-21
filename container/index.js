const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('node:path');
const ffmpeg = require("fluent-ffmpeg");
const stream = require('stream');
const { promisify } = require('util');
const { mkdirSync } = require('fs');

const pipeline = promisify(stream.pipeline);

// Updated resolution list with 1080p, 2K, and 4K
const RESOLUTIONS = [
    { name: "360p", width: 480, height: 360, bandwidth: 676800 },
    { name: "480p", width: 854, height: 480, bandwidth: 1353600 },
    { name: "720p", width: 1280, height: 720, bandwidth: 3230400 },
    { name: "1080p", width: 1920, height: 1080, bandwidth: 6086400 },
    { name: "2K", width: 2560, height: 1440, bandwidth: 9100800 },
    { name: "4K", width: 3840, height: 2160, bandwidth: 17408000 },
];

const BUCKET_NAME = process.env.BUCKET_NAME;
const KEY = process.env.KEY;
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

const s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
});

async function uploadFileToS3(filePath, s3Key) {
    try {
        const uploadCommand = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: fs.createReadStream(filePath),
        });
        await s3Client.send(uploadCommand);
        console.log(`Uploaded ${s3Key} successfully.`);
    } catch (err) {
        console.error(`Error uploading ${s3Key}:`, err);
        throw err; // Re-throw to handle errors in the calling code
    }
}

// Function to generate master playlist with S3 URLs
async function generateMasterPlaylist(mp4FileName, outputFolder) {
    console.log(`HLS master m3u8 playlist generating`);

    const variantPlaylists = RESOLUTIONS.map((resolution) => {
        return {
            resolution: `${resolution.width}x${resolution.height}`,
            outputFileName: `https://s3.${AWS_REGION}.amazonaws.com/${BUCKET_NAME}/${outputFolder}${resolution.name}/index.m3u8`,
        };
    });

    let masterPlaylist = variantPlaylists
        .map((variantPlaylist) => {
            const { resolution, outputFileName } = variantPlaylist;
            const bandwidth =
                resolution === '480x360'
                    ? 676800
                    : resolution === '854x480'
                        ? 1353600
                        : resolution === '1280x720'
                            ? 3230400
                            : resolution === '1920x1080'
                                ? 6086400
                                : resolution === '2560x1440'
                                    ? 9100800
                                    : 17408000; // for 4K
            return `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}\n${outputFileName}`;
        })
        .join('\n');
    masterPlaylist = `#EXTM3U\n` + masterPlaylist;

    const masterPlaylistFileName = `${mp4FileName.replace('.', '_')}_master.m3u8`;
    const masterPlaylistPath = path.join('output', masterPlaylistFileName);

    // Ensure the output directory exists
    const outputDir = path.dirname(masterPlaylistPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(masterPlaylistPath, masterPlaylist);
    console.log(`HLS master m3u8 playlist generated`);

    // Upload master playlist to S3
    const s3Key = `${outputFolder}${masterPlaylistFileName}`;
    await uploadFileToS3(masterPlaylistPath, s3Key);
    console.log(`Master playlist uploaded successfully.`);
}

async function init() {
    try {
        // Validate environment variables
        if (!BUCKET_NAME || !KEY || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
            throw new Error('Missing required environment variables');
        }

        // Download original video from S3
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: KEY,
        });
        const result = await s3Client.send(command);

        // Extract video name (without extension) for the folder structure
        const videoName = path.basename(KEY, path.extname(KEY));

        const originalFilePath = `original-video.mp4`;
        const originalVideoPath = path.resolve(originalFilePath);

        // Save the object body stream to a file
        await pipeline(result.Body, fs.createWriteStream(originalFilePath));

        console.log("Downloaded original video successfully.");

        // Define the 'output' folder
        const outputFolder = `output/${videoName}/`;

        // Start the HLS transcoding process for each resolution
        const promises = RESOLUTIONS.map(resolution => {
            const hlsFolder = path.resolve(`hls-${resolution.name}`);
            mkdirSync(hlsFolder, { recursive: true });

            const output = path.join(hlsFolder, 'index.m3u8');

            return new Promise((resolve, reject) => {
                ffmpeg(originalVideoPath)
                    .output(output)
                    .withVideoCodec("libx264")
                    .audioCodec("aac")
                    .withSize(`${resolution.width}x${resolution.height}`)
                    .addOption('-hls_time', '10') // segment duration in seconds
                    .addOption('-hls_list_size', '0') // ensure all segments are listed
                    .addOption('-hls_segment_filename', path.join(hlsFolder, 'segment_%03d.ts')) // segment pattern
                    .on('end', async () => {
                        try {
                            // Upload HLS manifest (.m3u8) and segments (.ts) to S3
                            const files = fs.readdirSync(hlsFolder);

                            const uploadPromises = files.map(file => {
                                const filePath = path.join(hlsFolder, file);
                                const s3Key = `${outputFolder}${resolution.name}/${file}`; // Upload to /output/<video-name>/<resolution>/
                                return uploadFileToS3(filePath, s3Key);
                            });

                            await Promise.all(uploadPromises);
                            console.log(`Uploaded HLS files for ${resolution.name}`);
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    })
                    .on('error', (err) => {
                        console.error(`Error processing HLS for ${resolution.name}:`, err);
                        reject(err);
                    })
                    .format('hls')
                    .run();
            });
        });

        await Promise.all(promises);

        // Generate and upload the master playlist
        await generateMasterPlaylist(videoName, outputFolder);

        console.log("All videos transcoded to HLS and uploaded successfully.");
    } catch (error) {
        console.error("Error during transcoding process:", error);
        process.exit(1); // Exit with error code
    } finally {
        process.exit(0);
    }
}

init();
