#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";

const [, , profilePath, configPath] = process.argv;
if (!profilePath || !configPath) {
  console.error("Usage: merge-omp-models.mjs <profile> <config>");
  process.exit(2);
}

function readConfig(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.trim()) return {};
  const value = Bun.YAML.parse(source);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${filePath} must contain a configuration object`);
  }
  return value;
}

function mergeObjects(base, overlay) {
  const result = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] !== null &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeObjects(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

const profile = readConfig(profilePath);
const current = readConfig(configPath);
const merged = mergeObjects(current, profile);

const directory = path.dirname(configPath);
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const temporaryPath = `${configPath}.tmp-${process.pid}`;
const output = `${Bun.YAML.stringify(merged, null, 2)}\n`;
fs.writeFileSync(temporaryPath, output, { mode: 0o600 });
fs.chmodSync(temporaryPath, 0o600);
fs.renameSync(temporaryPath, configPath);
fs.chmodSync(configPath, 0o600);
