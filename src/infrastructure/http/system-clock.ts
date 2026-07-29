import type { Clock } from '../../application/index.js';

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}
