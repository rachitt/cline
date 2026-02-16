import type { DiagnosisResult, ProposedChange } from "../types.js";
import { logger } from "../logger.js";

/**
 * Parses Cline CLI's output into a structured DiagnosisResult.
 * Looks for the specific headers we requested in the prompt.
 */
export function parseDiagnosisOutput(rawOutput: string): DiagnosisResult {
  const result: DiagnosisResult = {
    rootCause: "",
    affectedFiles: [],
    proposedChanges: [],
    riskAssessment: "MEDIUM",
    rollbackPlan: "",
    confidence: 0.5,
    rawOutput,
  };

  try {
    result.rootCause = extractSection(rawOutput, "ROOT_CAUSE");
    result.affectedFiles = extractFileList(rawOutput, "AFFECTED_FILES");
    result.proposedChanges = extractProposedChanges(rawOutput);
    result.riskAssessment = extractRiskAssessment(rawOutput);
    result.rollbackPlan = extractSection(rawOutput, "ROLLBACK_PLAN");
    result.confidence = extractConfidence(rawOutput);
  } catch (err) {
    logger.warn({ err }, "Partial failure parsing Cline output, using defaults for missing fields");
  }

  // If we got nothing useful, flag it
  if (!result.rootCause && result.proposedChanges.length === 0) {
    logger.warn("Cline output did not contain parseable diagnosis sections");
    result.rootCause = "Unable to parse structured diagnosis. Raw output preserved.";
    result.confidence = 0.1;
  }

  return result;
}

function extractSection(output: string, header: string): string {
  const regex = new RegExp(
    `###\\s*${header}\\s*\\n([\\s\\S]*?)(?=###\\s|$)`,
    "i"
  );
  const match = output.match(regex);
  return match ? match[1].trim() : "";
}

function extractFileList(output: string, header: string): string[] {
  const section = extractSection(output, header);
  if (!section) return [];

  return section
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0 && line.includes("/"));
}

function extractProposedChanges(output: string): ProposedChange[] {
  const section = extractSection(output, "PROPOSED_CHANGES");
  if (!section) return [];

  const changes: ProposedChange[] = [];
  // Split by #### FILE: markers
  const fileBlocks = section.split(/####\s*FILE:\s*/i).filter(Boolean);

  for (const block of fileBlocks) {
    const lines = block.split("\n");
    const filePath = lines[0]?.trim();
    if (!filePath) continue;

    // Extract explanation
    const explanationMatch = block.match(
      /\*\*Explanation\*\*:\s*(.*?)(?=```|$)/s
    );
    const explanation = explanationMatch ? explanationMatch[1].trim() : "";

    // Extract diff
    const diffMatch = block.match(/```diff\n([\s\S]*?)```/);
    const diff = diffMatch ? diffMatch[1].trim() : "";

    if (filePath) {
      changes.push({ filePath, diff, explanation });
    }
  }

  return changes;
}

function extractRiskAssessment(
  output: string
): "LOW" | "MEDIUM" | "HIGH" {
  const section = extractSection(output, "RISK_ASSESSMENT");
  const upper = section.toUpperCase();
  if (upper.startsWith("HIGH")) return "HIGH";
  if (upper.startsWith("LOW")) return "LOW";
  return "MEDIUM";
}

function extractConfidence(output: string): number {
  const section = extractSection(output, "CONFIDENCE");
  const num = parseFloat(section);
  if (isNaN(num)) return 0.5;
  return Math.max(0, Math.min(1, num));
}
