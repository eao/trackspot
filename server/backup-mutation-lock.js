let activeBackupMutation = null;
let activeAppMutations = 0;

function createConflictError(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function isReadOnlyRequest(req) {
  return req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
}

function beginBackupMutation(operation) {
  if (activeBackupMutation) {
    throw createConflictError(`A backup ${activeBackupMutation} is already in progress.`);
  }
  if (activeAppMutations > 0) {
    throw createConflictError('An app update is already in progress. Please retry the backup operation after it finishes.');
  }
  activeBackupMutation = operation;
}

function endBackupMutation(operation) {
  if (activeBackupMutation === operation) {
    activeBackupMutation = null;
  }
}

function beginAppMutation() {
  if (activeBackupMutation) {
    throw createConflictError(`A backup ${activeBackupMutation} is already in progress. Please retry after it finishes.`);
  }

  activeAppMutations += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    activeAppMutations = Math.max(0, activeAppMutations - 1);
  };
}

function trackNonBackupMutation(req, res, next) {
  if (isReadOnlyRequest(req)) return next();

  let endMutation;
  try {
    endMutation = beginAppMutation();
  } catch (error) {
    return res.status(error.status || 409).json({ error: error.message });
  }

  const finish = () => {
    res.off('finish', finish);
    res.off('close', finish);
    endMutation();
  };
  res.once('finish', finish);
  res.once('close', finish);

  return next();
}

function getBackupMutationState() {
  return {
    activeBackupMutation,
    activeAppMutations,
  };
}

module.exports = {
  beginAppMutation,
  beginBackupMutation,
  endBackupMutation,
  getBackupMutationState,
  trackNonBackupMutation,
};
