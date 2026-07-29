export const JOB_STATUSES = [
  'NEW',
  'RECOMMENDED',
  'VIEWED',
  'APPLIED',
  'SKIPPED',
  'REJECTED',
  'ARCHIVED',
  'EXPIRED',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export function isJobStatus(value: string): value is JobStatus {
  return JOB_STATUSES.some((status) => status === value);
}
