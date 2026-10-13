// Shared CLI plumbing: errors, JSON output, and option parsing.
export const fail = (message) => {
  throw new Error(message);
};

export const print = (value, compact = false) =>
  process.stdout.write(
    `${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)}\n`
  );

export const required = (value, name) => {
  if (typeof value !== "string" || !value.trim()) fail(`${name} is required`);
  return value;
};

// Splits `args` into leading positionals and `--option value` pairs. `flags`
// take no value. Unknown options fail with the command name.
export function parse(command, args, { values = [], flags = [], positionals = 0 } = {}) {
  const opts = {};
  const positional = [];
  let n = 0;
  while (n < args.length && positional.length < positionals && !args[n].startsWith("--"))
    positional.push(args[n++]);
  for (; n < args.length; n++) {
    const key = args[n];
    if (key in opts) fail(`duplicate option: ${key}`);
    if (flags.includes(key)) {
      opts[key] = true;
      continue;
    }
    if (!key.startsWith("--") || !args[n + 1] || args[n + 1].startsWith("--"))
      fail(`expected --option value: ${key}`);
    if (!values.includes(key)) fail(`unknown option for ${command}: ${key}`);
    opts[key] = args[++n];
  }
  return { opts, positional };
}

// "55s", "2m", or a bare number of seconds -> milliseconds.
export function duration(text, name) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(String(text));
  if (!match) fail(`${name} must look like 500ms, 30s, or 2m`);
  const unit = { ms: 1, s: 1000, m: 60_000 }[match[2] ?? "s"];
  return Number(match[1]) * unit;
}

export const list = (text) =>
  String(text ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
