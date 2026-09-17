// A tiny structured logger. I did not want to pull in Winston/Pino for a service
// this small, but I still want one-line JSON logs that a log aggregator could parse.
// Each line carries a level, a message, a timestamp and any extra fields.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function emit(level, message, fields = {}) {
  if (LEVELS[level] > activeLevel) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  };
  // Route errors to stderr, everything else to stdout.
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(JSON.stringify(line) + '\n');
}

module.exports = {
  error: (msg, fields) => emit('error', msg, fields),
  warn: (msg, fields) => emit('warn', msg, fields),
  info: (msg, fields) => emit('info', msg, fields),
  debug: (msg, fields) => emit('debug', msg, fields),
};
