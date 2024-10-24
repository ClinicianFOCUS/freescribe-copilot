import { getConfig } from "./config.js";

export class Logger {
  constructor() {}

  static log(...messages) {
    let logging = getConfig("DEBUG_MODE");

    if (logging) {
      console.log(messages);
    }
  }

  static info(...messages) {
    let logging = getConfig("DEBUG_MODE");

    if (logging) {
      console.log(messages);
    }
  }

  static debug(...messages) {
    let logging = getConfig("DEBUG_MODE");

    if (logging) {
      console.debug(messages);
    }
  }

  static error(...messages) {
    let logging = getConfig("DEBUG_MODE");

    if (logging) {
      console.error(messages);
    }
  }
}
