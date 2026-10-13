// `wqa capture mark|collect`: browser evidence for one checkpoint in a few
// lines of output instead of six agent-browser dumps.
//
// agent-browser 0.38 clears console messages and network requests, but
// `errors --clear` leaves page errors in place. `mark` therefore records the
// error count, and `collect` keeps only errors after it.
import * as fs from "node:fs";
import { join } from "node:path";
import { fail, required } from "./cli.mjs";
import { ab, must, requireSession } from "./browser.mjs";
import { attemptContext, evidenceFile, writeEvidence } from "./attempt.mjs";

const MARK = ".capture-mark.json";
const PAGE_STATE = `JSON.stringify({ visibility: document.visibilityState, readyState: document.readyState, title: document.title })`;

export function capture(run, action, opts) {
  const context = attemptContext(run, opts);
  if (!["mark", "collect"].includes(action)) fail("capture needs mark or collect");
  requireSession();
  if (action === "mark") return mark(context);
  return collect(context, opts);
}

function mark(context) {
  must(["console", "--clear"]);
  must(["network", "requests", "--clear"]);
  const errors = must(["errors"]).errors ?? [];
  const value = { markedAt: new Date().toISOString(), errors: errors.length };
  fs.writeFileSync(join(context.directory, MARK), JSON.stringify(value) + "\n", { mode: 0o600 });
  return { marked: true, existingErrors: errors.length };
}

function collect(context, opts) {
  const label = required(opts["--label"], "--label");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(label))
    fail("--label uses letters, digits, underscores, and hyphens");
  const names = ["console", "errors", "network", "meta"].map((kind) => `${label}.${kind}.json`);
  if (!opts["--no-screenshot"]) names.push(`${label}.png`);
  // Refuse before capturing anything, so a repeated label leaves no partial set.
  names.forEach((name) => evidenceFile(context, name));

  const warnings = [];
  let marked = null;
  try {
    marked = JSON.parse(fs.readFileSync(join(context.directory, MARK), "utf8"));
  } catch {
    warnings.push("no mark in this attempt: console, errors, and requests include earlier output");
  }
  const url = must(["get", "url"]).url;
  const state = JSON.parse(must(["eval", PAGE_STATE]).result);
  const consoleMessages = (must(["console"]).messages ?? []).map(({ type, text }) => ({ type, text }));
  const allErrors = must(["errors"]).errors ?? [];
  // Fewer errors than at the mark means the log was reset; keep them all.
  const errors =
    marked && allErrors.length >= marked.errors ? allErrors.slice(marked.errors) : allErrors;
  // Headers are dropped: they can carry cookies and tokens.
  const failed = (must(["network", "requests", "--status", "400-599"]).requests ?? []).map(
    ({ method, url, status, resourceType, requestId }) => ({ method, url, status, resourceType, requestId })
  );
  if (state.visibility !== "visible")
    warnings.push(
      `tab is ${state.visibility}: hidden tabs stop rendering, so blank or stuck content may be a capture artifact`
    );

  const files = [];
  if (!opts["--no-screenshot"]) {
    const shot = evidenceFile(context, `${label}.png`);
    const out = ab(["screenshot", shot.path]);
    if (out.success && fs.existsSync(shot.path)) files.push(shot.relative);
    else warnings.push(`screenshot failed: ${out.error ?? "no file written"}`);
  }
  files.push(writeEvidence(context, `${label}.console.json`, consoleMessages));
  files.push(writeEvidence(context, `${label}.errors.json`, errors));
  files.push(writeEvidence(context, `${label}.network.json`, failed));
  files.push(
    writeEvidence(context, `${label}.meta.json`, {
      label,
      url,
      ...state,
      markedAt: marked?.markedAt ?? null,
      collectedAt: new Date().toISOString(),
    })
  );
  const count = (type) => consoleMessages.filter((m) => m.type === type).length;
  const output = {
    label,
    url,
    visible: state.visibility === "visible",
    console: { error: count("error"), warning: count("warning"), total: consoleMessages.length },
    errors: errors.length,
    http4xx: failed.filter((r) => r.status < 500).length,
    http5xx: failed.filter((r) => r.status >= 500).length,
    files,
  };
  if (warnings.length) output.warnings = warnings;
  return output;
}
