export function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Requested route ${req.method} ${req.originalUrl} was not found`,
    errors: []
  });
}

export function sanitizeErrorMessage(error) {
  if (!error) return 'An unexpected error occurred. Please try again.';
  const msg = String(error.message || '');

  // 1. Prisma & Database transaction timeouts
  if (
    msg.includes('Transaction already closed') ||
    msg.includes('expired transaction') ||
    msg.includes('timeout')
  ) {
    return 'The operation took longer than expected to complete. Please try again.';
  }

  // 2. Prisma invocation / driver / database internal errors
  if (
    msg.includes('invocation:') ||
    msg.includes('prisma.') ||
    msg.includes('PrismaClient') ||
    error.name?.includes('Prisma')
  ) {
    if (error.code === 'P2002' || msg.includes('Unique constraint')) {
      return 'A record with these details already exists.';
    }
    if (
      error.code === 'P2025' ||
      msg.includes('Record to delete does not exist') ||
      msg.includes('Record to update not found')
    ) {
      return 'The requested record was not found or has already been removed.';
    }
    if (error.code === 'P2003' || msg.includes('Foreign key constraint')) {
      return 'This item cannot be deleted because it is linked to other active records.';
    }
    return 'Unable to complete this database action right now. Please try again.';
  }

  // 3. File upload limits
  if (error.code === 'LIMIT_FILE_SIZE') {
    return 'The uploaded image exceeds the 5 MB limit. Please select a smaller photo.';
  }

  // 4. Raw SQL or code syntax dumps
  if (
    msg.includes('SELECT ') ||
    msg.includes('DELETE FROM') ||
    msg.includes('UPDATE ') ||
    msg.includes('SyntaxError') ||
    msg.includes('TypeError')
  ) {
    return 'A system processing error occurred. Please try again.';
  }

  return msg;
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (process.env.NODE_ENV !== 'test') {
    console.error('[Error Handler]', error);
  }

  const uploadTooLarge = error.code === 'LIMIT_FILE_SIZE';
  const status = uploadTooLarge
    ? 413
    : error.status || (/Unique constraint/.test(error.message) ? 409 : 500);

  const cleanMessage = sanitizeErrorMessage(error);

  res.status(status).json({
    success: false,
    message: cleanMessage,
    errorCode: error.code || undefined,
    errorName: error.name || undefined,
    errors: error.errors || []
  });
}
