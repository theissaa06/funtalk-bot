function createLogger(scope = 'app') {
  function write(level, args) {
    const prefix = `[${new Date().toISOString()}] [${level}] [${scope}]`;
    const target = level === 'error' ? console.error : console.log;
    target(prefix, ...args);
  }

  return {
    child(childScope) {
      return createLogger(`${scope}:${childScope}`);
    },
    info(...args) {
      write('info', args);
    },
    warn(...args) {
      write('warn', args);
    },
    error(...args) {
      write('error', args);
    },
  };
}

module.exports = {
  createLogger,
};
