export interface PagerDutyIncident {
  id: string;
  title: string;
  urgency: "high" | "low";
  status: string;
  service: {
    id: string;
    name: string;
  };
  createdAt: string;
  htmlUrl: string;
  alertDetails: string[];
}

export interface ServiceConfig {
  id: string;
  name: string;
  pagerdutyServiceId: string;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  slackChannelId: string;
  logSource: "datadog" | "cloudwatch" | "mock";
  logQuery?: string;
}

export interface LogResult {
  logs: string;
  stackTraces: string[];
  rawLines: number;
  truncated: boolean;
}

export interface LogQuery {
  service: string;
  environment: string;
  startTime: Date;
  endTime: Date;
  severity: "ERROR" | "WARN" | "FATAL";
  maxLines: number;
}

export interface DiagnosisResult {
  rootCause: string;
  affectedFiles: string[];
  proposedChanges: ProposedChange[];
  riskAssessment: "LOW" | "MEDIUM" | "HIGH";
  rollbackPlan: string;
  confidence: number;
  rawOutput: string;
}

export interface ProposedChange {
  filePath: string;
  diff: string;
  explanation: string;
}

export interface IncidentState {
  id: string;
  pagerdutyIncidentId: string;
  title: string;
  urgency: string;
  serviceName: string;
  status: IncidentStatus;
  slackMessageTs?: string;
  slackChannelId?: string;
  diagnosisResult?: DiagnosisResult;
  prUrl?: string;
  prNumber?: number;
  errorMessage?: string;
  startedAt: Date;
  completedAt?: Date;
}

export type IncidentStatus =
  | "RECEIVED"
  | "FETCHING_LOGS"
  | "DIAGNOSING"
  | "GENERATING_FIX"
  | "CREATING_PR"
  | "NOTIFYING"
  | "COMPLETED"
  | "FAILED";

export interface IncidentJobData {
  incidentId: string;
  pagerdutyIncident: PagerDutyIncident;
  serviceConfig: ServiceConfig;
}
