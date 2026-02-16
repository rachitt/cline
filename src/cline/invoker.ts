import { spawn } from "node:child_process";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { parseDiagnosisOutput } from "./output-parser.js";
import { buildDiagnosisPrompt, buildFixPrompt } from "./context-builder.js";
import type {
  PagerDutyIncident,
  LogResult,
  ServiceConfig,
  DiagnosisResult,
} from "../types.js";

const TMP_DIR = path.resolve("tmp");

/**
 * Invokes Cline CLI in non-interactive (--print) mode with the given prompt.
 * Returns the raw stdout output.
 */
async function invokeCline(
  prompt: string,
  workingDir: string,
  allowedTools: string[] = ["Read", "Grep", "Glob"]
): Promise<string> {
  await mkdir(TMP_DIR, { recursive: true });
  const promptFile = path.join(TMP_DIR, `prompt-${Date.now()}.md`);
  await writeFile(promptFile, prompt, "utf-8");

  const args = [
    "--print",
    "--output-format",
    "text",
    "--max-turns",
    String(config.CLINE_MAX_TURNS),
    "--allowedTools",
    allowedTools.join(","),
    "-p",
    prompt,
  ];

  logger.info(
    { cwd: workingDir, tools: allowedTools },
    "Invoking Cline CLI"
  );

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(config.CLINE_CLI_PATH, args, {
      cwd: workingDir,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      logger.warn("Cline CLI timed out, killing process");
      proc.kill("SIGTERM");
      // Give it a moment to clean up, then force kill
      setTimeout(() => proc.kill("SIGKILL"), 5000);
    }, config.CLINE_TIMEOUT_MS);

    proc.on("close", async (code) => {
      clearTimeout(timeout);
      // Clean up prompt file
      await unlink(promptFile).catch(() => {});

      if (code !== 0 && !stdout) {
        logger.error(
          { code, stderr: stderr.slice(0, 500) },
          "Cline CLI exited with error"
        );
        reject(new Error(`Cline exited with code ${code}: ${stderr.slice(0, 200)}`));
        return;
      }

      // Even if exit code is non-zero, if we have stdout output, use it
      if (stderr) {
        logger.debug({ stderr: stderr.slice(0, 300) }, "Cline stderr output");
      }

      resolve(stdout);
    });

    proc.on("error", async (err) => {
      clearTimeout(timeout);
      await unlink(promptFile).catch(() => {});
      reject(new Error(`Failed to spawn Cline CLI: ${err.message}`));
    });
  });
}

/**
 * Runs the full diagnosis pass: builds context, invokes Cline, parses output.
 */
export async function diagnoseIncident(
  incident: PagerDutyIncident,
  logs: LogResult,
  serviceConfig: ServiceConfig,
  repoDir: string
): Promise<DiagnosisResult> {
  const prompt = buildDiagnosisPrompt(incident, logs, serviceConfig);

  logger.info(
    { incidentId: incident.id, repoDir },
    "Starting Cline diagnosis pass"
  );

  const rawOutput = await invokeCline(prompt, repoDir, [
    "Read",
    "Grep",
    "Glob",
  ]);

  logger.info(
    { incidentId: incident.id, outputLength: rawOutput.length },
    "Cline diagnosis complete"
  );

  return parseDiagnosisOutput(rawOutput);
}

/**
 * Runs the fix application pass: Cline edits files based on diagnosis.
 */
export async function applyFix(
  diagnosisRawOutput: string,
  serviceConfig: ServiceConfig,
  repoDir: string
): Promise<string> {
  const prompt = buildFixPrompt(diagnosisRawOutput, serviceConfig);

  logger.info({ repoDir }, "Starting Cline fix application pass");

  const rawOutput = await invokeCline(prompt, repoDir, [
    "Read",
    "Grep",
    "Glob",
    "Edit",
    "Write",
  ]);

  logger.info(
    { outputLength: rawOutput.length },
    "Cline fix application complete"
  );

  return rawOutput;
}
