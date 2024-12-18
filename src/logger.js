// Description: This file contains the logger class which is responsible for logging messages in the console.
// The logger class is used to log messages in the console based on the configuration settings.
export class Logger {
  // Function: constructor - Initialize the logger with the configuration settings
  constructor(config) {
    this.config = config;
  }

  // Function: log - Log messages in the console
  log(...messages) {
    if (this.config.DEBUG_MODE) {
      console.log(messages);
    }
  }

  // Function: info - Log information messages in the console
  info(...messages) {
    if (this.config.DEBUG_MODE) {
      console.log(messages);
    }
  }

  // Function: debug - Log debug messages in the console
  debug(...messages) {
    if (this.config.DEBUG_MODE) {
      console.debug(messages);
    }
  }

  // Function: error - Log error messages in the console
  error(...messages) {
    if (this.config.DEBUG_MODE) {
      console.error(messages);
    }
  }
}
