import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const meta = JSON.parse(await readFile(path.join(root, "dist/esbuild-meta.json"), "utf8"));
const bundlePath = path.join(root, "dist/krea-companion.mjs");
const normalizedBundle = (await readFile(bundlePath, "utf8")).replace(/[ \t]+$/gm, "");
await writeFile(bundlePath, normalizedBundle);

const packageNameFromInput = input => {
  const marker = "node_modules/";
  const index = input.lastIndexOf(marker);
  if (index < 0) return undefined;
  const parts = input.slice(index + marker.length).split("/");
  return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
};

const packageNames = [...new Set(Object.keys(meta.inputs).map(packageNameFromInput).filter(Boolean))].sort();
const sections = [];

for (const name of packageNames) {
  const packageDir = path.join(root, "node_modules", ...name.split("/"));
  const pkg = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
  const licenseFile = (await readdir(packageDir)).find(file => /^licen[cs]e(?:\.|$)/i.test(file));
  if (!licenseFile) throw new Error(`No license file found for bundled package ${name}`);
  const licenseText = (await readFile(path.join(packageDir, licenseFile), "utf8")).replace(/[ \t]+$/gm, "").trim();
  sections.push(`${name}@${pkg.version} (${pkg.license ?? "license file included"})\n${"-".repeat(72)}\n${licenseText}`);
}

const header = "THIRD-PARTY SOFTWARE NOTICES\n\nThis runtime bundles the following packages. Their respective license texts follow.\n";
await writeFile(path.join(root, "THIRD_PARTY_NOTICES.txt"), `${header}\n${sections.join("\n\n")}\n`);
console.log(`Wrote notices for ${packageNames.length} bundled packages.`);
