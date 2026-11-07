// Adds or removes this server in the Claude Code and Claude Desktop configs.
// Usage: node scripts/register.mjs install|uninstall
import { copyFileSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_NAME = 'telegram';
const serverPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.mjs');

const subfolders = (parent, prefix) =>
  existsSync(parent)
    ? readdirSync(parent).filter((entry) => entry.toLowerCase().startsWith(prefix)).map((entry) => path.join(parent, entry))
    : [];

// Claude leaves this marker in a folder after moving its data elsewhere.
const dataMovedOut = (dir) => readdirSync(dir).some((entry) => entry.startsWith('.user-data-left'));

function desktopConfigs() {
  const dirs = [];
  if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'Claude'));

  // Microsoft Store installs keep their data in a package folder, or in
  // Claude-Data once it has been moved out of the package.
  if (process.env.LOCALAPPDATA) {
    for (const dir of subfolders(path.join(process.env.LOCALAPPDATA, 'Packages'), 'claude_')) {
      dirs.push(path.join(dir, 'LocalCache', 'Roaming', 'Claude'));
    }
    dirs.push(...subfolders(path.join(process.env.LOCALAPPDATA, 'Claude-Data'), 'claude_'));
  }
  return dirs.filter((dir) => existsSync(dir) && !dataMovedOut(dir)).map((dir) => ({
    label: 'Claude Desktop',
    file: path.join(dir, 'claude_desktop_config.json'),
    entry: { command: process.execPath, args: [serverPath] },
  }));
}

function targets() {
  const code = {
    label: 'Claude Code',
    file: path.join(homedir(), '.claude.json'),
    entry: { type: 'stdio', command: process.execPath, args: [serverPath], env: {} },
  };
  return [code, ...desktopConfigs()];
}

function readConfig(file) {
  if (!existsSync(file)) return {};
  const contents = readFileSync(file, 'utf8').replace(/^﻿/, '');
  return contents.trim() ? JSON.parse(contents) : {};
}

// Back up, then replace in one step so a failure can't leave a partial file.
function writeConfig(file, config) {
  if (existsSync(file)) copyFileSync(file, `${file}.bak`);
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`);
  renameSync(temp, file);
}

const action = process.argv[2];
if (action !== 'install' && action !== 'uninstall') {
  console.error('Usage: node scripts/register.mjs install|uninstall');
  process.exit(2);
}

// Parse everything first, so one bad file means nothing is changed anywhere.
const plans = targets().map((target) => {
  try {
    return { ...target, config: readConfig(target.file) };
  } catch (error) {
    console.error(`${target.file} is not valid JSON (${error.message}). No configs were changed.`);
    process.exit(1);
  }
});

for (const { label, file, entry, config } of plans) {
  if (action === 'install') {
    config.mcpServers = { ...config.mcpServers, [SERVER_NAME]: entry };
    writeConfig(file, config);
    console.log(`Registered in ${label}: ${file}`);
  } else if (config.mcpServers?.[SERVER_NAME]) {
    delete config.mcpServers[SERVER_NAME];
    writeConfig(file, config);
    console.log(`Removed from ${label}: ${file}`);
  } else {
    console.log(`Not registered in ${label}: ${file}`);
  }
}
