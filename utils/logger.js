const fs = require('fs');
const path = require('path');

/**
 * Logger Utility Class for Facebook Social Graph Viewer
 *
 * Features:
 * - Logs to both console (with colors) and file (plain text)
 * - Support for DEBUG, INFO, WARN, ERROR log levels
 * - Automatic log file creation with timestamp-based naming
 * - Structured data logging support
 * - Singleton pattern for easy usage
 */

// ANSI color codes for console output
const Colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

// Log level configuration
const LogLevels = {
  DEBUG: { priority: 0, label: 'DEBUG', color: Colors.gray },
  INFO: { priority: 1, label: 'INFO ', color: Colors.cyan },
  WARN: { priority: 2, label: 'WARN ', color: Colors.yellow },
  ERROR: { priority: 3, label: 'ERROR', color: Colors.red },
};

class Logger {
  /**
   * Create a new Logger instance
   * @param {Object} options - Configuration options
   * @param {string} options.logDir - Directory for log files (default: 'logs')
   * @param {string} options.prefix - Prefix for log filename (default: 'scraper')
   * @param {string} options.minLevel - Minimum log level to output (default: 'DEBUG')
   * @param {boolean} options.consoleEnabled - Enable console output (default: true)
   * @param {boolean} options.fileEnabled - Enable file output (default: true)
   */
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(process.cwd(), 'logs');
    this.prefix = options.prefix || 'scraper';
    this.minLevel = options.minLevel || 'DEBUG';
    this.consoleEnabled = options.consoleEnabled !== false;
    this.fileEnabled = options.fileEnabled !== false;

    this.logFilePath = null;
    this.writeStream = null;

    if (this.fileEnabled) {
      this._initLogFile();
    }
  }

  /**
   * Initialize the log file and directory
   * @private
   */
  _initLogFile() {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Generate timestamp-based filename
    const now = new Date();
    const timestamp = this._formatDateForFilename(now);
    const filename = `${this.prefix}-${timestamp}.log`;
    this.logFilePath = path.join(this.logDir, filename);

    // Create write stream for appending to log file
    this.writeStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });

    // Write header to log file
    const header = `\n${'='.repeat(60)}\nLog started at: ${now.toISOString()}\n${'='.repeat(60)}\n\n`;
    this.writeStream.write(header);
  }

  /**
   * Format date for filename (YYYY-MM-DD-HHmmss)
   * @private
   */
  _formatDateForFilename(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
  }

  /**
   * Format timestamp for log entries
   * @private
   */
  _formatTimestamp(date) {
    return date.toISOString();
  }

  /**
   * Check if a log level should be output based on minimum level setting
   * @private
   */
  _shouldLog(level) {
    const currentPriority = LogLevels[level]?.priority ?? 0;
    const minPriority = LogLevels[this.minLevel]?.priority ?? 0;
    return currentPriority >= minPriority;
  }

  /**
   * Format a message for console output (with colors)
   * @private
   */
  _formatConsoleMessage(level, timestamp, message) {
    const levelConfig = LogLevels[level];
    const coloredLevel = `${levelConfig.color}${Colors.bright}[${levelConfig.label}]${Colors.reset}`;
    const coloredTimestamp = `${Colors.dim}${timestamp}${Colors.reset}`;

    return `${coloredTimestamp} ${coloredLevel} ${message}`;
  }

  /**
   * Format a message for file output (plain text)
   * @private
   */
  _formatFileMessage(level, timestamp, message) {
    const levelLabel = LogLevels[level].label;
    return `${timestamp} [${levelLabel}] ${message}`;
  }

  /**
   * Core logging method
   * @private
   */
  _log(level, message) {
    if (!this._shouldLog(level)) {
      return;
    }

    const timestamp = this._formatTimestamp(new Date());

    // Console output
    if (this.consoleEnabled) {
      const consoleMessage = this._formatConsoleMessage(level, timestamp, message);
      if (level === 'ERROR') {
        console.error(consoleMessage);
      } else if (level === 'WARN') {
        console.warn(consoleMessage);
      } else {
        console.log(consoleMessage);
      }
    }

    // File output
    if (this.fileEnabled && this.writeStream) {
      const fileMessage = this._formatFileMessage(level, timestamp, message);
      this.writeStream.write(fileMessage + '\n');
    }
  }

  /**
   * Log a debug message
   * @param {string} message - The message to log
   */
  debug(message) {
    this._log('DEBUG', message);
  }

  /**
   * Log an info message
   * @param {string} message - The message to log
   */
  info(message) {
    this._log('INFO', message);
  }

  /**
   * Log a warning message
   * @param {string} message - The message to log
   */
  warn(message) {
    this._log('WARN', message);
  }

  /**
   * Log an error message
   * @param {string|Error} message - The message or Error object to log
   */
  error(message) {
    if (message instanceof Error) {
      this._log('ERROR', `${message.message}\n${message.stack}`);
    } else {
      this._log('ERROR', message);
    }
  }

  /**
   * Log structured data (objects) with nice formatting
   * @param {string} label - Label for the data
   * @param {Object} data - The data object to log
   * @param {string} level - Log level (default: 'DEBUG')
   */
  data(label, data, level = 'DEBUG') {
    const formattedData = JSON.stringify(data, null, 2);
    const message = `${label}:\n${formattedData}`;
    this._log(level, message);
  }

  /**
   * Log a progress message (useful for scraping progress)
   * @param {number} current - Current count
   * @param {number} total - Total count
   * @param {string} message - Additional message
   */
  progress(current, total, message) {
    const progressStr = `[${current}/${total}]`;
    this.info(`${progressStr} ${message}`);
  }

  /**
   * Log a separator line (useful for visual organization)
   * @param {string} char - Character to use for separator (default: '-')
   * @param {number} length - Length of separator (default: 50)
   */
  separator(char = '-', length = 50) {
    const line = char.repeat(length);
    this._log('INFO', line);
  }

  /**
   * Log a section header
   * @param {string} title - Section title
   */
  section(title) {
    this.separator('=', 60);
    this.info(title);
    this.separator('=', 60);
  }

  /**
   * Set the minimum log level
   * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
   */
  setLevel(level) {
    if (LogLevels[level]) {
      this.minLevel = level;
    } else {
      this.warn(`Invalid log level: ${level}. Using DEBUG.`);
      this.minLevel = 'DEBUG';
    }
  }

  /**
   * Get the path to the current log file
   * @returns {string|null} Path to log file or null if file logging is disabled
   */
  getLogFilePath() {
    return this.logFilePath;
  }

  /**
   * Close the logger and flush any pending writes
   */
  close() {
    if (this.writeStream) {
      const footer = `\n${'='.repeat(60)}\nLog ended at: ${new Date().toISOString()}\n${'='.repeat(60)}\n`;
      this.writeStream.write(footer);
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}

// Create singleton instance for easy use
const defaultLogger = new Logger();

// Export both the singleton and the class
module.exports = defaultLogger;
module.exports.Logger = Logger;
module.exports.LogLevels = LogLevels;
module.exports.Colors = Colors;
