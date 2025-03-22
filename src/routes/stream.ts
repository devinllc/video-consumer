import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * Stream a local video file with proper CORS and range headers
 * This endpoint supports HLS streaming of .m3u8 and .ts files
 */
router.get('/:fileType/:fileName', (req: Request, res: Response): void => {
    const { fileType, fileName } = req.params;
    let filePath: string;

    // Validate file type for security
    if (fileType !== 'm3u8' && fileType !== 'ts') {
        res.status(400).json({ error: 'Invalid file type requested' });
        return;
    }

    // Determine the file path based on the file type
    if (fileType === 'm3u8') {
        filePath = path.join(process.cwd(), 'uploads', fileName);
    } else {
        // For TS files
        filePath = path.join(process.cwd(), 'uploads', fileName);
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'File not found' });
        return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Set content type based on file extension
    if (fileType === 'm3u8') {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (fileType === 'ts') {
        res.setHeader('Content-Type', 'video/mp2t');
    }

    // Set CORS headers for streaming content
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    res.setHeader('Accept-Ranges', 'bytes');

    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    // For m3u8 files, we don't need to support range requests
    if (fileType === 'm3u8') {
        res.setHeader('Content-Length', fileSize);
        fs.createReadStream(filePath).pipe(res);
        return;
    }

    // Handle range requests for ts segments
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': chunksize,
            'Cache-Control': 'max-age=86400'  // Cache TS segments for 1 day
        });

        fileStream.pipe(res);
    } else {
        // No range requested, send entire file
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Cache-Control': 'max-age=86400'  // Cache TS segments for 1 day
        });
        fs.createReadStream(filePath).pipe(res);
    }
});

export default router; 