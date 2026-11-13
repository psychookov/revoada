'use strict';
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const { spawn, execFile, execFileSync } = require('child_process');

app.setName('Revoada');

let win = null;
let child = null;
let cancelled = false;
let rclonePath = null;

const IS_WIN = process.platform === 'win32';
// A interface trabalha sempre com "/" (no Windows: C:/Pasta); o Node e o rclone aceitam essa forma.
const toSlash = (p) => (IS_WIN ? String(p).replace(/\\/g, '/') : p);

// ------------------------------------------------------------------ utilidades
function findRclone() {
  if (process.env.REVOADA_RCLONE) return process.env.REVOADA_RCLONE;
  const home = os.homedir();
  const exe = IS_WIN ? 'rclone.exe' : 'rclone';
  let dirs = [];
  if (IS_WIN) {
    // 1º o rclone que acompanha o app (versão portátil), depois o que o usuário já tiver instalado
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    dirs = [
      path.join(process.resourcesPath || '', 'bin'),
      path.dirname(process.execPath),
      ...(process.env.PATH || '').split(path.delimiter),
      path.join(local, 'Microsoft', 'WinGet', 'Links'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'rclone'),
      path.join(home, 'scoop', 'shims'),
      path.join(process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey', 'bin'),
    ];
  } else {
    dirs = (process.env.PATH || '').split(path.delimiter)
      .concat(['/usr/bin', '/usr/local/bin', '/snap/bin', path.join(home, '.local/bin'), path.join(home, 'bin')]);
  }
  for (const d of dirs) {
    if (!d) continue;
    const p = path.join(d.replace(/^"|"$/g, ''), exe);
    try {
      fs.accessSync(p, IS_WIN ? fs.constants.F_OK : fs.constants.X_OK);
      return p;
    } catch (_) { /* próximo */ }
  }
  return null;
}

const stateFile = () => path.join(app.getPath('userData'), 'state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (_) { return {}; }
}
function saveState(s) {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2));
  } catch (_) { /* ignora */ }
}

// divide "--a 1 --b 'x y'" em argumentos, respeitando aspas
function splitArgs(str) {
  const out = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (const ch of String(str || '')) {
    if (quote) {
      if (ch === quote) quote = null; else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch; has = true;
    } else if (/\s/.test(ch)) {
      if (cur || has) { out.push(cur); cur = ''; has = false; }
    } else {
      cur += ch;
    }
  }
  if (cur || has) out.push(cur);
  return out;
}

function runRclone(args, timeout = 120000) {
  return new Promise((resolve) => {
    if (!rclonePath) return resolve({ ok: false, error: 'rclone não encontrado' });
    execFile(rclonePath, args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const lines = String(stderr || err.message).trim().split('\n');
        resolve({ ok: false, error: lines[lines.length - 1] || 'erro desconhecido' });
      } else {
        resolve({ ok: true, stdout });
      }
    });
  });
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

// ------------------------------------------------------------------------- IPC
ipcMain.handle('init', () => {
  rclonePath = findRclone();
  const defs = [
    ['home', 'Início', 'home'],
    ['documents', 'Documentos', 'documents'],
    ['downloads', 'Downloads', 'downloads'],
    ['videos', 'Vídeos', 'videos'],
    ['pictures', 'Imagens', 'pictures'],
    ['music', 'Música', 'music'],
  ];
  const places = [];
  for (const [name, label, key] of defs) {
    try {
      const p = app.getPath(name);
      if (fs.existsSync(p)) places.push({ key, label, path: toSlash(p) });
    } catch (_) { /* sem essa pasta */ }
  }
  return { rclone: rclonePath, home: toSlash(os.homedir()), places, state: loadState() };
});

ipcMain.handle('state:save', (_e, s) => { saveState(s); return true; });

ipcMain.handle('rclone:remotes', async () => {
  const r = await runRclone(['listremotes'], 20000);
  if (!r.ok) return r;
  return { ok: true, remotes: r.stdout.split('\n').map((l) => l.trim()).filter(Boolean) };
});

ipcMain.handle('rclone:ls', async (_e, remote, p) => {
  const r = await runRclone(['lsjson', '--no-mimetype', '--no-modtime', `${remote}${p || ''}`]);
  if (!r.ok) return r;
  try {
    const items = JSON.parse(r.stdout || '[]');
    const dirs = items.filter((d) => d.IsDir).map((d) => d.Name).sort(collator.compare);
    const files = items.filter((d) => !d.IsDir)
      .map((d) => ({ name: d.Name, size: d.Size }))
      .sort((a, b) => collator.compare(a.name, b.name));
    return { ok: true, dirs, files };
  } catch (e) {
    return { ok: false, error: 'Resposta inesperada do rclone' };
  }
});

ipcMain.handle('local:ls', async (_e, p) => {
  try {
    if (IS_WIN && p === '/') { // raiz virtual no Windows: lista as unidades
      const drives = [];
      await Promise.all('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(async (L) => {
        try { await fs.promises.access(`${L}:\\`); drives.push(`${L}:`); } catch (_) { /* sem essa unidade */ }
      }));
      drives.sort();
      return { ok: true, path: '/', dirs: drives, files: [] };
    }
    let q = p || os.homedir();
    if (IS_WIN && /^[A-Za-z]:$/.test(q)) q += '/';
    const abs = path.resolve(q);
    const ents = await fs.promises.readdir(abs, { withFileTypes: true });
    const dirs = [];
    const files = [];
    await Promise.all(ents.map(async (d) => {
      if (d.name.startsWith('.')) return;
      const full = path.join(abs, d.name);
      let isDir = d.isDirectory();
      let isFile = d.isFile();
      let size = 0;
      if (d.isSymbolicLink() || isFile) {
        try {
          const st = await fs.promises.stat(full);
          isDir = st.isDirectory();
          isFile = st.isFile();
          size = st.size;
        } catch (_) { /* link quebrado */ }
      }
      if (isDir) dirs.push(d.name);
      else if (isFile) files.push({ name: d.name, size });
    }));
    dirs.sort(collator.compare);
    files.sort((a, b) => collator.compare(a.name, b.name));
    return { ok: true, path: toSlash(abs), dirs, files };
  } catch (e) {
    const msg = e.code === 'EACCES' ? 'Sem permissão para abrir esta pasta'
      : e.code === 'ENOENT' ? 'Pasta não encontrada' : e.message;
    return { ok: false, error: msg };
  }
});

ipcMain.handle('local:pick', async (_e, start) => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Escolher pasta local',
    defaultPath: start || os.homedir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled || !r.filePaths.length ? null : toSlash(r.filePaths[0]);
});

function parseLine(line) {
  line = line.trim();
  if (!line) return null;
  let obj;
  try { obj = JSON.parse(line); } catch (_) { return { type: 'log', text: line, err: false }; }
  if (!obj || typeof obj !== 'object') return { type: 'log', text: line, err: false };
  if (obj.stats && typeof obj.stats === 'object') return { type: 'stats', stats: obj.stats };
  let text = String(obj.msg || '');
  if (obj.object && !text.startsWith(String(obj.object))) text = `${obj.object}: ${text}`;
  return { type: 'log', text, err: obj.level === 'error' || obj.level === 'critical' };
}

ipcMain.handle('copy:start', (_e, o) => {
  if (child) return { ok: false, error: 'Já existe uma cópia em andamento' };
  if (!rclonePath) return { ok: false, error: 'rclone não encontrado' };
  const args = ['copy', String(o.src), String(o.dst)];
  if (o.dry) args.push('--dry-run');
  args.push(...splitArgs(o.extra));
  args.push('--use-json-log', '-v', '--stats', '1s');

  const send = (d) => { if (win && !win.isDestroyed()) win.webContents.send('copy:event', d); };
  cancelled = false;
  let finished = false;
  const finish = (code) => {
    if (finished) return;
    finished = true;
    child = null;
    send({ type: 'done', code, cancelled });
  };

  child = spawn(rclonePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) {
    readline.createInterface({ input: stream }).on('line', (line) => {
      const ev = parseLine(line);
      if (ev) send(ev);
    });
  }
  child.on('error', (e) => {
    send({ type: 'log', text: `Falha ao executar o rclone: ${e.message}`, err: true });
    finish(-1);
  });
  child.on('close', (code) => finish(code == null ? -1 : code));
  return { ok: true };
});

ipcMain.handle('copy:cancel', () => {
  if (child) {
    cancelled = true;
    child.kill('SIGTERM');
  }
  return true;
});

// ------------------------------------------------------------------- conexões
// O assistente usa o modo guiado do próprio rclone (`config create/update
// --non-interactive`), que devolve cada pergunta em JSON. Nenhuma credencial
// é enviada para a interface: ela só recebe nome, tipo e tipo de drive.
const CREATE_NAME_RE = /^[A-Za-z0-9_.+@][A-Za-z0-9_.+@-]*$/;
const anyName = (n) => typeof n === 'string' && n.length > 0 && !n.startsWith('-') && !/[:/\n\r]/.test(n);
const HIDDEN_BACKENDS = new Set([
  'alias', 'union', 'combine', 'cache', 'chunker', 'compress', 'crypt', 'hasher',
  'memory', 'local', 'tardigrade', 'netstorage', 'doi', 'http', 'archive',
]);
const AUTH_URL_RE = /https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/auth\?state=[\w-]+/;

let confSession = null; // { proc, killedBy }
let pendingCreate = null; // conexão nova já gravada pelo rclone, mas ainda não concluída
let providersCache = null;

// Programas "falsos" de abrir navegador, só para o rclone: assim ele não abre
// uma segunda janela e quem abre o link (uma única vez) é o Revoada.
function shimDir() {
  const dir = path.join(app.getPath('userData'), 'shim');
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const n of ['xdg-open', 'x-www-browser', 'www-browser', 'gnome-open', 'kde-open']) {
      const f = path.join(dir, n);
      if (!fs.existsSync(f)) fs.writeFileSync(f, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    }
  } catch (_) { /* sem shim: o rclone abrirá o navegador por conta própria */ }
  return dir;
}

function lastErrorLine(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const err = lines.filter((l) => /error|failed|couldn't|can't|denied|refused|invalid/i.test(l));
  return (err.length ? err[err.length - 1] : lines[lines.length - 1] || 'erro desconhecido')
    .replace(/^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d\s+(ERROR|NOTICE|CRITICAL)\s*:\s*/i, '')
    .replace(/^Error:\s*/i, '');
}

function runConf(args, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve) => {
    if (!rclonePath) return resolve({ ok: false, error: 'rclone não encontrado' });
    if (confSession) return resolve({ ok: false, error: 'Já existe uma configuração em andamento' });
    // No Linux o Revoada abre o link (uma vez só); no Windows quem abre é o próprio rclone.
    const env = IS_WIN ? { ...process.env } : { ...process.env, PATH: `${shimDir()}${path.delimiter}${process.env.PATH || ''}` };
    const proc = spawn(rclonePath, ['--ask-password=false', ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const session = { proc, killedBy: null };
    confSession = session;
    let out = '';
    let err = '';
    let opened = false;
    const send = (d) => { if (win && !win.isDestroyed()) win.webContents.send('conf:event', d); };
    const scan = (text) => {
      if (opened) return;
      const m = AUTH_URL_RE.exec(text);
      if (m) {
        opened = true;
        send({ type: 'auth-url', url: m[0] });
        if (!IS_WIN) shell.openExternal(m[0]).catch(() => {});
      }
    };
    proc.stdout.on('data', (c) => { out += c; scan(String(c)); });
    proc.stderr.on('data', (c) => { err += c; scan(String(c)); });
    const timer = setTimeout(() => { session.killedBy = 'timeout'; proc.kill('SIGTERM'); }, timeoutMs);
    const end = (r) => { clearTimeout(timer); if (confSession === session) confSession = null; resolve(r); };
    proc.on('error', (e) => end({ ok: false, error: `Falha ao executar o rclone: ${e.message}` }));
    proc.on('close', (code) => {
      if (session.killedBy === 'cancel') return end({ ok: false, cancelled: true });
      if (session.killedBy === 'timeout') return end({ ok: false, error: 'Tempo esgotado esperando a autorização no navegador.' });
      if (code !== 0) return end({ ok: false, error: lastErrorLine(err || out) });
      try {
        return end({ ok: true, json: JSON.parse(out) });
      } catch (_) {
        return end({ ok: false, error: 'Resposta inesperada do rclone' });
      }
    });
  });
}

async function dumpConfig() {
  const r = await runRclone(['--ask-password=false', 'config', 'dump'], 30000);
  if (!r.ok) return r;
  try { return { ok: true, data: JSON.parse(r.stdout || '{}') }; } catch (_) {
    return { ok: false, error: 'Não consegui ler a configuração do rclone' };
  }
}

async function loadProviders() {
  if (providersCache) return providersCache;
  const r = await runRclone(['config', 'providers'], 30000);
  if (!r.ok) return null;
  try { providersCache = JSON.parse(r.stdout); } catch (_) { providersCache = null; }
  return providersCache;
}

ipcMain.handle('conf:list', async () => {
  const d = await dumpConfig();
  if (!d.ok) return d;
  const remotes = Object.entries(d.data)
    .map(([name, v]) => ({ name, type: v.type || '', driveType: v.drive_type || '', hasToken: !!v.token }))
    .sort((a, b) => collator.compare(a.name, b.name));
  const f = await runRclone(['--ask-password=false', 'config', 'file'], 15000);
  const configFile = f.ok ? (f.stdout.trim().split('\n').pop() || '') : '';
  return { ok: true, remotes, configFile };
});

// ------------------------------------------------- importar backup (rclone.conf)
// O arquivo é lido e interpretado só aqui no processo principal: os tokens nunca
// chegam à interface. Os blocos são gravados como estão, sem reescrever valores.
let importDoc = null; // { file, blocks: Map<nome, texto> }

function parseIni(text) {
  const blocks = new Map();
  let name = null; let buf = [];
  const flush = () => { if (name !== null) blocks.set(name, buf.join('\n').replace(/\s+$/, '') + '\n'); };
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (m) { flush(); name = m[1].trim(); buf = [`[${name}]`]; } else if (name !== null) buf.push(line);
  }
  flush();
  return blocks;
}
const isEncryptedConf = (t) => /^\s*(#\s*Encrypted rclone configuration File|RCLONE_ENCRYPT_V\d)/i.test(t);
const blockField = (b, k) => { const m = new RegExp(`^${k}\\s*=\\s*(.*)$`, 'm').exec(b); return m ? m[1].trim() : ''; };

async function rcloneConfigPath() {
  const f = await runRclone(['--ask-password=false', 'config', 'file'], 15000);
  if (!f.ok) return '';
  return f.stdout.trim().split('\n').pop().trim();
}

ipcMain.handle('conf:import-pick', async (_e, droppedPath) => {
  let file = droppedPath;
  if (!file) {
    const r = await dialog.showOpenDialog(win, {
      title: 'Importar backup do rclone',
      defaultPath: app.getPath('downloads'),
      properties: ['openFile'],
      filters: [{ name: 'Configuração do rclone', extensions: ['conf', 'txt', 'ini'] }, { name: 'Todos os arquivos', extensions: ['*'] }],
    });
    if (r.canceled || !r.filePaths.length) return { ok: true, canceled: true };
    file = r.filePaths[0];
  }
  let text;
  try {
    if (fs.statSync(file).size > 5 * 1024 * 1024) return { ok: false, error: 'O arquivo é grande demais para ser um rclone.conf.' };
    text = fs.readFileSync(file, 'utf8');
  } catch (e) { return { ok: false, error: `Não consegui ler o arquivo: ${e.message}` }; }
  if (isEncryptedConf(text)) {
    return { ok: false, error: 'Este arquivo está criptografado com senha. Descriptografe-o antes (rclone config encryption remove) ou use uma cópia sem senha.' };
  }
  const blocks = parseIni(text);
  const cur = await dumpConfig();
  const existing = cur.ok ? cur.data : {};
  const remotes = []; const skipped = [];
  for (const [name, b] of blocks) {
    const type = blockField(b, 'type');
    if (!type || !anyName(name)) { skipped.push(name); continue; }
    remotes.push({
      name, type, driveType: blockField(b, 'drive_type'), hasToken: !!blockField(b, 'token'),
      exists: Object.prototype.hasOwnProperty.call(existing, name),
    });
  }
  if (!remotes.length) return { ok: false, error: 'Não encontrei nenhuma conexão neste arquivo. Ele é mesmo um rclone.conf?' };
  importDoc = { file, blocks };
  remotes.sort((a, b) => collator.compare(a.name, b.name));
  return { ok: true, file: path.basename(file), remotes, skipped: skipped.length };
});

ipcMain.handle('conf:import-apply', async (_e, o) => {
  if (!importDoc) return { ok: false, error: 'Escolha o arquivo de backup novamente.' };
  const names = (o && Array.isArray(o.names) ? o.names : []).filter((n) => importDoc.blocks.has(n) && anyName(n));
  if (!names.length) return { ok: false, error: 'Nenhuma conexão selecionada.' };
  const overwrite = new Set(o && Array.isArray(o.overwrite) ? o.overwrite : []);
  const dest = await rcloneConfigPath();
  if (!dest) return { ok: false, error: 'Não consegui descobrir onde o rclone guarda a configuração.' };
  let current = '';
  let hadFile = false;
  try { current = fs.readFileSync(dest, 'utf8'); hadFile = true; } catch (e) { if (e.code !== 'ENOENT') return { ok: false, error: `Não consegui ler ${dest}: ${e.message}` }; }
  if (isEncryptedConf(current)) return { ok: false, error: 'A configuração atual do rclone tem senha. Remova a senha antes de importar.' };
  const have = parseIni(current);
  const toAdd = []; const replaced = [];
  for (const n of names) {
    if (have.has(n) && !overwrite.has(n)) continue; // nunca sobrescreve sem confirmação
    if (have.has(n)) replaced.push(n);
    toAdd.push(n);
  }
  if (!toAdd.length) return { ok: false, error: 'Todas as conexões escolhidas já existem. Marque “substituir” para trocá-las.' };
  // reconstrói o arquivo: mantém o que já existe, troca só o que foi confirmado
  const out = [];
  for (const [n, b] of have) if (!replaced.includes(n)) out.push(b);
  for (const n of toAdd) out.push(importDoc.blocks.get(n));
  const final = out.join('\n');
  let backup = '';
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (hadFile) {
      backup = `${dest}.revoada-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      fs.copyFileSync(dest, backup);
      fs.chmodSync(backup, 0o600);
    }
    const tmp = `${dest}.revoada-tmp`;
    fs.writeFileSync(tmp, final, { mode: 0o600 });
    fs.renameSync(tmp, dest);
  } catch (e) { return { ok: false, error: `Não consegui gravar a configuração: ${e.message}` }; }
  const chk = await dumpConfig();
  const missing = chk.ok ? toAdd.filter((n) => !Object.prototype.hasOwnProperty.call(chk.data, n)) : toAdd;
  if (missing.length) return { ok: false, error: 'O rclone não reconheceu as conexões gravadas.', backup };
  importDoc = null;
  return { ok: true, imported: toAdd.length, replaced: replaced.length, backup };
});

ipcMain.handle('conf:export', async () => {
  const src = await rcloneConfigPath();
  if (!src || !fs.existsSync(src)) return { ok: false, error: 'Ainda não há configuração do rclone para exportar.' };
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const r = await dialog.showSaveDialog(win, {
    title: 'Salvar backup do rclone',
    defaultPath: path.join(app.getPath('documents'), `rclone-backup-${stamp}.conf`),
    filters: [{ name: 'Configuração do rclone', extensions: ['conf'] }],
  });
  if (r.canceled || !r.filePath) return { ok: true, canceled: true };
  try {
    if (path.resolve(r.filePath) === path.resolve(src)) return { ok: false, error: 'Escolha um local diferente do arquivo original.' };
    fs.copyFileSync(src, r.filePath);
    fs.chmodSync(r.filePath, 0o600);
  } catch (e) { return { ok: false, error: `Não consegui salvar o backup: ${e.message}` }; }
  const text = fs.readFileSync(r.filePath, 'utf8');
  return { ok: true, file: r.filePath, count: isEncryptedConf(text) ? 0 : parseIni(text).size, encrypted: isEncryptedConf(text) };
});

ipcMain.handle('conf:import-clear', () => { importDoc = null; return true; });

ipcMain.handle('conf:providers', async () => {
  const all = await loadProviders();
  if (!all) return { ok: false, error: 'Não consegui obter a lista de serviços do rclone' };
  const providers = all
    .filter((p) => !HIDDEN_BACKENDS.has(p.Name))
    .map((p) => ({ name: p.Name, description: String(p.Description || '').slice(0, 90) }))
    .sort((a, b) => collator.compare(a.description || a.name, b.description || b.name));
  return { ok: true, providers };
});

ipcMain.handle('conf:provider', async (_e, name) => {
  const all = await loadProviders();
  const p = all && all.find((x) => x.Name === name);
  if (!p) return { ok: false, error: 'Serviço desconhecido' };
  const options = (p.Options || [])
    .filter((o) => !o.Advanced && !o.Hide && !['client_id', 'client_secret'].includes(o.Name))
    .map((o) => ({
      name: o.Name,
      help: o.Help || '',
      provider: o.Provider || '',
      def: o.DefaultStr != null ? o.DefaultStr : (o.Default == null ? '' : String(o.Default)),
      examples: (o.Examples || []).map((e) => ({ value: String(e.Value), help: e.Help || '', provider: e.Provider || '' })),
      required: !!o.Required,
      password: !!o.IsPassword,
      exclusive: !!o.Exclusive,
      type: o.Type || 'string',
    }));
  return { ok: true, name: p.Name, description: p.Description || p.Name, options };
});

// Um passo do assistente. `state`/`result` vêm da pergunta anterior do rclone.
ipcMain.handle('conf:step', async (_e, o) => {
  const mode = o.mode === 'update' ? 'update' : 'create';
  if (mode === 'create' && !CREATE_NAME_RE.test(String(o.name))) return { ok: false, error: 'Nome de conexão inválido' };
  if (mode === 'update' && !anyName(o.name)) return { ok: false, error: 'Nome de conexão inválido' };
  const kv = (o.params || []).flatMap(([k, v]) => [String(k), String(v)]);
  let args;
  let firstCreate = false;
  if (o.state) {
    // forma "--opção=valor": evita que um valor começando com "-" seja lido como flag
    args = ['config', 'update', o.name, ...kv, '--continue', `--state=${String(o.state)}`, `--result=${String(o.result ?? '')}`, '--non-interactive'];
  } else if (mode === 'update') {
    args = ['config', 'update', o.name, ...kv, '--non-interactive'];
  } else {
    if (!/^[a-z0-9 ]+$/i.test(String(o.type))) return { ok: false, error: 'Tipo de serviço inválido' };
    // "config create" apaga em silêncio uma conexão com o mesmo nome: nunca deixar acontecer.
    const d = await dumpConfig();
    if (!d.ok) return d;
    if (Object.prototype.hasOwnProperty.call(d.data, o.name)) {
      return { ok: false, error: 'Já existe uma conexão com esse nome. Escolha outro para não sobrescrevê-la.' };
    }
    args = ['config', 'create', o.name, String(o.type), ...kv, '--non-interactive'];
    firstCreate = true;
  }
  const r = await runConf(args);
  if (firstCreate && r.ok) pendingCreate = o.name; // o rclone grava a conexão (incompleta) a cada passo
  if (r.ok && r.json && !r.json.State && pendingCreate === o.name) pendingCreate = null; // terminou
  return r;
});

ipcMain.handle('conf:cancel', async (_e, deleteName) => {
  const s = confSession;
  if (s) {
    s.killedBy = 'cancel';
    s.proc.kill('SIGTERM');
    for (let i = 0; i < 60 && confSession === s; i++) await new Promise((r) => setTimeout(r, 50));
  }
  if (deleteName && anyName(deleteName)) {
    await runRclone(['--ask-password=false', 'config', 'delete', deleteName], 15000);
    if (pendingCreate === deleteName) pendingCreate = null;
  }
  return true;
});

// Reabre o link de autorização (só endereços locais do próprio rclone).
ipcMain.handle('conf:open', async (_e, url) => {
  const m = AUTH_URL_RE.exec(String(url));
  if (!m || m[0] !== String(url)) return false;
  try { await shell.openExternal(m[0]); return true; } catch (_) { return false; }
});

ipcMain.handle('conf:delete', async (_e, name) => {
  if (!anyName(name)) return { ok: false, error: 'Nome inválido' };
  const r = await runRclone(['--ask-password=false', 'config', 'delete', name], 15000);
  if (r.ok && pendingCreate === name) pendingCreate = null;
  return r;
});

ipcMain.handle('conf:fingerprint', async (_e, name) => {
  const d = await dumpConfig();
  const token = d.ok && d.data[name] && d.data[name].token;
  return token ? crypto.createHash('sha256').update(String(token)).digest('hex') : '';
});

ipcMain.handle('conf:test', async (_e, name) => {
  if (!anyName(name)) return { ok: false, error: 'Nome inválido' };
  const r = await runRclone(
    ['--ask-password=false', 'lsd', `${name}:`, '--contimeout', '20s', '--retries', '1', '--low-level-retries', '1'],
    60000,
  );
  if (!r.ok) return r;
  return { ok: true, count: r.stdout.split('\n').filter((l) => l.trim()).length };
});

// ---------------------------------------------------------------------- janela
function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 830,
    minWidth: 940,
    minHeight: 720,
    backgroundColor: '#080b14',
    title: 'Revoada — 4Cloud Apps',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

// Quando roda como AppImage, registra o app no menu do sistema com o logo
// (cria ~/.local/share/applications/revoada.desktop e o ícone). Assim a janela,
// o dock e a busca de apps mostram o logo da Revoada em vez do ícone genérico.
function integrateDesktop() {
  const appImage = process.env.APPIMAGE;
  if (!appImage) return;
  try {
    const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    const iconDir = path.join(dataHome, 'icons', 'hicolor', '512x512', 'apps');
    const appsDir = path.join(dataHome, 'applications');
    fs.mkdirSync(iconDir, { recursive: true });
    fs.mkdirSync(appsDir, { recursive: true });

    const iconDst = path.join(iconDir, 'revoada.png');
    fs.copyFileSync(path.join(__dirname, 'renderer', 'icon.png'), iconDst);

    const exec = appImage.replace(/(["`$\\])/g, '\\$1');
    const desktop = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Revoada',
      'GenericName=Copiar para a nuvem',
      'Comment=Copie pastas e arquivos para a nuvem com o rclone — 4Cloud Apps',
      `Exec="${exec}" %U`,
      `Icon=${iconDst}`,
      'Terminal=false',
      'Categories=Utility;FileTools;Network;',
      'Keywords=rclone;sharepoint;sync;cloud;nuvem;copiar;4Cloud;',
      'StartupWMClass=Revoada',
      `X-AppImage-Version=${app.getVersion()}`,
      '',
    ].join('\n');
    const file = path.join(appsDir, 'revoada.desktop');
    let current = '';
    try { current = fs.readFileSync(file, 'utf8'); } catch (_) { /* primeira vez */ }
    if (current !== desktop) {
      fs.writeFileSync(file, desktop);
      execFile('update-desktop-database', [appsDir], () => {});
    }
    // ícone do próprio arquivo .AppImage no gerenciador de arquivos (GNOME/Nautilus)
    execFile('gio', ['set', appImage, 'metadata::custom-icon', `file://${iconDst}`], () => {});
  } catch (_) { /* integração é opcional */ }
}

if (process.platform === 'linux') app.setDesktopName('revoada.desktop');
app.setAboutPanelOptions({
  applicationName: 'Revoada',
  applicationVersion: app.getVersion(),
  copyright: '© 2026 4Cloud Apps',
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  integrateDesktop();
  createWindow();
});

app.on('before-quit', () => {
  if (child) child.kill('SIGTERM');
  if (confSession) { confSession.killedBy = 'cancel'; confSession.proc.kill('SIGTERM'); }
  // fechou o app no meio de uma conexão nova: não deixa uma conexão incompleta no rclone
  if (pendingCreate && rclonePath) {
    try { execFileSync(rclonePath, ['--ask-password=false', 'config', 'delete', pendingCreate], { timeout: 10000 }); } catch (_) { /* ignora */ }
    pendingCreate = null;
  }
});
app.on('window-all-closed', () => app.quit());
