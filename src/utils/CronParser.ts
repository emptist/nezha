export interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

export class CronParser {
  private parts: CronParts;

  constructor(expression: string) {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: ${expression}. Expected 5 parts.`);
    }
    this.parts = {
      minute: parts[0] ?? '*',
      hour: parts[1] ?? '*',
      dayOfMonth: parts[2] ?? '*',
      month: parts[3] ?? '*',
      dayOfWeek: parts[4] ?? '*',
    };
  }

  private parseField(field: string, min: number, max: number, current: number): number {
    if (field === '*') return current;

    if (field.includes(',')) {
      const values = field.split(',').map(f => this.parseField(f, min, max, current));
      const found = values.find(v => v >= current);
      return found ?? values[0] ?? current;
    }

    if (field.includes('/')) {
      const rangePart = field.split('/')[0] ?? '';
      const step = field.split('/')[1] ?? '1';
      const stepNum = parseInt(step, 10) || 1;
      if (rangePart === '*') {
        return Math.ceil(current / stepNum) * stepNum;
      }
      const rangeParts = rangePart.split('-');
      const startStr = rangeParts[0] ?? '0';
      const start = parseInt(startStr, 10) || 0;
      return start + Math.floor((current - start) / stepNum) * stepNum;
    }

    if (field.includes('-')) {
      const rangeParts = field.split('-');
      const startStr = rangeParts[0] ?? '0';
      const endStr = rangeParts[1] ?? startStr;
      const start = parseInt(startStr, 10) || 0;
      const end = parseInt(endStr, 10) || start;
      if (current < start) return start;
      if (current <= end) return current;
      return start;
    }

    return parseInt(field, 10) || current;
  }

  nextRun(from: Date = new Date()): Date {
    const next = new Date(from);
    next.setSeconds(0);
    next.setMilliseconds(0);
    next.setMinutes(next.getMinutes() + 1);

    for (let i = 0; i < 60 * 24 * 366; i++) {
      const month = this.parseField(this.parts.month, 1, 12, next.getMonth() + 1);
      const dayOfMonth = this.parseField(this.parts.dayOfMonth, 1, 31, next.getDate());
      const dayOfWeek = this.parseField(this.parts.dayOfWeek, 0, 6, next.getDay());
      const hour = this.parseField(this.parts.hour, 0, 23, next.getHours());
      const minute = this.parseField(this.parts.minute, 0, 59, next.getMinutes());

      if (month !== next.getMonth() + 1) {
        next.setMonth(month - 1);
        next.setDate(1);
        next.setHours(0);
        next.setMinutes(0);
        continue;
      }

      if (dayOfMonth !== next.getDate() && this.parts.dayOfMonth !== '*') {
        next.setDate(dayOfMonth);
        next.setHours(0);
        next.setMinutes(0);
        continue;
      }

      if (
        dayOfWeek !== next.getDay() &&
        this.parts.dayOfWeek !== '*' &&
        this.parts.dayOfMonth === '*'
      ) {
        next.setDate(next.getDate() + 1);
        next.setHours(0);
        next.setMinutes(0);
        continue;
      }

      if (hour !== next.getHours()) {
        next.setHours(hour);
        next.setMinutes(0);
        continue;
      }

      if (minute !== next.getMinutes()) {
        next.setMinutes(minute);
        continue;
      }

      return next;
    }

    throw new Error('Could not calculate next run time');
  }

  static getDescription(expression: string): string {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return 'Invalid expression';

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    if (
      minute === '0' &&
      hour === '*' &&
      dayOfMonth === '*' &&
      month === '*' &&
      dayOfWeek === '*'
    ) {
      return 'Every hour';
    }
    if (
      minute === '0' &&
      hour === '9' &&
      dayOfMonth === '*' &&
      month === '*' &&
      dayOfWeek === '*'
    ) {
      return 'Daily at 9:00 AM';
    }
    if (
      minute === '0' &&
      hour === '0' &&
      dayOfMonth === '*' &&
      month === '*' &&
      dayOfWeek === '*'
    ) {
      return 'Daily at midnight';
    }
    if (
      minute === '0' &&
      hour === '*' &&
      dayOfMonth === '*' &&
      month === '*' &&
      dayOfWeek === '0'
    ) {
      return 'Every hour on Sunday';
    }
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5' && minute !== undefined) {
      const hourStr = hour ?? '0';
      const minuteStr = minute;
      return `Weekdays at ${hourStr}:${minuteStr.padStart(2, '0')}`;
    }

    return expression;
  }
}
