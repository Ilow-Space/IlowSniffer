// Logger utility for consistent logging across the extension

const LOG_LEVELS = {
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
};

// Default to INFO if not specified
const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO; // Change this for development

function log(level, message, ...optionalParams) {
  if (level < CURRENT_LOG_LEVEL) return; // Simple level filtering

  const prefix = `[IlowAgent][${level}]`;
  switch (level) {
    case LOG_LEVELS.DEBUG:
      console.debug(prefix, message, ...optionalParams);
      break;
    case LOG_LEVELS.INFO:
      console.info(prefix, message, ...optionalParams);
      break;
    case LOG_LEVELS.WARN:
      console.warn(prefix, message, ...optionalParams);
      break;
    case LOG_LEVELS.ERROR:
      console.error(prefix, message, ...optionalParams);
      break;
    default:
      console.log(prefix, message, ...optionalParams);
  }
}

export const logger = {
  debug: (...args) => log(LOG_LEVELS.DEBUG, ...args),
  info: (...args) => log(LOG_LEVELS.INFO, ...args),
  warn: (...args) => log(LOG_LEVELS.WARN, ...args),
  error: (...args) => log(LOG_LEVELS.ERROR, ...args),
};
