#!/usr/bin/env node

/**
 * Script to download HackTricks content for embeddings database
 * Downloads from:
 * - pentesting-web directory  
 * - network-services-pentesting directory
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';

const BASE_URL = 'https://api.github.com/repos/HackTricks-wiki/hacktricks/contents/src';
const DOWNLOAD_DIR = 'hacktricks-db';

// Create download directories
const dirs = [
  path.join(DOWNLOAD_DIR, 'pentesting-web'),
  path.join(DOWNLOAD_DIR, 'network-services-pentesting')
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Helper function to make API requests
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'HackTricks-Downloader/1.0'
      }
    };
    
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

// Download a single file
async function downloadFile(fileInfo, localPath) {
  console.log(`Downloading: ${fileInfo.name}`);
  
  try {
    const response = await makeRequest(fileInfo.download_url);
    const content = Buffer.from(response, 'base64').toString('utf-8');
    
    // Ensure directory exists
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(localPath, content);
    console.log(`✓ Downloaded: ${fileInfo.name}`);
  } catch (error) {
    console.error(`✗ Failed to download ${fileInfo.name}:`, error.message);
  }
}

// Download raw file content
async function downloadRawFile(downloadUrl, localPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(localPath);
    
    https.get(downloadUrl, (response) => {
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(localPath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

// Recursively download directory contents
async function downloadDirectory(apiUrl, localDir) {
  try {
    console.log(`Fetching directory contents: ${apiUrl}`);
    const contents = await makeRequest(apiUrl);
    
    for (const item of contents) {
      const localPath = path.join(localDir, item.name);
      
      if (item.type === 'file') {
        if (item.name.endsWith('.md')) {
          await downloadRawFile(item.download_url, localPath);
          console.log(`✓ Downloaded: ${item.name}`);
        }
      } else if (item.type === 'dir') {
        // Create subdirectory
        if (!fs.existsSync(localPath)) {
          fs.mkdirSync(localPath, { recursive: true });
        }
        // Recursively download subdirectory
        await downloadDirectory(item.url, localPath);
      }
    }
  } catch (error) {
    console.error(`Error downloading directory ${apiUrl}:`, error.message);
  }
}

async function main() {
  console.log('Starting HackTricks content download...');
  
  const downloads = [
    {
      name: 'pentesting-web',
      url: `${BASE_URL}/pentesting-web`,
      localDir: path.join(DOWNLOAD_DIR, 'pentesting-web')
    },
    {
      name: 'network-services-pentesting', 
      url: `${BASE_URL}/network-services-pentesting`,
      localDir: path.join(DOWNLOAD_DIR, 'network-services-pentesting')
    }
  ];
  
  for (const download of downloads) {
    console.log(`\n=== Downloading ${download.name} ===`);
    await downloadDirectory(download.url, download.localDir);
  }
  
  console.log('\n✅ Download complete!');
  
  // Create metadata file
  const metadata = {
    downloadDate: new Date().toISOString(),
    source: 'https://github.com/HackTricks-wiki/hacktricks',
    directories: downloads.map(d => d.name),
    totalFiles: 0
  };
  
  // Count downloaded files
  dirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      const files = execSync(`find "${dir}" -name "*.md" | wc -l`, { encoding: 'utf8' }).trim();
      metadata.totalFiles += parseInt(files);
    }
  });
  
  fs.writeFileSync(path.join(DOWNLOAD_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2));
  console.log(`\n📊 Downloaded ${metadata.totalFiles} files total`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { downloadDirectory, downloadRawFile }; 