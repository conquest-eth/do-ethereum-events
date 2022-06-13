import pino, { BaseLogger, Bindings, LoggerOptions } from 'pino'

export type LogLevel =
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'trace'
  | 'silent'

/**
 * @classdesc Designed to log information in a uniform way to make parsing easier
 */
export class Logger {
  private log: BaseLogger
  constructor(
    private readonly opts: LoggerOptions,
    public readonly forcedLevel?: LogLevel,
  ) {
    this.log = pino(this.opts)
  }

  child(bindings: Bindings, forcedLevel?: LogLevel) {
    return new Logger({ ...this.opts, ...bindings }, forcedLevel)
  }

  debug(msg: string, ctx?: any): void {
    this.print(
      this.forcedLevel ?? 'debug',
      this.forcedLevel ? { ...ctx, intendedLevel: 'debug' } : ctx,
      msg,
    )
  }

  info(msg: string, ctx?: any): void {
    this.print(
      this.forcedLevel ?? 'info',
      this.forcedLevel ? { ...ctx, intendedLevel: 'info' } : ctx,
      msg,
    )
  }

  warn(msg: string, ctx?: any): void {
    this.print(
      this.forcedLevel ?? 'warn',
      this.forcedLevel ? { ...ctx, intendedLevel: 'warn' } : ctx,
      msg,
    )
  }

  error(msg: string, error?: any, ctx?: any): void {
    this.print(
      this.forcedLevel ?? 'error',
      this.forcedLevel
        ? { ...ctx, error, intendedLevel: 'error' }
        : { ...ctx, error },
      msg,
    )
  }

  private print(level: LogLevel, ctx: any = {}, msg: string): void {
    return this.log[level]({ ...ctx }, msg)
  }
}
