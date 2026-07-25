// Wraps an async Express route handler so a rejected promise (e.g. a failed
// database query) gets passed to Express's error-handling middleware instead
// of becoming an unhandled promise rejection that crashes the entire server.
//
// Without this, ONE broken query — a missing column, a typo, a migration
// that hasn't run yet — takes down every route on the server, not just the
// one that failed, because Node kills the whole process on an unhandled
// rejection. With this, a broken route returns a clean 500 to just the
// person hitting it, and everything else keeps working.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
