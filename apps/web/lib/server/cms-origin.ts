import type { NextRequest } from "next/server";

type CmsEnvKey = "CMS_URL" | "NEXT_PUBLIC_CMS_URL";

export type CmsBaseResolution =
  | {
      ok: true;
      baseUrl: string;
      source: CmsEnvKey;
    }
  | {
      ok: false;
      error: string;
      hint: string;
    };

const CMS_ENV_KEYS: CmsEnvKey[] = ["CMS_URL", "NEXT_PUBLIC_CMS_URL"];

function normalizeCmsBase(raw: string): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  const candidate = /^(https?:)?\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    return `${url.protocol}//${url.host}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function resolveRequestHost(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = (forwardedHost || req.nextUrl.host || "").trim().toLowerCase();
  return host;
}

export function resolveCmsBaseUrl(req?: NextRequest): CmsBaseResolution {
  for (const key of CMS_ENV_KEYS) {
    const raw = process.env[key];
    if (!raw) continue;

    const base = normalizeCmsBase(raw);
    if (!base) continue;

    if (req) {
      const reqHost = resolveRequestHost(req);
      if (reqHost) {
        try {
          const cmsHost = new URL(base).host.toLowerCase();
          if (cmsHost === reqHost) {
            return {
              ok: false,
              error: `${key} points to the current frontend host, causing recursive /api calls`,
              hint: `Set CMS_URL to the Payload CMS domain (for example https://flowcms.vercel.app), not ${reqHost}.`,
            };
          }
        } catch {
          // Should never happen because base was already normalized.
        }
      }
    }

    return { ok: true, baseUrl: base, source: key };
  }

  return {
    ok: false,
    error: "CMS URL is not configured",
    hint:
      "Set CMS_URL (preferred) or NEXT_PUBLIC_CMS_URL to your Payload CMS deployment URL.",
  };
}

