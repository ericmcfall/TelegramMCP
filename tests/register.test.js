import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'register.mjs');
const run = promisify(execFile);

// Points the script at a throwaway home so real configs are never touched.
async function sandbox() {
  const root = await mkdtemp(path.join(tmpdir(), 'tgmcp-reg-'));
  const appData = path.join(root, 'AppData', 'Roaming');
  const localAppData = path.join(root, 'AppData', 'Local');
  await mkdir(path.join(appData, 'Claude'), { recursive: true });
  await mkdir(path.join(localAppData, 'Packages'), { recursive: true });
  return {
    root,
    localAppData,
    codeConfig: path.join(root, '.claude.json'),
    desktopConfig: path.join(appData, 'Claude', 'claude_desktop_config.json'),
    env: { ...process.env, USERPROFILE: root, HOME: root, APPDATA: appData, LOCALAPPDATA: localAppData },
  };
}
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

test('install adds the server and keeps everything else', async () => {
  const box = await sandbox();
  await writeFile(box.codeConfig, JSON.stringify({ keep: 1, mcpServers: { other: { command: 'x' } } }));

  await run(process.execPath, [script, 'install'], { env: box.env });

  const code = await readJson(box.codeConfig);
  assert.equal(code.keep, 1);
  assert.deepEqual(code.mcpServers.other, { command: 'x' });
  assert.ok(code.mcpServers.telegram.args[0].endsWith('server.mjs'));
  assert.ok((await readJson(box.desktopConfig)).mcpServers.telegram);
  assert.deepEqual(await readJson(`${box.codeConfig}.bak`), { keep: 1, mcpServers: { other: { command: 'x' } } });
});

test('uninstall removes only this server', async () => {
  const box = await sandbox();
  await writeFile(box.codeConfig, JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
  await run(process.execPath, [script, 'install'], { env: box.env });
  await run(process.execPath, [script, 'uninstall'], { env: box.env });
  assert.deepEqual((await readJson(box.codeConfig)).mcpServers, { other: { command: 'x' } });
});

test('invalid JSON stops the run and changes nothing', async () => {
  const box = await sandbox();
  await writeFile(box.desktopConfig, '{ not json');
  await writeFile(box.codeConfig, '{"keep":1}');

  await assert.rejects(run(process.execPath, [script, 'install'], { env: box.env }), /not valid JSON/);

  assert.deepEqual(await readJson(box.codeConfig), { keep: 1 });
  assert.equal(await readFile(box.desktopConfig, 'utf8'), '{ not json');
});

test('data moved to Claude-Data is followed and the old folders are skipped', async () => {
  const box = await sandbox();
  const roaming = path.dirname(box.desktopConfig);
  const live = path.join(box.localAppData, 'Claude-Data', 'claude_abc');
  await writeFile(path.join(roaming, '.user-data-left.claude_abc'), '{}');
  await mkdir(live, { recursive: true });
  const liveConfig = path.join(live, 'claude_desktop_config.json');
  await writeFile(liveConfig, JSON.stringify({ preferences: { keep: true } }));
  await writeFile(path.join(box.localAppData, 'Claude-Data', 'README.txt'), 'note');

  await run(process.execPath, [script, 'install'], { env: box.env });

  const config = await readJson(liveConfig);
  assert.deepEqual(config.preferences, { keep: true });
  assert.ok(config.mcpServers.telegram);
  assert.ok(!existsSync(box.desktopConfig));
});

test('a Store package folder is used unless its data moved out', async () => {
  const box = await sandbox();
  const active = path.join(box.localAppData, 'Packages', 'Claude_aaa', 'LocalCache', 'Roaming', 'Claude');
  const moved = path.join(box.localAppData, 'Packages', 'Claude_bbb', 'LocalCache', 'Roaming', 'Claude');
  await mkdir(active, { recursive: true });
  await mkdir(moved, { recursive: true });
  await writeFile(path.join(moved, '.user-data-left.claude_bbb'), '');

  await run(process.execPath, [script, 'install'], { env: box.env });

  assert.ok(existsSync(path.join(active, 'claude_desktop_config.json')));
  assert.ok(!existsSync(path.join(moved, 'claude_desktop_config.json')));
});
