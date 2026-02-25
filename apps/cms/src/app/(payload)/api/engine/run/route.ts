import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { detectBulkUrls, parseSaveeUrl } from "../../../../../lib/url-utils";
import { spawn } from "child_process";
import path from "path";

const STALE_PENDING_MINUTES = 15;
const STALE_RUNNING_MINUTES = 120;

interface SourceData {
  url: string;
  sourceType: "home" | "pop" | "user" | "blocks";
  status: "active" | "paused" | "completed" | "error";
  username?: string;
}

type RunErrorCode =
  | "invalid_input"
  | "invalid_url"
  | "capacity_limit"
  | "run_already_active"
  | "github_dispatch_failed"
  | "database_error"
  | "r2_error"
  | "internal_error";

type DispatchFailureReason =
  | "billing_blocked"
  | "missing_credentials"
  | "token_permissions"
  | "repository_access"
  | "rate_limited"
  | "api_error";

interface DispatchLog {
  kind: string;
  status: number;
  message: string | null;
}

function truncateText(text: string, max = 240): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function readGitHubResponseMessage(resp: Response): Promise<string | null> {
  try {
    const raw = (await resp.text()).trim();
    if (!raw) return null;
    try {
      const json = JSON.parse(raw) as { message?: unknown };
      if (typeof json?.message === "string" && json.message.trim()) {
        return truncateText(json.message.trim());
      }
    } catch {}
    return truncateText(raw.replace(/\s+/g, " "));
  } catch {
    return null;
  }
}

function classifyDispatchFailure({
  hasToken,
  hasRepo,
  dispatchLogs,
}: {
  hasToken: boolean;
  hasRepo: boolean;
  dispatchLogs: DispatchLog[];
}): { reason: DispatchFailureReason; error: string; hint: string } {
  if (!hasToken || !hasRepo) {
    return {
      reason: "missing_credentials",
      error: "GitHub monitor dispatch is not configured",
      hint:
        "Set GITHUB_ACTIONS_TOKEN (or GITHUB_DISPATCH_TOKEN) and GITHUB_REPO in CMS env, then redeploy.",
    };
  }

  const messages = dispatchLogs
    .map((entry) => entry.message || "")
    .filter(Boolean)
    .join(" | ");
  const messageLower = messages.toLowerCase();
  const statuses = new Set(dispatchLogs.map((entry) => entry.status));

  if (
    messageLower.includes("payments have failed") ||
    messageLower.includes("spending limit") ||
    statuses.has(402)
  ) {
    return {
      reason: "billing_blocked",
      error: "GitHub Actions is blocked by billing or spending limits",
      hint:
        "Open GitHub Billing & plans, fix payment method/spending limit, then retry.",
    };
  }

  if (
    statuses.has(401) ||
    statuses.has(403) ||
    messageLower.includes("resource not accessible by integration") ||
    messageLower.includes("must have access")
  ) {
    return {
      reason: "token_permissions",
      error: "GitHub token cannot dispatch monitor workflows",
      hint:
        "Update token permissions (repo/workflow for classic PAT, or Actions write for fine-grained PAT).",
    };
  }

  if (
    statuses.has(404) ||
    messageLower.includes("not found") ||
    messageLower.includes("repository does not exist")
  ) {
    return {
      reason: "repository_access",
      error: "GitHub repository or workflow is not accessible",
      hint:
        "Verify GITHUB_REPO and workflow file names (monitor.yml/manual-monitor.yml) in the target repo.",
    };
  }

  if (statuses.has(429) || messageLower.includes("rate limit")) {
    return {
      reason: "rate_limited",
      error: "GitHub API rate limit hit while dispatching monitor",
      hint: "Wait a bit, then retry starting the job.",
    };
  }

  return {
    reason: "api_error",
    error: "GitHub monitor dispatch failed",
    hint:
      messages.length > 0
        ? `GitHub response: ${truncateText(messages)}`
        : "Check GitHub Actions status, token permissions, and repo settings.",
  };
}

function classifyUnhandledRunError(error: unknown): {
  code: RunErrorCode;
  error: string;
  hint: string;
} {
  const raw = normalizeErrorMessage(error);
  const lower = raw.toLowerCase();

  if (
    lower.includes("database") ||
    lower.includes("postgres") ||
    lower.includes("relation") ||
    lower.includes("duplicate key") ||
    lower.includes("sql") ||
    lower.includes("connect") ||
    lower.includes("timeout")
  ) {
    return {
      code: "database_error",
      error: "Database error while starting job",
      hint: "Check DATABASE_URL connectivity and database health.",
    };
  }

  if (lower.includes("r2") || lower.includes("cloudflare") || lower.includes("bucket")) {
    return {
      code: "r2_error",
      error: "R2/storage error while preparing run",
      hint: "Check primary/secondary R2 credentials and bucket access.",
    };
  }

  return {
    code: "internal_error",
    error: "Failed to start job",
    hint: `Unhandled error: ${truncateText(raw, 180)}`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { url: rawUrl, maxItems, force: forceBody } = await request.json();

    if (!rawUrl) {
      return NextResponse.json(
        {
          success: false,
          code: "invalid_input" as RunErrorCode,
          error: "URL is required",
        },
        { status: 400 }
      );
    }
    const url = String(rawUrl).trim();

    const payload = await getPayload({ config });

    // External-runner mode toggle: do not spawn Python, just enqueue run
    const m = new URL(request.url);
    const modeParam = (m.searchParams.get("mode") || "").toLowerCase();
    const externalRunner =
      modeParam === "external" ||
      String(process.env.MONITOR_MODE || "").toLowerCase() === "external" ||
      String(process.env.EXTERNAL_RUNNER || "").toLowerCase() === "true" ||
      String(process.env.VERCEL || "") === "1"; // default external on Vercel

    // Capacity guard: check R2/DB limits unless forcing
    const urlObj = new URL(request.url);
    const forceParam = (urlObj.searchParams.get("force") || "").toLowerCase();
    const force = Boolean(forceBody) || forceParam === "1" || forceParam === "true";
    try {
      const reqUrl = new URL(request.url);
      const origin = `${reqUrl.protocol}//${reqUrl.host}`;
      const limitsRes = await fetch(`${origin}/api/engine/limits`, {
        cache: "no-store",
      });
      if (limitsRes.ok) {
        const limits = await limitsRes.json();
        const nearR2 = !!limits?.r2?.nearLimit;
        const nearDb = !!limits?.db?.nearLimit;
        const canFailoverToSecondary = !!limits?.r2?.canFailoverToSecondary;
        // Start-time hard block should only apply to DB capacity.
        // R2 guard is enforced by the worker, which can fail over to secondary.
        if (nearDb && !force) {
          const capacityReasons: string[] = [];
          if (nearDb) capacityReasons.push("DB near soft limit");
          return NextResponse.json(
            {
              success: false,
              code: "capacity_limit" as RunErrorCode,
              error: "Capacity near limits",
              reason: "db_soft_limit",
              message:
                capacityReasons.length > 0
                  ? capacityReasons.join("; ")
                  : "Capacity near limits",
              details: { r2: limits?.r2, db: limits?.db },
              hint: "Pass force:true to override",
            },
            { status: 429 }
          );
        }
        if (nearR2 && !canFailoverToSecondary) {
          console.warn(
            "[engine/run] R2 near soft limit and secondary failover unavailable; allowing run, worker will enforce capacity guard."
          );
        }
      }
    } catch {}

    const bulkDetection = detectBulkUrls(url);
    const isBulkInput = bulkDetection.count > 1;

    // Parse URL type; for bulk input we bypass single-URL parsing.
    const parsedUrl = isBulkInput
      ? { isValid: true, sourceType: "blocks" as const, href: bulkDetection.urls[0] }
      : parseSaveeUrl(url);

    if (!parsedUrl.isValid) {
      return NextResponse.json(
        {
          success: false,
          code: "invalid_url" as RunErrorCode,
          error: "Invalid savee.it URL",
        },
        { status: 400 }
      );
    }

    const normalizedUrl = isBulkInput
      ? bulkDetection.urls.join(",")
      : (parsedUrl.href || url).trim();

    // Create or find source by URL. If same URL exists but with missing username, update it.
    const sources = await payload.find({
      collection: "sources",
      where: {
        url: { equals: normalizedUrl },
      },
      limit: 1,
    });

    let sourceId: number;

    if (sources.docs.length === 0) {
      const sourceData: SourceData = {
        url: normalizedUrl,
        sourceType: parsedUrl.sourceType,
        status: "active",
      };

      if (parsedUrl.username) {
        sourceData.username = parsedUrl.username;
      }

      const newSource = await payload.create({
        collection: "sources",
        data: sourceData as any,
      });
      sourceId = newSource.id;
    } else {
      sourceId = sources.docs[0].id;

      const sourcePatch: Record<string, any> = {};

      // Update username if provided and missing
      if (parsedUrl.username && !sources.docs[0].username) {
        sourcePatch.username = parsedUrl.username;
      }

      // Keep source type in sync for bulk/item runs.
      if (parsedUrl.sourceType === "blocks" && sources.docs[0].sourceType !== "blocks") {
        sourcePatch.sourceType = "blocks";
      }

      // Manual run should be eligible for monitor dispatch.
      if (sources.docs[0].status !== "active") {
        sourcePatch.status = "active";
      }

      if (Object.keys(sourcePatch).length > 0) {
        await payload.update({
          collection: "sources",
          id: sourceId,
          data: sourcePatch,
        });
      }
    }

    // Guard: if there's already an active run, do not start another
    const pool: any = (payload.db as any).pool;
    const existingActive = await pool.query(
      `SELECT id, status, updated_at, created_at
       FROM runs
       WHERE source_id = $1 AND status IN ('running','paused','pending')
       ORDER BY created_at DESC LIMIT 1`,
      [sourceId]
    );
    if (existingActive.rows.length > 0) {
      const active = existingActive.rows[0] as {
        id: number;
        status: string;
        updated_at?: string | Date | null;
        created_at?: string | Date | null;
      };
      const refTs = active.updated_at || active.created_at;
      const ageMs = refTs ? Date.now() - new Date(refTs).getTime() : 0;
      const stalePending =
        active.status === "pending" &&
        ageMs > STALE_PENDING_MINUTES * 60 * 1000;
      const staleRunning =
        active.status === "running" &&
        ageMs > STALE_RUNNING_MINUTES * 60 * 1000;
      if (stalePending || staleRunning) {
        await pool.query(
          `UPDATE runs
           SET status = 'error',
               error_message = $1,
               completed_at = now(),
               updated_at = now()
           WHERE id = $2`,
          [
            stalePending
              ? `Auto-expired stale pending run after ${STALE_PENDING_MINUTES} minutes without dispatch`
              : `Auto-expired stale running run after ${STALE_RUNNING_MINUTES} minutes without heartbeat`,
            active.id,
          ]
        );
      } else {
        return NextResponse.json(
          {
            success: false,
            code: "run_already_active" as RunErrorCode,
            error:
              active.status === "pending"
                ? "Previous run is still pending. Wait a bit or use Run Now with force."
                : "Run already active for this source",
            details: {
              activeStatus: active.status,
              activeRunId: active.id,
            },
          },
          { status: 409 }
        );
      }
    }
    if (existingActive.rows.length > 0) {
      // Existing row was stale pending and has just been expired; continue startup.
    }

    // Always create a fresh run row for each manual trigger.
    // Reusing old run IDs can surface stale statuses/logs in the dashboard.
    const created = await payload.create({
      collection: "runs",
      data: {
        source: sourceId,
        kind: "manual",
        maxItems: typeof maxItems === "number" && maxItems > 0 ? maxItems : 0,
        status: externalRunner ? "pending" : "running",
        counters: { found: 0, uploaded: 0, errors: 0 },
        startedAt: new Date().toISOString(),
      },
    });
    const runId = created.id as number;

    // In external-runner mode, do not spawn; return run details
    if (externalRunner) {
      // Attempt to trigger GH monitor workflow so user sees action immediately
      let dispatched = false;
      const dispatchLogs: DispatchLog[] = [];
      try {
        const token =
          process.env.GITHUB_ACTIONS_TOKEN || process.env.GITHUB_DISPATCH_TOKEN;
        const repo = process.env.GITHUB_REPO; // owner/repo
        const ref = process.env.GITHUB_REF || "main";
        if (token && repo) {
          // 1) repository_dispatch
          try {
            const resp = await fetch(
              `https://api.github.com/repos/${repo}/dispatches`,
              {
                method: "POST",
                headers: {
                  Authorization: `token ${token}`,
                  Accept: "application/vnd.github+json",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  event_type: "run_monitor",
                  client_payload: { sourceId: String(sourceId) },
                }),
              }
            );
            const ghMessage = resp.ok ? null : await readGitHubResponseMessage(resp);
            dispatchLogs.push({
              kind: "repository_dispatch",
              status: resp.status,
              message: ghMessage,
            });
            dispatched ||= resp.ok;
          } catch (e) {
            // Silently handle errors
          }
          // 2) workflow_dispatch monitor.yml
          if (!dispatched) {
            try {
              const resp2 = await fetch(
                `https://api.github.com/repos/${repo}/actions/workflows/monitor.yml/dispatches`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `token ${token}`,
                    Accept: "application/vnd.github+json",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    ref,
                    inputs: { sourceId: String(sourceId) },
                  }),
                }
              );
              const ghMessage = resp2.ok
                ? null
                : await readGitHubResponseMessage(resp2);
              dispatchLogs.push({
                kind: "workflow_dispatch:monitor.yml",
                status: resp2.status,
                message: ghMessage,
              });
              dispatched ||= resp2.ok;
            } catch (e) {
              // Silently handle errors
            }
          }
          // 3) workflow_dispatch manual-monitor.yml
          if (!dispatched) {
            try {
              const resp3 = await fetch(
                `https://api.github.com/repos/${repo}/actions/workflows/manual-monitor.yml/dispatches`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `token ${token}`,
                    Accept: "application/vnd.github+json",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    ref,
                    inputs: { sourceId: String(sourceId) },
                  }),
                }
              );
              const ghMessage = resp3.ok
                ? null
                : await readGitHubResponseMessage(resp3);
              dispatchLogs.push({
                kind: "workflow_dispatch:manual-monitor.yml",
                status: resp3.status,
                message: ghMessage,
              });
              dispatched ||= resp3.ok;
            } catch (e) {
              // Silently handle errors
            }
          }
        }
      } catch (e) {
        // Silently handle errors
      }
      const hasToken = Boolean(
        process.env.GITHUB_ACTIONS_TOKEN || process.env.GITHUB_DISPATCH_TOKEN
      );
      const hasRepo = Boolean(process.env.GITHUB_REPO);
      const dispatchFailure = classifyDispatchFailure({
        hasToken,
        hasRepo,
        dispatchLogs,
      });
      const debug = {
        hasToken,
        hasRepo,
        ref: process.env.GITHUB_REF || "main",
        dispatchLogs,
      };

      if (!dispatched) {
        try {
          await pool.query(
            `UPDATE runs
             SET status = 'error',
                 error_message = $1,
                 completed_at = now(),
                 updated_at = now()
             WHERE id = $2`,
            ["Auto-failed: monitor dispatch was not triggered", runId]
          );
        } catch {}

        return NextResponse.json(
          {
            success: false,
            code: "github_dispatch_failed" as RunErrorCode,
            reason: dispatchFailure.reason,
            runId,
            sourceType: parsedUrl.sourceType,
            username: parsedUrl.username,
            mode: "external",
            dispatched: false,
            error: dispatchFailure.error,
            hint: dispatchFailure.hint,
            debug,
          },
          { status: 503 }
        );
      }

      return NextResponse.json({
        success: true,
        runId,
        sourceType: parsedUrl.sourceType,
        username: parsedUrl.username,
        mode: "external",
        dispatched: true,
        message: "Run enqueued and monitor dispatched",
        debug,
      });
    }

    // Start worker process (inline mode)
    const workerPath = path.resolve(process.cwd(), "../worker");

    try {
      const pythonProcess = spawn(
        "python",
        [
          "-m",
          "app.cli",
          "--start-url",
          normalizedUrl,
          "--max-items",
          (typeof maxItems === "number" && maxItems > 0
            ? maxItems
            : 0
          ).toString(),
          "--run-id",
          String(runId),
        ],
        {
          cwd: workerPath,
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env },
          detached: false,
        }
      );

      // Worker output is handled by log streaming

      pythonProcess.stderr?.on("data", (data) => {
        console.error(`Worker stderr: ${data}`);
      });

      pythonProcess.on("close", async (code) => {
        try {
          await payload.update({
            collection: "runs",
            id: runId,
            data: {
              status: code === 0 ? "completed" : "error",
              completedAt: new Date().toISOString(),
              ...(code !== 0 && {
                errorMessage: `Worker exited with code ${code}`,
              }),
            },
          });
        } catch (error) {
          // Silently handle errors
        }
      });

      // Run is already marked running above
    } catch (error) {
      try {
        await payload.update({
          collection: "runs",
          id: runId,
          data: {
            status: "error",
            errorMessage: `Failed to start worker: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      } catch {}
    }

    return NextResponse.json({
      success: true,
      runId,
      sourceType: parsedUrl.sourceType,
      username: parsedUrl.username,
      message: `Job started successfully for ${parsedUrl.sourceType} content${
        parsedUrl.username ? ` from user ${parsedUrl.username}` : ""
      }`,
    });
  } catch (error) {
    console.error("Error starting job:", error);
    const classified = classifyUnhandledRunError(error);
    return NextResponse.json(
      {
        success: false,
        code: classified.code,
        error: classified.error,
        hint: classified.hint,
      },
      { status: 500 }
    );
  }
}
