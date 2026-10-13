// `wqa token`: prints a session access token for the QA user on the run's stack.
// Logs in through POST /api/auth/login and caches the access token (never the
// refresh token) in ~/.waffled-qa/tokens.json until shortly before it expires.
import { fail } from "./lib/cli.mjs";
import { cachePath, sessionToken } from "./lib/local.mjs";

function options(args) {
  const flags = ["--refresh", "--info"];
  const values = ["--base-url", "--stack"];
  const result = {};
  for (let n = 0; n < args.length; n++) {
    const key = args[n];
    if (key in result) fail(`duplicate option: ${key}`);
    if (flags.includes(key)) result[key] = true;
    else if (values.includes(key)) {
      if (!args[n + 1] || args[n + 1].startsWith("--")) fail(`expected a value for ${key}`);
      result[key] = args[++n];
    } else fail(`unknown option: ${key}`);
  }
  return result;
}

export async function token(args) {
  if (args[0] === "help" || args[0] === "--help") {
    process.stdout.write(
      `${JSON.stringify(
        {
          usage: "wqa token [--stack 8080|8081] [--base-url <url>] [--refresh] [--info]",
          output: 'the access token on stdout; use it inline, for example -H "Authorization: Bearer $(wqa token --stack 8081)"',
          "--refresh": "ignore the cache and log in again",
          "--info": "print JSON metadata with the token redacted",
          env: "WAFFLED_QA_STACK, WAFFLED_QA_BASE_URL, WAFFLED_QA_EMAIL, WAFFLED_QA_PASSWORD (required for :8080)",
          cache: cachePath(),
        },
        null,
        2
      )}\n`
    );
    return;
  }
  const opts = options(args);
  const { baseUrl, entry, cached } = await sessionToken(opts);
  if (opts["--info"]) {
    const { token, ...info } = entry;
    process.stdout.write(
      `${JSON.stringify({ baseUrl, ...info, token: `${token.slice(0, 8)}…`, cached, cache: cachePath() }, null, 2)}\n`
    );
  } else process.stdout.write(`${entry.token}\n`);
}
