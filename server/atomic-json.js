const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function fsyncDirectoryBestEffort(directoryPath) {
  let dirFd = null;
  try {
    dirFd = fs.openSync(directoryPath, 'r');
    fs.fsyncSync(dirFd);
  } catch {
    // Directory fsync is not supported on every platform/filesystem.
  } finally {
    if (dirFd !== null) {
      try {
        fs.closeSync(dirFd);
      } catch {
        // Best-effort durability only.
      }
    }
  }
}

function createTempFilePath(targetPath) {
  const directoryPath = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const uniqueId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return path.join(directoryPath, `.${baseName}.${process.pid}.${uniqueId}.tmp`);
}

function atomicWriteFileSync(targetPath, contents, options = 'utf8') {
  const directoryPath = path.dirname(targetPath);
  fs.mkdirSync(directoryPath, { recursive: true });

  const tempPath = createTempFilePath(targetPath);
  let fileFd = null;

  try {
    fileFd = fs.openSync(tempPath, 'wx');
    fs.writeFileSync(fileFd, contents, options);
    fs.fsyncSync(fileFd);
    fs.closeSync(fileFd);
    fileFd = null;

    fs.renameSync(tempPath, targetPath);
    fsyncDirectoryBestEffort(directoryPath);
  } catch (error) {
    if (fileFd !== null) {
      try {
        fs.closeSync(fileFd);
      } catch {
        // Preserve the original write/rename error.
      }
    }
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

function atomicWriteJsonFileSync(targetPath, value) {
  atomicWriteFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

module.exports = {
  atomicWriteFileSync,
  atomicWriteJsonFileSync,
  fsyncDirectoryBestEffort,
};
