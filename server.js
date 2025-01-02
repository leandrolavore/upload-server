const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const uploadsInProgress = {}; // To track uploads in progress

app.post('/upload', async (req, res) => {
  try {
    const filename = req.headers['x-filename'] || 'uploaded-file';
    const contentRange = req.headers['content-range'];

    if (!contentRange) {
      return res.status(400).send('Content-Range header is required');
    }

    const range = contentRange.match(/bytes (\d+)-(\d+)\/(\d+|\*)/);
    if (!range) {
      return res.status(400).send('Invalid Content-Range header');
    }

    const start = parseInt(range[1], 10); // Start byte of the chunk
    const end = parseInt(range[2], 10); // End byte of the chunk
    const total = range[3] === '*' ? null : parseInt(range[3], 10); // Total file size
    const uploadPath = path.join(__dirname, filename);

    // Ensure the directory exists
    const uploadDir = path.dirname(uploadPath);
    await fs.promises.mkdir(uploadDir, { recursive: true });

    // Initialize or update tracking for the upload
    if (!uploadsInProgress[filename]) {
      uploadsInProgress[filename] = {
        bytesReceived: 0,
        totalSize: total,
      };

      console.log(`Started new upload: ${filename}, total size: ${total}`);
    }

    const uploadInfo = uploadsInProgress[filename];

    // Open or create the file
    let fileHandle;
    try {
      fileHandle = await fs.promises.open(uploadPath, 'r+'); // Open for reading and writing
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log(`File not found, creating new file: ${uploadPath}`);
        fileHandle = await fs.promises.open(uploadPath, 'a+'); // Create if it doesn't exist
      } else {
        throw err;
      }
    }

    // Buffer to hold incoming data
    const buffer = [];

    req.on('data', (chunk) => buffer.push(chunk));

    req.on('end', async () => {
      const data = Buffer.concat(buffer);

      // Write the data to the file at the correct position
      await fileHandle.write(data, 0, data.length, start);
      await fileHandle.close();

      // Update the tracking info
      uploadInfo.bytesReceived += data.length;

      console.log(`Received chunk: ${start}-${end}`);
      console.log(
        `Total received for ${filename}: ${uploadInfo.bytesReceived}/${uploadInfo.totalSize}`
      );

      if (uploadInfo.totalSize && uploadInfo.bytesReceived >= uploadInfo.totalSize) {
        console.log(`Upload complete for ${filename}`);
        delete uploadsInProgress[filename];
        res.status(200).send('File uploaded completely');
      } else {
        res.status(200).send('Chunk uploaded successfully');
      }
    });

    req.on('error', async (err) => {
      console.error(`Error during upload for ${filename}:`, err);
      await fileHandle?.close();
      res.status(500).send('Upload failed');
    });
  } catch (err) {
    console.error('Error during upload:', err);
    res.status(500).send('Upload failed');
  }
});
app.listen(8080, () => {
  console.log('Server is listening on port 8080');
});