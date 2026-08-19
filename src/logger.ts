type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

type LoggerOptions = {
  env?: "development" | "production";
};

export class Logger {
  constructor(
    private readonly scope: string,
    private readonly options: LoggerOptions = {},
  ) {}

  debug(message: string, fields: LogFields = {}): void {
    this.write("debug", message, fields);
  }

  info(message: string, fields: LogFields = {}): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields: LogFields = {}): void {
    this.write("warn", message, fields);
  }

  error(message: string, fields: LogFields = {}): void {
    this.write("error", message, fields);
  }

  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`, this.options);
  }

  private write(level: LogLevel, message: string, fields: LogFields): void {
    const env = this.options.env ?? "development";

    if (env === "production" && level === "debug") {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
      ...fields,
    };

    const line =
      env === "development"
        ? this.formatDevelopmentLine(level, message, fields)
        : JSON.stringify(payload);

    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    console.info(line);
  }

  private formatDevelopmentLine(
    level: LogLevel,
    message: string,
    fields: LogFields,
  ): string {
    const fieldsText = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : "";
    return `[${new Date().toISOString()}] ${level.toUpperCase()} ${this.scope} ${message}${fieldsText}`;
  }
}
