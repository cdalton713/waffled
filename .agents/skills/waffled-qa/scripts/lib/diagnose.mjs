// `wqa diagnose`: classifies a blank or stuck page from the browser session's
// current tab: hidden tab, server down, still loading, app error, or blank.
import { connect } from "node:net";
import { must, requireSession } from "./browser.mjs";
import { attemptContext, writeEvidence } from "./attempt.mjs";

const PAGE_STATE = `JSON.stringify({
  visibility: document.visibilityState,
  readyState: document.readyState,
  title: document.title,
  text: (document.body?.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 300),
})`;

// true when something accepts TCP connections on the page's host and port.
const listening = (host, port) =>
  new Promise((done) => {
    const socket = connect({ host, port, timeout: 1500 });
    const finish = (value) => {
      socket.destroy();
      done(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });

export function classify({ url, visibility, readyState, text, serverUp, errors }) {
  if (!url || url === "about:blank") return "no-page";
  if (serverUp === false) return "server-down";
  if (visibility !== "visible") return "hidden-tab";
  if (readyState !== "complete") return "loading";
  if (errors > 0) return "app-error";
  if (!text) return "blank";
  return "ok";
}

export async function diagnose(run, opts) {
  requireSession();
  const url = must(["get", "url"]).url;
  const state = JSON.parse(must(["eval", PAGE_STATE]).result);
  const errors = must(["errors"]).errors ?? [];
  const consoleErrors = (must(["console"]).messages ?? []).filter((m) => m.type === "error");
  const failed = (must(["network", "requests", "--status", "400-599"]).requests ?? []).map(
    ({ method, url, status }) => ({ method, url, status })
  );
  let serverUp = null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {}
  if (parsed && /^https?:$/.test(parsed.protocol)) {
    const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
    serverUp = await listening(parsed.hostname.replace(/^\[|\]$/g, ""), port);
  }
  const likely = classify({ url, ...state, serverUp, errors: errors.length });
  const output = {
    likely,
    url,
    visibility: state.visibility,
    readyState: state.readyState,
    title: state.title,
    text: state.text.slice(0, 160),
    serverUp,
    errors: errors.length,
    consoleErrors: consoleErrors.length,
    failedRequests: failed.length,
  };
  if (likely === "hidden-tab")
    output.hint = "bring the tab forward or use its own session, then reload and check again";
  if (opts["--label"]) {
    const context = attemptContext(run, opts);
    output.file = writeEvidence(context, `${opts["--label"]}.diagnose.json`, {
      ...output,
      text: state.text,
      errors,
      consoleErrors,
      failed,
      at: new Date().toISOString(),
    });
  }
  return output;
}
