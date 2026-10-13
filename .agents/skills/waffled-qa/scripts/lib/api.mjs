// `wqa api`: one request to the stack's API with credentials added, the full
// response saved into the attempt, and a short shape summary printed.
import * as fs from "node:fs";
import { basename, extname } from "node:path";
import { fail, required } from "./cli.mjs";
import { resolveBaseUrl, sessionToken } from "./local.mjs";
import { attemptContext, evidenceFile, writeEvidence } from "./attempt.mjs";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const SECRET_HEADERS = /^(authorization|cookie|set-cookie|x-api-key)$/i;
const PAGINATION = /^(cursor|nextCursor|next_cursor|next|nextPage|hasMore|has_more|hasNextPage|total|totalCount|total_count|page|pageSize|limit|offset)$/;

const redact = (headers) =>
  Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, SECRET_HEADERS.test(key) ? "[redacted]" : value])
  );

// Top-level keys, array lengths, and pagination fields up to two levels deep.
export function shape(body, status = 200) {
  const out = { arrays: {}, pagination: {} };
  if (Array.isArray(body)) out.arrays["."] = body.length;
  else if (body && typeof body === "object") out.keys = Object.keys(body).slice(0, 25);
  const walk = (value, path, depth) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || depth > 2) return;
    for (const [key, child] of Object.entries(value)) {
      const at = path ? `${path}.${key}` : key;
      if (Array.isArray(child)) out.arrays[at] = child.length;
      else if (PAGINATION.test(key) && (child === null || typeof child !== "object"))
        out.pagination[at] = child;
      else walk(child, at, depth + 1);
    }
  };
  walk(body, "", 1);
  // An error field, or the message of a failed response (a 200 can fail too).
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const failed = body.success === false || status >= 400;
    const error = body.error ?? body.errors ?? (failed ? (body.message ?? body.success === false) : null);
    if (error !== null && error !== undefined && error !== false)
      out.domainError = typeof error === "string" ? error.slice(0, 200) : error;
  }
  return out;
}

export async function api(run, [method, path], opts) {
  method = required(method, "METHOD").toUpperCase();
  if (!METHODS.includes(method)) fail(`METHOD must be one of ${METHODS.join(", ")}`);
  if (!required(path, "path").startsWith("/"))
    fail("path must start with /; use --base-url for another local host");
  const context = opts["--save"] ? attemptContext(run, opts) : null;
  const save = opts["--save"];
  const meta = save && `${basename(save, extname(save))}.meta.json`;
  if (context) [save, meta].forEach((name) => evidenceFile(context, name));

  const auth = opts["--auth"] ?? "session";
  const headers = { accept: "application/json" };
  let baseUrl;
  if (auth === "session") {
    const found = await sessionToken(opts);
    baseUrl = found.baseUrl;
    headers.authorization = `Bearer ${found.entry.token}`;
  } else if (auth === "none") baseUrl = resolveBaseUrl(opts);
  else fail("--auth must be session or none");
  let body;
  if (opts["--body"]) {
    body = fs.readFileSync(opts["--body"], "utf8");
    JSON.parse(body);
    headers["content-type"] = "application/json";
  }

  const started = Date.now();
  let response;
  try {
    response = await fetch(baseUrl + path, { method, headers, body, signal: AbortSignal.timeout(55_000) });
  } catch (error) {
    fail(`${method} ${path} failed: ${error.cause?.message ?? error.message}`);
  }
  const text = await response.text();
  const ms = Date.now() - started;
  let json;
  try {
    json = JSON.parse(text);
  } catch {}

  const output = { method, path, status: response.status, ms, bytes: Buffer.byteLength(text) };
  if (json === undefined) {
    output.json = false;
    output.excerpt = text.slice(0, 200);
  } else Object.assign(output, shape(json, response.status));
  if (context) {
    output.files = [
      writeEvidence(context, save, json === undefined ? text : JSON.stringify(json, null, 2) + "\n"),
      writeEvidence(context, meta, {
        method,
        url: baseUrl + path,
        status: response.status,
        ms,
        auth,
        requestHeaders: redact(headers),
        responseHeaders: redact(Object.fromEntries(response.headers)),
        requestBody: body === undefined ? null : JSON.parse(body),
        at: new Date(started).toISOString(),
      }),
    ];
  }
  return output;
}
