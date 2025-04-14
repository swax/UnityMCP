import { mkdir, cp } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const src = path.join(rootDir, 'src', 'resources', 'text');
const dest = path.join(rootDir, 'build', 'resources', 'text');

async function copyResources() {
  try {
    // Ensure the destination directory exists
    await mkdir(dirname(dest), { recursive: true });
    
    // Copy files recursively
    await cp(src, dest, { recursive: true, force: true });
    
    console.log(`Successfully copied ${src} to ${dest}`);
  } catch (err) {
    console.error('Error copying resources:', err);
    process.exit(1);
  }
}

copyResources();
