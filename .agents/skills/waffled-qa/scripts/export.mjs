// `wqa export`: writes one self-contained HTML file for a run. Images and text
// evidence are embedded so the file can be opened or shared on its own.
// Screenshots lead: a visual summary shows each case's latest images, with
// `before-*`/`after-*` pairs side by side, and an agent-written `SUMMARY.html`
// fragment, when present, opens the page.
import * as fs from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { describeSource } from "./lib/ledger.mjs";

const IMAGE_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const TEXT_TYPES = new Set([
  ".md", ".txt", ".json", ".log", ".html", ".csv", ".yaml", ".yml", ".xml",
  ".js", ".mjs", ".ts", ".tsx", ".sql", ".diff", ".patch",
]);
const MAX_TEXT = 200_000;
const MAX_IMAGE = 5_000_000;
const MAX_EMBEDDED = 12_000_000;
const SUMMARY = "SUMMARY.html";

const isImage = (path) => Boolean(IMAGE_TYPES[extname(path).toLowerCase()]);
// `before` as a whole word in the file name: before-save.png, save_before.png.
const BEFORE = /(^|[-_.])before(?=[-_.]|$)/i;
const afterOf = (path) => {
  const slash = path.lastIndexOf("/") + 1;
  const name = path.slice(slash);
  return BEFORE.test(name) ? path.slice(0, slash) + name.replace(BEFORE, "$1after") : null;
};

// Regression or replacement runs linked to or from this one.
const links = (state) =>
  [
    ...(state.linkedFrom ? [`Linked from ${state.linkedFrom.runId} (${state.linkedFrom.cases.join(", ")}): ${state.linkedFrom.reason}`] : []),
    ...(state.linkedRuns ?? []).map((l) => `Linked run ${l.runId} (${l.cases.join(", ")}): ${l.reason}`),
  ]
    .map((line) => `<br>${esc(line)}`)
    .join("");

const esc = (text) =>
  String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const STATUS_TONE = {
  pass: "good",
  fixed: "good",
  fail: "bad",
  quarantined: "bad",
  fixing: "warn",
  blocked: "warn",
  running: "info",
  pending: "muted",
};
const badge = (status) =>
  `<span class="badge ${STATUS_TONE[status] ?? "muted"}">${esc(status)}</span>`;

export function exportHtml(run, state, summary, out) {
  const root = fs.realpathSync(run);
  let embedded = 0;

  // Only files inside the run are read; anything else is listed, not embedded.
  function inside(path) {
    if (!path || isAbsolute(path)) return null;
    try {
      const target = fs.realpathSync(resolve(root, path));
      const child = relative(root, target);
      if (child.startsWith(`..${sep}`) || child === ".." || isAbsolute(child))
        return null;
      return fs.statSync(target).isFile() ? target : null;
    } catch {
      return null;
    }
  }

  // A data URI for an image inside the run, or null when missing or over budget.
  function dataUri(target) {
    const size = fs.statSync(target).size;
    if (size > MAX_IMAGE || embedded + size > MAX_EMBEDDED) return null;
    embedded += size;
    const type = IMAGE_TYPES[extname(target).toLowerCase()];
    return `data:${type};base64,${fs.readFileSync(target).toString("base64")}`;
  }

  // Each image is embedded once; later mentions link to the first.
  const shown = new Map();
  function file(path, label = path) {
    const target = inside(path);
    if (!target)
      return `<p class="missing">${esc(label)}: not found in the run directory</p>`;
    const size = fs.statSync(target).size;
    const ext = extname(target).toLowerCase();
    if (IMAGE_TYPES[ext]) {
      if (shown.has(target))
        return `<p class="dim"><a href="#${shown.get(target)}">${esc(label)}</a> (shown above)</p>`;
      const src = dataUri(target);
      if (!src)
        return `<p class="missing">${esc(label)} (${size} bytes): too large to embed; see the run directory</p>`;
      const id = `img-${shown.size + 1}`;
      shown.set(target, id);
      return `<figure id="${id}"><img loading="lazy" alt="${esc(label)}" src="${src}"><figcaption>${esc(label)}</figcaption></figure>`;
    }
    if (TEXT_TYPES.has(ext) || ext === "") {
      const text = fs.readFileSync(target, "utf8");
      const clipped = text.length > MAX_TEXT;
      embedded += Math.min(text.length, MAX_TEXT);
      return `<details class="file"><summary>${esc(label)} <span class="dim">${size} bytes</span></summary><pre>${esc(clipped ? text.slice(0, MAX_TEXT) : text)}</pre>${clipped ? `<p class="missing">Truncated at ${MAX_TEXT} characters.</p>` : ""}</details>`;
    }
    return `<p class="dim">${esc(label)} (${size} bytes, not embedded)</p>`;
  }

  // Evidence in order, with each before/after image pair side by side.
  function evidence(paths) {
    const paired = new Set();
    return paths
      .map((path) => {
        if (paired.has(path)) return "";
        const after = isImage(path) ? afterOf(path) : null;
        if (!after || !paths.includes(after)) return file(path);
        paired.add(after);
        return `<div class="compare"><div><div class="side">Before</div>${file(path)}</div><div><div class="side">After</div>${file(after)}</div></div>`;
      })
      .join("");
  }

  // Each case's latest attempt, images only.
  const visuals = state.cases
    .map((item) => {
      const result = item.attempts.at(-1)?.result;
      const images = [
        ...(result?.resolutions ?? []).flatMap((r) => r.evidence),
        ...(result?.evidence ?? []),
      ].filter((path, index, all) => isImage(path) && all.indexOf(path) === index);
      return images.length
        ? `<section class="visual"><h3><a href="#case-${esc(item.id)}">${esc(item.id)}</a> ${badge(item.status)}</h3>${result?.summary ? `<p>${esc(result.summary)}</p>` : ""}${evidence(images)}</section>`
        : "";
    })
    .join("");

  // The agent's own summary, inlined as written. Relative image sources inside
  // the run become data URIs so the page stays self-contained.
  const summaryPath = inside(SUMMARY);
  const agentSummary = summaryPath
    ? fs.readFileSync(summaryPath, "utf8").replace(/\bsrc="([^"]+)"/g, (whole, path) => {
        const target = isImage(path) ? inside(path) : null;
        const src = target && dataUri(target);
        return src ? `src="${src}"` : whole;
      })
    : "";

  const note = (name) => {
    const target = inside(name);
    return target
      ? `<details class="file"><summary>${name}</summary><pre>${esc(fs.readFileSync(target, "utf8"))}</pre></details>`
      : "";
  };

  const tile = (label, value, tone = "") =>
    `<div class="tile ${tone}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`;
  const yes = (flag) => (flag ? "yes" : "no");

  const rows = state.cases
    .map((item) => {
      const attempt = item.attempts.at(-1);
      const result = attempt?.result;
      return `<tr><td><a href="#case-${esc(item.id)}">${esc(item.id)}</a><div class="dim">${esc(item.title)}</div></td><td class="nw">${badge(item.status)}</td><td class="nw">${attempt?.attempt ?? 0}</td><td class="nw">${esc(result?.cause ?? "–")}</td><td class="nw">${esc(result?.cleanup?.status ?? "–")}</td><td>${esc(result?.summary ?? "–")}</td></tr>`;
    })
    .join("");

  const findings = summary.unresolved.length
    ? `<ul>${summary.unresolved.map((f) => `<li><b>${esc(f.caseId)} / ${esc(f.id)}</b>: ${esc(f.summary)}</li>`).join("")}</ul>`
    : `<p class="dim">None.</p>`;

  const cases = state.cases
    .map((item) => {
      const attempts = item.attempts
        .map((attempt) => {
          const result = attempt.result;
          const parts = [
            `<h4>Attempt ${attempt.attempt} ${result ? badge(result.outcome) : badge(attempt.state)} <span class="dim">${esc(attempt.worker)} · ${esc(attempt.started)}${attempt.finished ? ` → ${esc(attempt.finished)}` : ""}${attempt.retry ? ` · retry: ${esc(attempt.retry)}` : ""}</span></h4>`,
          ];
          if (result?.summary) parts.push(`<p>${esc(result.summary)}</p>`);
          if (result?.cause) parts.push(`<p class="dim">Cause: ${esc(result.cause)}</p>`);
          for (const finding of result?.findings ?? [])
            parts.push(
              `<p class="finding ${finding.requiresFix ? "bad" : "muted"}">Finding <b>${esc(finding.id)}</b>: ${esc(finding.summary)}${finding.requiresFix ? "" : " (no fix required)"}</p>`
            );
          for (const resolution of result?.resolutions ?? []) {
            parts.push(
              `<p class="finding good">Resolved <b>${esc(resolution.id)}</b>: ${esc(resolution.summary)}</p>`
            );
            parts.push(evidence(resolution.evidence));
          }
          if (result?.report) parts.push(file(result.report, `Case report: ${result.report}`));
          parts.push(evidence(result?.evidence ?? []));
          if (result?.cleanup)
            parts.push(
              `<p class="dim">Cleanup: ${esc(result.cleanup.status)}. ${esc(result.cleanup.note)}</p>`
            );
          if (attempt.cleanupResolution)
            parts.push(file(attempt.cleanupResolution.report, "Cleanup verification"));
          return `<div class="attempt">${parts.join("")}</div>`;
        })
        .join("");
      return `<section class="case" id="case-${esc(item.id)}"><h3>${esc(item.id)} ${badge(item.status)}</h3><p>${esc(item.title)}</p>${note(item.file)}${attempts || '<p class="dim">No attempts.</p>'}</section>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(state.feature)} QA</title>
<style>
:root{--bg:#fbfbfa;--fg:#1d1d1b;--dim:#6b6b66;--line:#e3e2dd;--card:#fff;--good:#1f7a3f;--bad:#b3261e;--warn:#9a6400;--info:#1f5fa8;--muted:#6b6b66}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe6;--dim:#9c9b95;--line:#2d2d2a;--card:#1e1e1c;--good:#5cc47f;--bad:#f07a70;--warn:#e0a84a;--info:#79aef0;--muted:#9c9b95}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 12px}h3{margin:0 0 4px}h4{margin:16px 0 6px;font-size:15px}
.dim,.missing{color:var(--dim);font-size:13px}
.meta{color:var(--dim);font-size:13px;word-break:break-all}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:20px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
.tile .label{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.tile .value{font-size:20px;font-weight:600}
.tile.good .value{color:var(--good)}.tile.bad .value{color:var(--bad)}
.table{overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.04em}
tr:last-child td{border-bottom:0}
td.nw{white-space:nowrap}
a{color:var(--info)}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;border:1px solid currentColor;vertical-align:middle}
.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}.info{color:var(--info)}.muted{color:var(--muted)}
.case{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;margin-bottom:16px}
.attempt{border-top:1px solid var(--line);margin-top:12px}
.finding{margin:6px 0}
details.file{margin:8px 0;border:1px solid var(--line);border-radius:6px}
details.file summary{cursor:pointer;padding:6px 10px;font-size:13px}
pre{margin:0;padding:10px;overflow:auto;max-height:480px;font-size:12px;white-space:pre-wrap;word-break:break-word;border-top:1px solid var(--line)}
figure{margin:12px 0}img{max-width:100%;border:1px solid var(--line);border-radius:6px}
main img{cursor:zoom-in}
figcaption{color:var(--dim);font-size:12px}
.compare{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin:12px 0}
.compare figure{margin:0}
.side{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--dim);margin-bottom:4px}
.visual,.summary{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;margin-bottom:16px}
.image-modal{position:fixed;inset:0;z-index:1000;display:none;background:rgba(0,0,0,.88);overflow:auto;padding:56px 24px 24px}
.image-modal.open{display:flex;align-items:flex-start;justify-content:center}
.image-modal img{max-width:none;border:0;border-radius:0;cursor:zoom-out;box-shadow:0 8px 40px rgba(0,0,0,.45)}
.image-modal button{position:fixed;top:12px;right:16px;border:1px solid #777;border-radius:999px;background:#222;color:#fff;font:600 14px/1 system-ui;padding:10px 14px;cursor:pointer}
</style>
</head>
<body>
<main>
<h1>${esc(state.feature)}</h1>
<div class="meta">Run ${esc(state.runId)} · ${esc(state.mode)} mode · ${esc(state.repo)}${state.source ? ` · source ${esc(describeSource(state.source))}` : ""}<br>Created ${esc(state.created)} · updated ${esc(state.updated)} · exported ${esc(new Date().toISOString())}${links(state)}</div>
<div class="tiles">
${tile("Cases", state.cases.length)}
${tile("Passed", state.cases.filter((c) => ["pass", "fixed"].includes(c.status)).length, "good")}
${tile("Open findings", summary.unresolved.length, summary.unresolved.length ? "bad" : "good")}
${tile("Complete", yes(summary.complete), summary.complete ? "good" : "")}
${tile("All passed", yes(summary.allPassed), summary.allPassed ? "good" : "bad")}
${tile("Cleanup done", yes(summary.clean), summary.clean ? "good" : "bad")}
</div>
${agentSummary ? `<h2>Summary</h2>\n<section class="summary">${agentSummary}</section>` : ""}
${visuals ? `<h2>Visual summary</h2>\n${visuals}` : ""}
<h2>Cases</h2>
<div class="table"><table><thead><tr><th>Case</th><th>Status</th><th>Attempt</th><th>Cause</th><th>Cleanup</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Open findings</h2>
${findings}
<h2>Run notes</h2>
${note("BRIEF.md") || '<p class="dim">No BRIEF.md.</p>'}
${note("ENV.md")}
<h2>Attempts and evidence</h2>
${cases}
</main>
<div class="image-modal" role="dialog" aria-modal="true" aria-label="Zoomed image" hidden><button type="button" aria-label="Close image">Close</button><img alt=""></div>
<script>
(() => {
  const modal = document.querySelector(".image-modal");
  const zoomed = modal.querySelector("img");
  const close = modal.querySelector("button");
  let trigger = null;
  function hide() {
    modal.classList.remove("open");
    modal.hidden = true;
    zoomed.removeAttribute("src");
    trigger?.focus();
  }
  function show(image) {
    trigger = image;
    zoomed.src = image.currentSrc || image.src;
    zoomed.alt = image.alt;
    modal.hidden = false;
    modal.classList.add("open");
    close.focus();
  }
  document.querySelectorAll("main img").forEach((image) => {
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute("aria-label", image.alt ? "Zoom image: " + image.alt : "Zoom image");
    image.addEventListener("click", () => show(image));
    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        show(image);
      }
    });
  });
  close.addEventListener("click", hide);
  zoomed.addEventListener("click", hide);
  modal.addEventListener("click", (event) => { if (event.target === modal) hide(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.hidden) hide(); });
})();
</script>
</body>
</html>
`;

  const path = resolve(out ?? join(run, "REPORT.html"));
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, html, { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, path);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return {
    runId: state.runId,
    path,
    bytes: Buffer.byteLength(html),
    complete: summary.complete,
    allPassed: summary.allPassed,
    openFindings: summary.unresolved.length,
  };
}
