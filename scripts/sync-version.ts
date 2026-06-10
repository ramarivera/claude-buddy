/**
 * Sync version fields across the repo so package.json is the single source of truth.
 *
 * Run directly:
 *   bun run sync-version
 *
 * Wired into npm lifecycle via `"version"` script in package.json so that
 * `bun pm version <bump>` (or `npm version <bump>) updates all three files
 * together and git-adds them for the auto-generated version commit.
 *
 * --check: exit non-zero without modifying files if anything is out of sync
 *          (use this in CI).
 */

import { readFileSync, writeFileSync } from "fs";

const CHECK_ONLY = process.argv.includes("--check");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const { version } = pkg;
if (typeof version !== "string" || !version) {
  console.error("sync-version: package.json is missing a version field");
  process.exit(2);
}

type Target = {
  path: string;
  read: () => unknown;
  diffs: (doc: any) => { label: string; current: string }[];
  apply: (doc: any) => void;
};

const targets: Target[] = [
  {
    path: ".claude-plugin/plugin.json",
    read: () => JSON.parse(readFileSync(".claude-plugin/plugin.json", "utf8")),
    diffs: (doc) => [{ label: "version", current: doc.version }],
    apply: (doc) => {
      doc.version = version;
    },
  },
  {
    path: ".claude-plugin/marketplace.json",
    read: () =>
      JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf8")),
    diffs: (doc) => {
      const out: { label: string; current: string }[] = [
        { label: "metadata.version", current: doc.metadata?.version },
      ];
      for (let i = 0; i < (doc.plugins?.length ?? 0); i++) {
        out.push({
          label: `plugins[${i}].version`,
          current: doc.plugins[i].version,
        });
      }
      return out;
    },
    apply: (doc) => {
      if (doc.metadata) doc.metadata.version = version;
      for (const p of doc.plugins ?? []) p.version = version;
    },
  },
];

let drifted = false;
for (const t of targets) {
  const doc = t.read();
  const diffs = t.diffs(doc).filter((d) => d.current !== version);
  if (diffs.length === 0) continue;
  drifted = true;
  for (const d of diffs) {
    const prefix = CHECK_ONLY ? "DRIFT" : "sync";
    console.log(`${prefix}: ${t.path} :: ${d.label} ${d.current} -> ${version}`);
  }
  if (!CHECK_ONLY) {
    t.apply(doc);
    writeFileSync(t.path, JSON.stringify(doc, null, 4) + "\n");
  }
}

if (CHECK_ONLY && drifted) {
  console.error("sync-version: version fields are out of sync with package.json");
  process.exit(1);
}
if (!drifted) console.log(`sync-version: all version fields already at ${version}`);
