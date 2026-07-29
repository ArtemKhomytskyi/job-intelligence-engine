import type { LogFields, Logger } from '../../application/index.js';

export class StreamLogger implements Logger {
  public constructor(
    private readonly write: (value: string) => void,
    private readonly verbose = false,
  ) {}
  public debug(message: string, fields?: LogFields): void {
    if (this.verbose) this.emit('debug', message, fields);
  }
  public info(message: string, fields?: LogFields): void {
    this.emit('info', message, fields);
  }
  public warn(message: string, fields?: LogFields): void {
    this.emit('warn', message, fields);
  }
  public error(message: string, fields?: LogFields): void {
    this.emit('error', message, fields);
  }
  private emit(level: string, message: string, fields?: LogFields): void {
    this.write(`${JSON.stringify({ level, message, ...fields })}\n`);
  }
}
