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

export async function POST(request: NextRequest) {
  try {
    const { url: rawUrl, maxItems, force: forceBody } = await request.json();

    if (!rawUrl) {
      return NextResponse.json(
        { success: false, error: "URL is required" },
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
              error: "Capacity near limits",
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
        { success: false, error: "Invalid savee.it URL" },
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
            error:
              active.status === "pending"
                ? "Previous run is still pending. Wait a bit or use Run Now with force."
                : "Run already active for this source",
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
      const dispatchLogs: Array<{ kind: string; status: number }> = [];
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
            dispatchLogs.push({
              kind: "repository_dispatch",
              status: resp.status,
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
              dispatchLogs.push({
                kind: "workflow_dispatch:monitor.yml",
                status: resp2.status,
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
              dispatchLogs.push({
                kind: "workflow_dispatch:manual-monitor.yml",
                status: resp3.status,
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
            runId,
            sourceType: parsedUrl.sourceType,
            username: parsedUrl.username,
            mode: "external",
            dispatched: false,
            error:
              "Run was queued as pending but GitHub monitor was not dispatched",
            hint:
              "Set GITHUB_ACTIONS_TOKEN (or GITHUB_DISPATCH_TOKEN) and GITHUB_REPO in CMS Vercel env, then redeploy.",
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
    return NextResponse.json(
      { success: false, error: "Failed to start job" },
      { status: 500 }
    );
  }
}
