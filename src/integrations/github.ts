import { Octokit } from "octokit";
import simpleGit from "simple-git";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { DiagnosisResult, ServiceConfig } from "../types.js";

const REPOS_DIR = path.resolve("repos");

const octokit = new Octokit({ auth: config.GITHUB_TOKEN });

/**
 * Ensures a local clone of the repo exists and is up to date.
 * Returns the local directory path.
 */
export async function ensureRepoClone(
  owner: string,
  repo: string,
  defaultBranch: string
): Promise<string> {
  const repoDir = path.join(REPOS_DIR, owner, repo);
  await mkdir(path.dirname(repoDir), { recursive: true });

  const git = simpleGit();

  try {
    // Check if already cloned
    const existingGit = simpleGit(repoDir);
    await existingGit.status();
    // Repo exists, fetch latest
    logger.debug({ repoDir }, "Repo exists, fetching latest");
    await existingGit.fetch("origin");
    await existingGit.checkout(defaultBranch);
    await existingGit.pull("origin", defaultBranch);
    return repoDir;
  } catch {
    // Not cloned yet, do a fresh clone
    logger.info({ owner, repo }, "Cloning repository");
    const url = `https://x-access-token:${config.GITHUB_TOKEN}@github.com/${owner}/${repo}.git`;
    await git.clone(url, repoDir, ["--depth", "50"]);
    return repoDir;
  }
}

/**
 * Creates a new branch for the incident fix, commits changes, and pushes.
 */
export async function createFixBranch(
  repoDir: string,
  incidentId: string
): Promise<string> {
  const branchName = `incident-responder/fix-${incidentId}`;
  const git = simpleGit(repoDir);

  await git.checkoutLocalBranch(branchName);
  logger.info({ branchName }, "Created fix branch");

  return branchName;
}

/**
 * Commits all changes in the repo and pushes to remote.
 */
export async function commitAndPush(
  repoDir: string,
  branchName: string,
  message: string
): Promise<void> {
  const git = simpleGit(repoDir);

  await git.add("-A");

  const status = await git.status();
  if (status.staged.length === 0) {
    logger.warn("No changes to commit after Cline fix application");
    return;
  }

  await git.commit(message);
  await git.push("origin", branchName, ["--set-upstream"]);

  logger.info({ branchName, files: status.staged.length }, "Pushed fix branch");
}

/**
 * Creates a draft pull request on GitHub with the diagnosis details.
 */
export async function createDraftPR(
  owner: string,
  repo: string,
  branchName: string,
  defaultBranch: string,
  incidentId: string,
  diagnosis: DiagnosisResult,
  pagerdutyUrl: string
): Promise<{ prUrl: string; prNumber: number }> {
  const title = `[Incident Response] ${diagnosis.rootCause.slice(0, 60)}`;

  const body = `## Automated Incident Response

**Incident ID**: \`${incidentId}\`
**PagerDuty**: ${pagerdutyUrl || "_N/A_"}
**Confidence**: ${Math.round(diagnosis.confidence * 100)}%

---

### Root Cause Analysis
${diagnosis.rootCause}

### Affected Files
${diagnosis.affectedFiles.map((f) => `- \`${f}\``).join("\n") || "_None identified_"}

### Changes Made
${diagnosis.proposedChanges
  .map(
    (c) => `#### \`${c.filePath}\`
${c.explanation}
\`\`\`diff
${c.diff}
\`\`\``
  )
  .join("\n\n") || "_No code changes proposed_"}

### Risk Assessment
**Level**: ${diagnosis.riskAssessment}

### Rollback Plan
${diagnosis.rollbackPlan || "Revert this PR."}

---
> This PR was generated automatically by the **Incident Responder Bot**.
> A human reviewer must approve before merging.`;

  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head: branchName,
    base: defaultBranch,
    draft: true,
  });

  logger.info({ prNumber: pr.number, prUrl: pr.html_url }, "Draft PR created");

  return { prUrl: pr.html_url, prNumber: pr.number };
}

/**
 * Marks a draft PR as ready for review.
 */
export async function markPRReadyForReview(
  owner: string,
  repo: string,
  prNumber: number
): Promise<void> {
  // GraphQL is needed to convert draft → ready
  await octokit.graphql(
    `mutation($id: ID!) {
      markPullRequestReadyForReview(input: { pullRequestId: $id }) {
        pullRequest { id }
      }
    }`,
    {
      id: (
        await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })
      ).data.node_id,
    }
  );
  logger.info({ prNumber }, "PR marked as ready for review");
}

/**
 * Closes a PR.
 */
export async function closePR(
  owner: string,
  repo: string,
  prNumber: number
): Promise<void> {
  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: prNumber,
    state: "closed",
  });
  logger.info({ prNumber }, "PR closed");
}
