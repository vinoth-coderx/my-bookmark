type EmbedCheckResponse = {
  blocked: boolean;
  reason?: string;
};

function parseFrameAncestors(csp: string): string | null {
  const match = csp.match(/(?:^|;)\s*frame-ancestors\s+([^;]+)/i);
  return match?.[1]?.trim() ?? null;
}

function computeAppOrigin(requestUrl: URL, request: Request): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return requestUrl.origin;
  const proto = forwardedProto ?? requestUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

function sourceAllowsOrigin(source: string, origin: URL): boolean {
  const token = source.trim();
  if (!token) return false;
  if (token === "*") return true;

  if (token === "https:" && origin.protocol === "https:") return true;
  if (token === "http:" && origin.protocol === "http:") return true;

  if (token.startsWith("http://") || token.startsWith("https://")) {
    // Exact origin match.
    try {
      return new URL(token).origin === origin.origin;
    } catch {
      return false;
    }
  }

  const wildcardIndex = token.indexOf("*.") ;
  if (wildcardIndex !== -1) {
    const host = token.slice(wildcardIndex + 2).toLowerCase();
    if (!host) return false;
    return origin.hostname.toLowerCase() === host || origin.hostname.toLowerCase().endsWith(`.${host}`);
  }

  return false;
}

function frameAncestorsBlocksEmbedding(frameAncestors: string, appOrigin: string, targetOrigin: string): {
  blocked: boolean;
  reason?: string;
} {
  const normalized = frameAncestors.trim();
  if (!normalized) return { blocked: false };

  const tokens = normalized.split(/\s+/g).filter(Boolean);
  if (tokens.some((t) => t.toLowerCase() === "'none'")) {
    return { blocked: true, reason: "Blocked by Content-Security-Policy frame-ancestors 'none'." };
  }

  const app = new URL(appOrigin);
  const target = new URL(targetOrigin);

  if (tokens.some((t) => t.toLowerCase() === "'self'")) {
    // 'self' only allows embedding by the target origin itself.
    if (app.origin !== target.origin) {
      // If there are other allowed sources, we’ll keep checking them before blocking.
      const hasOtherAllow = tokens.some((t) => t.toLowerCase() !== "'self'");
      if (!hasOtherAllow) {
        return { blocked: true, reason: "Blocked by Content-Security-Policy frame-ancestors 'self'." };
      }
    }
  }

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === "'self'") {
      if (app.origin === target.origin) return { blocked: false };
      continue;
    }
    if (lower === "'none'") continue;
    if (sourceAllowsOrigin(token, app)) return { blocked: false };
  }

  return { blocked: true, reason: "Blocked by Content-Security-Policy frame-ancestors." };
}

async function fetchHeaders(url: string, signal: AbortSignal): Promise<Headers> {
  let headRes: Response | null = null;
  try {
    headRes = await fetch(url, { method: "HEAD", redirect: "follow", cache: "no-store", signal });
    const hasXfo = !!headRes.headers.get("x-frame-options")?.trim();
    const csp = headRes.headers.get("content-security-policy");
    const hasFrameAncestors = !!(csp && parseFrameAncestors(csp));
    if (hasXfo || hasFrameAncestors) return headRes.headers;
  } catch {
    // Ignore, fall back to GET.
  } finally {
    try {
      headRes?.body?.cancel();
    } catch {}
  }

  let getRes: Response | null = null;
  try {
    getRes = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", signal });
    return getRes.headers;
  } finally {
    try {
      getRes?.body?.cancel();
    } catch {}
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const candidate = requestUrl.searchParams.get("url")?.trim();

  if (!candidate) {
    return Response.json({ blocked: false } satisfies EmbedCheckResponse);
  }

  let target: URL;
  try {
    target = new URL(candidate);
  } catch {
    return Response.json({ blocked: false } satisfies EmbedCheckResponse);
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return Response.json({ blocked: false } satisfies EmbedCheckResponse);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const headers = await fetchHeaders(target.toString(), controller.signal);
    const appOrigin = computeAppOrigin(requestUrl, request);

    const xfo = headers.get("x-frame-options");
    if (xfo && xfo.trim()) {
      const normalized = xfo.trim().toLowerCase();

      if (normalized.includes("deny")) {
        return Response.json({
          blocked: true,
          reason: `Blocked by X-Frame-Options (${xfo.trim()}).`,
        } satisfies EmbedCheckResponse);
      }

      if (normalized.includes("sameorigin")) {
        if (appOrigin !== target.origin) {
          return Response.json({
            blocked: true,
            reason: `Blocked by X-Frame-Options (SAMEORIGIN). This preview only works if the app is hosted on ${target.origin}.`,
          } satisfies EmbedCheckResponse);
        }
      } else {
        const allowFromMatch = normalized.match(/allow-from\s+(.+)$/i);
        if (allowFromMatch?.[1]) {
          try {
            const allowed = new URL(allowFromMatch[1].trim()).origin;
            if (allowed !== appOrigin) {
              return Response.json({
                blocked: true,
                reason: `Blocked by X-Frame-Options (${xfo.trim()}).`,
              } satisfies EmbedCheckResponse);
            }
          } catch {
            return Response.json({
              blocked: true,
              reason: `Blocked by X-Frame-Options (${xfo.trim()}).`,
            } satisfies EmbedCheckResponse);
          }
        } else {
          return Response.json({
            blocked: true,
            reason: `Blocked by X-Frame-Options (${xfo.trim()}).`,
          } satisfies EmbedCheckResponse);
        }
      }
    }

    const csp = headers.get("content-security-policy");
    const frameAncestors = csp ? parseFrameAncestors(csp) : null;
    if (frameAncestors) {
      const { blocked, reason } = frameAncestorsBlocksEmbedding(
        frameAncestors,
        appOrigin,
        target.origin,
      );
      if (blocked) {
        return Response.json({ blocked: true, reason } satisfies EmbedCheckResponse);
      }
    }

    return Response.json({ blocked: false } satisfies EmbedCheckResponse);
  } catch {
    return Response.json({ blocked: false } satisfies EmbedCheckResponse);
  } finally {
    clearTimeout(timeout);
  }
}
