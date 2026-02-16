import type { PagerDutyIncident, LogResult, ServiceConfig } from "../types.js";

/**
 * Builds a structured prompt file for Cline CLI to diagnose an incident.
 * This prompt is the primary interface between the orchestrator and Cline.
 */
export function buildDiagnosisPrompt(
  incident: PagerDutyIncident,
  logs: LogResult,
  serviceConfig: ServiceConfig
): string {
  const stackSection =
    logs.stackTraces.length > 0
      ? logs.stackTraces.map((st, i) => `### Stack Trace ${i + 1}\n\`\`\`\n${st}\n\`\`\``).join("\n\n")
      : "_No stack traces found._";

  return `# Incident Diagnosis Request

## Incident Details
- **Title**: ${incident.title}
- **Severity**: ${incident.urgency.toUpperCase()}
- **Service**: ${incident.service.name}
- **Triggered At**: ${incident.createdAt}
- **PagerDuty URL**: ${incident.htmlUrl}

## Alert Details
${incident.alertDetails.map((d) => `- ${d}`).join("\n") || "_No additional details._"}

## Error Logs
\`\`\`
${logs.logs}
\`\`\`
${logs.truncated ? `\n> Note: Logs were truncated. Showing ${logs.rawLines} of available lines.\n` : ""}

## Stack Traces
${stackSection}

## Repository
- **Repo**: ${serviceConfig.repoOwner}/${serviceConfig.repoName}
- **Default Branch**: ${serviceConfig.defaultBranch}

## Your Task

You are an expert incident responder. Analyze the logs and stack traces above, then:

1. **Identify the root cause** of this incident. Be specific about which code path is failing and why.
2. **Locate the affected source files** in this repository. Use the Glob and Grep tools to find them.
3. **Read the relevant code** to understand the context around the failing lines.
4. **Propose a specific fix** — show exactly what code changes are needed.

## Required Output Format

You MUST structure your final response EXACTLY as follows (use these exact headers):

### ROOT_CAUSE
One paragraph explaining the root cause.

### AFFECTED_FILES
- path/to/file1.ts
- path/to/file2.ts

### PROPOSED_CHANGES
For each file that needs changes:

#### FILE: path/to/file.ts
**Explanation**: Why this change fixes the issue.
\`\`\`diff
- old line of code
+ new line of code
\`\`\`

### RISK_ASSESSMENT
LOW | MEDIUM | HIGH
Justification for the risk level.

### ROLLBACK_PLAN
How to revert if the fix causes issues.

### CONFIDENCE
A number between 0 and 1 representing your confidence in this diagnosis.
`;
}

/**
 * Builds a prompt for Cline CLI to apply the proposed fix.
 */
export function buildFixPrompt(
  diagnosisOutput: string,
  serviceConfig: ServiceConfig
): string {
  return `# Apply Incident Fix

You previously diagnosed an incident and proposed changes. Now apply those changes.

## Previous Diagnosis
${diagnosisOutput}

## Repository
- **Repo**: ${serviceConfig.repoOwner}/${serviceConfig.repoName}
- **Branch**: You are on a fix branch already.

## Your Task

Apply the proposed changes from the diagnosis above. For each file:
1. Read the current file content
2. Make the exact changes proposed
3. Verify the changes look correct

Do NOT make any changes beyond what was proposed in the diagnosis. Be precise.
`;
}
