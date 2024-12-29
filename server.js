const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const uploadsInProgress = {}; // To track uploads in progress

app.post('/upload', async (req, res) => {
  try {
    const filename = req.headers['x-filename'] || 'uploaded-file';
    console.log("filename", filename);

    const contentRange = req.headers['content-range'];

    if (!contentRange) {
      return res.status(400).send('Content-Range header is required');
    }
    console.log("contentRange", contentRange);

    const contentLength = req.headers['content-length'];

    if (!contentLength) {
      return res.status(400).send('Content-Range header is required');
    }
    console.log("contentLength", contentLength);

    console.log("filename:", filename);
    console.log("contentRange:", contentRange);
    console.log("contentLength:", contentLength);


    const range = contentRange.match(/bytes (\d+)-(\d+)\/(\d+|\*)/);
    if (!range) {
      return res.status(400).send('Invalid Content-Range header');
    }

    const start = parseInt(range[1], 10); // Start byte of the chunk
    const end = parseInt(range[2], 10); // End byte of the chunk
    const total = range[3] === '*' ? null : parseInt(range[3], 10); // Total file size

    const uploadPath = path.join(__dirname, filename);

    // Track the upload progress
    if (!uploadsInProgress[filename]) {
      uploadsInProgress[filename] = {
        bytesReceived: 0,
        totalSize: total,
      };

      if (total) {
        // Use truncate to preallocate file size
        await fs.promises.truncate(uploadPath, total);
        console.log(`Preallocated file ${filename} with size ${total} bytes`);
      } else {
        // Create an empty file for unknown total size
        await fs.promises.writeFile(uploadPath, Buffer.alloc(0));
        console.log(`Created empty file ${filename}`);
      }
    }

    const fileHandle = await fs.promises.open(uploadPath, 'r+');
    const buffer = [];

    req.on('data', chunk => buffer.push(chunk));
    req.on('end', async () => {
      const data = Buffer.concat(buffer);
      await fileHandle.write(data, 0, data.length, start);
      await fileHandle.close();

      uploadsInProgress[filename].bytesReceived += data.length;
      if (total) uploadsInProgress[filename].totalSize = total;

      console.log(`Received chunk: ${start}-${end}`);
      console.log(`Total received: ${uploadsInProgress[filename].bytesReceived}/${total}`);

      if (uploadsInProgress[filename].totalSize && uploadsInProgress[filename].bytesReceived >= total) {
        console.log(`Upload complete for ${filename}`);
        delete uploadsInProgress[filename];
        res.status(200).send('File uploaded completely');
      } else {
        res.status(200).send('Chunk uploaded successfully');
      }
    });
    req.on('error', async (err) => {
      console.error('Error during upload:', err);
      await fileHandle.close();
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