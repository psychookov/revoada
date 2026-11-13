'use strict';
(() => {
  const api = window.api;
  const $ = (s, r = document) => r.querySelector(s);

  // ------------------------------------------------------------------ ícones
  const svg = (inner, fill = 'none') =>
    `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ICONS = {
    folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    chev: svg('<path d="m9 6 6 6-6 6"/>'),
    up: svg('<path d="M14 9 9 4 4 9"/><path d="M20 20h-7a4 4 0 0 1-4-4V4"/>'),
    home: svg('<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>'),
    cloud: svg('<path d="M17.5 19a4.5 4.5 0 1 0-1.2-8.84A6 6 0 0 0 4.5 12.5 3.5 3.5 0 0 0 6 19z"/>'),
    laptop: svg('<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 20h20"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
    swap: svg('<path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    play: svg('<path d="M7 4.5v15l12-7.5z"/>', 'currentColor'),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
    check: svg('<path d="m5 12 5 5 9-10"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/>'),
    videos: svg('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>'),
    documents: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>'),
    upload: svg('<path d="M12 15V4"/><path d="m7 8 5-5 5 5"/><path d="M5 20h14"/>'),
    downloads: svg('<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>'),
    pictures: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 16-5-5-9 9"/>'),
    music: svg('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
    plug: svg('<path d="M9 2v6M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>'),
    sites: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    triangle: svg('<path d="M9 4h6l6 11-3 5H6l-3-5z"/><path d="M9 4l6 11M15 4 9 15"/>'),
    box: svg('<path d="M21 8 12 3 3 8l9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
    building: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>'),
    dots: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    back: svg('<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>'),
  };

  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return el;
  }
  const icon = (name, cls = '') => h('span', { class: `ico ${cls}`.trim(), html: ICONS[name] });

  // --------------------------------------------------------------- utilidades
  const fmtBytes = (n) => {
    n = Number(n) || 0;
    const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${i === 0 ? n.toFixed(0) : n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
  };
  const fmtEta = (s) => {
    if (s == null || !isFinite(s)) return '—';
    s = Math.round(s);
    const hh = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (hh) return `${hh}h ${String(m).padStart(2, '0')}min`;
    if (m) return `${m}min ${String(ss).padStart(2, '0')}s`;
    return `${ss}s`;
  };
  const cleanCloud = (p) => String(p || '').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
  const jn = (a, b) => (a ? `${a}/${b}` : b);
  const IS_WIN = /Windows/i.test(navigator.userAgent);
  // caminhos locais usam "/" sempre; no Windows a raiz "/" lista as unidades (C:, D:...) e cada uma é "C:/"
  const lj = (a, b) => (a === '/' ? (IS_WIN ? `${b}/` : `/${b}`) : `${a.replace(/\/$/, '')}/${b}`);
  const base = (p) => (String(p).split('/').filter(Boolean).pop() || '').replace(/:$/, '');
  const parentLocal = (p) => {
    if (p === '/') return '/';
    if (IS_WIN && /^[A-Za-z]:\/?$/.test(p)) return '/';
    const r = p.replace(/\/[^/]+\/?$/, '');
    if (IS_WIN && /^[A-Za-z]:$/.test(r)) return `${r}/`;
    return r || '/';
  };
  const parentCloud = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  const quote = (s) => (/^[\w@%+=:,./~-]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, '\\$1')}"`);
  const noRemote = (r) => r.replace(/:$/, '');
  const fileIcon = (n) => {
    const e = String(n).split('.').pop().toLowerCase();
    if (['mkv', 'mp4', 'avi', 'mov', 'webm', 'm4v', 'wmv'].includes(e)) return 'videos';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'bmp'].includes(e)) return 'pictures';
    if (['mp3', 'flac', 'wav', 'ogg', 'm4a', 'opus', 'aac'].includes(e)) return 'music';
    return 'documents';
  };

  // ------------------------------------------------------------------- estado
  const S = {
    rclone: null, home: '', places: [], remotes: [], remote: '',
    direction: 'up', localPath: '', cloudPath: '', subfolder: false, dry: false, extra: '',
    run: { status: 'idle' },
  };
  const mkPanel = () => ({ dirs: [], files: [], file: null, loading: false, error: '', filter: '', virtual: false, adding: false, token: 0, el: null, r: {} });
  const P = { local: mkPanel(), cloud: mkPanel() };
  const cache = new Map();
  let saveTimer;

  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => api.saveState({
      remote: S.remote, direction: S.direction, localPath: S.localPath,
      cloudPath: S.cloudPath, subfolder: S.subfolder, extra: S.extra,
    }), 250);
  };

  const pathOf = (k) => (k === 'local' ? S.localPath : S.cloudPath);
  const roleOf = (k) => ((S.direction === 'up') === (k === 'local') ? 'src' : 'dst');

  // ------------------------------------------------------------------ painéis
  function buildPanel(k) {
    const p = P[k];
    const r = p.r;
    r.badge = h('span', { class: 'badge' });
    r.kico = h('div', { class: 'kind-ico' });
    r.title = h('div', { class: 'p-title' });
    r.sub = h('div', { class: 'p-sub' });
    r.refresh = h('button', { class: 'icon-btn', title: 'Atualizar lista', onclick: () => { dropCache(k); loadDirs(k); } }, icon('refresh'));
    r.crumbs = h('div', { class: 'crumbs' });
    r.places = h('div', { class: 'places' });
    r.filter = h('input', {
      class: 'filter-in', placeholder: 'Filtrar pastas…', spellcheck: 'false',
      oninput: (e) => { p.filter = e.target.value; renderList(k); },
    });
    r.newBtn = h('button', {
      class: 'ghost-btn', title: 'Criar uma pasta nova no destino',
      onclick: () => { p.adding = true; updatePanel(k); r.newIn.focus(); },
    }, icon('plus'), 'Nova pasta');
    r.newIn = h('input', {
      class: 'new-in', placeholder: 'Nome da nova pasta — Enter para confirmar', spellcheck: 'false',
      onkeydown: (e) => {
        if (e.key === 'Escape') { p.adding = false; updatePanel(k); }
        if (e.key === 'Enter') {
          const n = e.target.value.trim().replace(/[/\\]/g, '');
          if (n) setPath(k, k === 'local' ? lj(S.localPath, n) : jn(S.cloudPath, n), { virtual: true });
        }
      },
    });
    r.newRow = h('div', { class: 'new-row' }, icon('folder'), r.newIn);
    r.list = h('div', { class: 'list' });
    r.prefix = h('span', { class: 'prefix' });
    r.path = h('input', {
      class: 'path-in', spellcheck: 'false',
      onchange: (e) => commitPath(k, e.target.value),
      onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    });
    r.pick = h('button', {
      class: 'ghost-btn',
      onclick: async () => { const d = await api.pickLocal(S.localPath); if (d) setPath('local', d); },
    }, icon('folder'), 'Procurar…');

    r.fileRow = h('div', { class: 'file-sel' });

    p.el = h('section', { class: 'panel' },
      h('div', { class: 'p-head' }, r.kico, h('div', { class: 'p-titles' }, r.title, r.sub), r.badge, r.refresh),
      r.crumbs,
      r.places,
      h('div', { class: 'tools' }, h('div', { class: 'search' }, icon('search'), r.filter), r.newBtn),
      r.newRow,
      r.list,
      h('div', { class: 'p-foot' },
        h('div', { class: 'foot-label' }, 'Pasta selecionada'),
        h('div', { class: 'path-row' }, r.prefix, r.path, k === 'local' ? r.pick : null),
        r.fileRow));
  }

  function crumbsFor(k) {
    if (k === 'local') {
      const pth = S.localPath || '/';
      if (S.home && (pth === S.home || pth.startsWith(`${S.home}/`))) {
        const out = [{ label: 'Início', ico: 'home', path: S.home }];
        let acc = S.home;
        for (const s of pth.slice(S.home.length).split('/').filter(Boolean)) {
          acc = lj(acc, s);
          out.push({ label: s, path: acc });
        }
        return out;
      }
      const out = [{ label: IS_WIN ? 'Computador' : '/', path: '/' }];
      let acc = '/';
      for (const s of pth.split('/').filter(Boolean)) {
        acc = lj(acc, s);
        out.push({ label: s, path: acc });
      }
      return out;
    }
    const out = [{ label: S.remote ? noRemote(S.remote) : 'nuvem', ico: 'cloud', path: '' }];
    let acc = '';
    for (const s of S.cloudPath.split('/').filter(Boolean)) {
      acc = jn(acc, s);
      out.push({ label: s, path: acc });
    }
    return out;
  }

  function updatePanel(k) {
    const p = P[k];
    const r = p.r;
    const role = roleOf(k);
    p.el.dataset.role = role;
    r.badge.textContent = role === 'src' ? 'Origem' : 'Destino';
    r.kico.replaceChildren(icon(k === 'local' ? 'laptop' : 'cloud'));
    r.title.textContent = k === 'local' ? 'Este computador' : (S.remote ? noRemote(S.remote) : 'Nenhum remote');
    r.sub.textContent = k === 'local' ? 'Pasta local' : 'Biblioteca na nuvem';

    const cs = crumbsFor(k);
    r.crumbs.replaceChildren(...cs.flatMap((c, i) => {
      const last = i === cs.length - 1;
      const btn = h('button', {
        class: `crumb${last ? ' cur' : ''}`, title: c.label,
        onclick: last ? null : () => setPath(k, c.path),
      }, c.ico ? icon(c.ico) : null, c.label);
      return i === 0 ? [btn] : [h('span', { class: 'sep' }, icon('chev')), btn];
    }));
    requestAnimationFrame(() => { r.crumbs.scrollLeft = r.crumbs.scrollWidth; });

    if (k === 'local') {
      r.places.replaceChildren(...S.places.map((pl) => h('button', {
        class: `chip${pl.path === S.localPath ? ' on' : ''}`, onclick: () => setPath('local', pl.path),
      }, icon(pl.key), pl.label)));
    }
    r.places.hidden = k !== 'local' || !S.places.length;
    r.newBtn.hidden = role !== 'dst';
    r.newRow.hidden = !(p.adding && role === 'dst');
    r.prefix.hidden = k !== 'cloud';
    r.prefix.textContent = S.remote;
    r.pick.hidden = k !== 'local';
    r.path.placeholder = k === 'cloud' ? '(raiz da biblioteca)' : '';
    if (document.activeElement !== r.path) r.path.value = pathOf(k) || '';

    const sel = role === 'src' ? p.file : null;
    r.fileRow.hidden = !sel;
    if (sel) {
      const f = p.files.find((x) => x.name === sel);
      r.fileRow.replaceChildren(
        icon(fileIcon(sel)),
        h('span', { class: 'fname', title: sel }, sel),
        f ? h('span', { class: 'fsize' }, fmtBytes(f.size)) : null,
        h('button', {
          class: 'icon-btn', title: 'Desmarcar arquivo',
          onclick: () => { p.file = null; updatePanel(k); renderList(k); updateCommand(); },
        }, icon('x')));
    }
  }

  const empty = (ico, title, text, extra) =>
    h('div', { class: 'empty' }, icon(ico), h('b', {}, title), text ? h('p', {}, text) : null, extra);

  function renderList(k) {
    const p = P[k];
    const box = p.r.list;
    const role = roleOf(k);
    box.replaceChildren();

    if (k === 'cloud' && !S.rclone) { box.append(empty('alert', 'rclone não encontrado', 'Instale o rclone para listar a nuvem.')); return; }
    if (k === 'cloud' && !S.remote) {
      box.append(empty('cloud', 'Nenhuma conexão ainda', 'Conecte o SharePoint, o OneDrive ou outro serviço para começar.',
        h('div', { class: 'btns' },
          h('button', { class: 'ghost-btn', onclick: () => window.RV.openConnections({ wizard: true }) }, icon('plug'), 'Criar conexão'),
          h('button', { class: 'ghost-btn', onclick: () => window.RV.openConnections({ import: true }) }, icon('downloads'), 'Importar backup (.conf)'))));
      return;
    }

    if (p.loading) {
      for (let i = 0; i < 7; i++) box.append(h('div', { class: 'row skel', style: `--w:${34 + ((i * 37) % 46)}%` }));
      return;
    }

    const path = pathOf(k);
    const atRoot = k === 'local' ? path === '/' : !path;
    if (!atRoot) {
      box.append(h('button', {
        class: 'row up', onclick: () => setPath(k, k === 'local' ? parentLocal(path) : parentCloud(path)),
      }, icon('up'), h('span', { class: 'name' }, 'Subir um nível')));
    }

    const notFound = /not found|no such|ENOENT|não encontrada/i.test(p.error);
    if (p.error && !(role === 'dst' && notFound)) {
      box.append(empty('alert', 'Não foi possível abrir esta pasta', p.error,
        h('button', { class: 'ghost-btn', onclick: () => loadDirs(k) }, icon('refresh'), 'Tentar de novo')));
      return;
    }

    const f = p.filter.trim().toLowerCase();
    const match = (n) => !f || n.toLowerCase().includes(f);
    const dirs = p.dirs.filter(match);
    const files = p.files.filter((x) => match(x.name));

    if (dirs.length && files.length) box.append(h('div', { class: 'sect' }, 'Pastas'));
    for (const d of dirs) {
      box.append(h('button', {
        class: 'row', title: d, onclick: () => setPath(k, k === 'local' ? lj(path, d) : jn(path, d)),
      }, icon('folder', 'f'), h('span', { class: 'name' }, d), icon('chev', 'chev')));
    }
    if (files.length) {
      if (dirs.length) box.append(h('div', { class: 'sect' }, 'Arquivos'));
      for (const x of files) {
        if (role !== 'src') { // no destino os arquivos só aparecem para consulta
          box.append(h('div', { class: 'row isfile ro', title: x.name },
            icon(fileIcon(x.name), 'f'), h('span', { class: 'name' }, x.name), h('span', { class: 'size' }, fmtBytes(x.size))));
          continue;
        }
        const on = p.file === x.name;
        box.append(h('button', {
          class: `row isfile${on ? ' sel' : ''}`, title: x.name,
          onclick: () => { p.file = on ? null : x.name; updatePanel(k); renderList(k); updateCommand(); },
        }, icon(fileIcon(x.name), 'f'), h('span', { class: 'name' }, x.name),
        on ? icon('check', 'ok') : h('span', { class: 'size' }, fmtBytes(x.size))));
      }
    }
    if (!dirs.length && !files.length) {
      if (p.virtual || (p.error && notFound)) box.append(empty('plus', 'Pasta nova', 'Ela será criada quando a cópia começar.'));
      else if (f) box.append(empty('search', 'Nada por aqui', `Nada contém “${p.filter}”.`));
      else if (role === 'src') box.append(empty('folder', 'Pasta vazia', 'Não há subpastas nem arquivos aqui. Esta pasta é a seleção atual.'));
      else box.append(empty('folder', 'Pasta vazia', 'Não há subpastas nem arquivos aqui. Esta pasta é a seleção atual.'));
    }
  }

  async function loadDirs(k, fallbackHome = false) {
    const p = P[k];
    const path = pathOf(k);
    const tok = ++p.token;
    p.r.list.scrollTop = 0;

    if (k === 'cloud' && (!S.remote || !S.rclone)) { p.dirs = []; p.files = []; p.loading = false; renderList(k); return; }
    if (p.virtual) { p.dirs = []; p.files = []; p.error = ''; p.loading = false; renderList(k); return; }

    const key = k === 'cloud' ? `${S.remote}|${path}` : `L|${path}`;
    if (cache.has(key)) {
      const c = cache.get(key);
      p.dirs = c.dirs; p.files = c.files; p.error = ''; p.loading = false;
      renderList(k);
      return;
    }

    p.loading = true; p.error = '';
    renderList(k);
    const res = k === 'local' ? await api.lsLocal(path) : await api.lsRemote(S.remote, path);
    if (tok !== p.token) return;
    p.loading = false;
    if (res.ok) {
      p.dirs = res.dirs;
      p.files = res.files || [];
      cache.set(key, { dirs: p.dirs, files: p.files });
    } else if (k === 'local' && fallbackHome && S.home && path !== S.home) {
      setPath('local', S.home);
      return;
    } else {
      p.dirs = [];
      p.files = [];
      p.error = res.error || 'Erro desconhecido';
    }
    renderList(k);
    updatePanel(k);
  }

  function dropCache(k) {
    const prefix = k === 'cloud' ? `${S.remote}|` : 'L|';
    for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
  }

  function setPath(k, v, opts = {}) {
    if (k === 'local') S.localPath = v; else S.cloudPath = v;
    const p = P[k];
    p.filter = ''; p.r.filter.value = '';
    p.virtual = !!opts.virtual; p.adding = false; p.file = null; p.r.newIn.value = '';
    persist();
    updatePanel(k);
    loadDirs(k);
    updateCommand();
  }

  function commitPath(k, raw) {
    let v = String(raw || '').trim();
    if (k === 'local') {
      v = v.replace(/^~(?=\/|$)/, S.home);
      if (IS_WIN) {
        v = v.replace(/\\/g, '/');
        if (!/^[A-Za-z]:(\/|$)/.test(v)) v = '/';
      } else if (!v.startsWith('/')) v = `/${v}`;
      v = v.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
      if (IS_WIN && /^[A-Za-z]:$/.test(v)) v += '/';
    } else {
      v = cleanCloud(v);
    }
    if (v !== pathOf(k)) setPath(k, v);
  }

  function applyDirection() {
    const src = P[S.direction === 'up' ? 'local' : 'cloud'].el;
    const dst = P[S.direction === 'up' ? 'cloud' : 'local'].el;
    $('#main').replaceChildren(src, swapBtn, dst);
  }

  // ------------------------------------------------------------------ comando
  function plan() {
    if (!S.rclone) return { error: 'rclone não encontrado' };
    if (!S.remote) return { error: 'Escolha um remote' };
    if (!S.localPath) return { error: 'Escolha a pasta local' };
    let src; let dst; let file;
    if (S.direction === 'up') {
      file = P.local.file;
      const name = S.subfolder && !file ? base(S.localPath) : '';
      src = file ? lj(S.localPath, file) : S.localPath;
      dst = `${S.remote}${name ? jn(S.cloudPath, name) : S.cloudPath}`;
    } else {
      file = P.cloud.file;
      const name = S.subfolder && !file ? base(S.cloudPath) : '';
      src = `${S.remote}${file ? jn(S.cloudPath, file) : S.cloudPath}`;
      dst = name ? lj(S.localPath, name) : S.localPath;
    }
    return { src, dst, file: !!file };
  }

  function updateCommand() {
    const pl = plan();
    const code = $('#cmd');
    if (pl.error) {
      code.textContent = pl.error; code.className = 'bad';
    } else {
      code.className = '';
      code.textContent = `rclone copy ${quote(pl.src)} ${quote(pl.dst)}${S.dry ? ' --dry-run' : ''}${S.extra.trim() ? ` ${S.extra.trim()}` : ''} -P`;
    }
    $('#copyCmd').hidden = !!pl.error;
    $('#optSub').disabled = !!pl.file;
    $('#start').disabled = !!pl.error || S.run.status === 'running';
  }

  // --------------------------------------------------------------------- cópia
  let R = null; // referências da folha de progresso

  async function startCopy() {
    const pl = plan();
    if (pl.error || S.run.status === 'running') return;
    S.run = { status: 'running', stats: null, errors: 0, log: [], showLog: false, started: Date.now(), dry: S.dry, route: `${pl.src}  →  ${pl.dst}` };
    buildSheet();
    updateCommand();
    const res = await api.start({ src: pl.src, dst: pl.dst, dry: S.dry, extra: S.extra });
    if (!res.ok) {
      addLog(res.error || 'Não foi possível iniciar', true);
      S.run.status = 'error';
      renderSheet();
      updateCommand();
    }
  }

  function buildSheet() {
    const ov = $('#overlay');
    R = {};
    R.chip = h('span', { class: 'status running' }, h('i'), h('span'));
    R.close = h('button', { class: 'icon-btn', title: 'Fechar', onclick: closeSheet }, icon('x'));
    R.title = h('h2', { class: 's-title' });
    R.route = h('p', { class: 's-route' });
    R.ring = h('div', { class: 'ring indet' });
    R.ring.innerHTML = '<svg viewBox="0 0 160 160"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b8cff"/><stop offset="1" stop-color="#2dd4bf"/></linearGradient></defs><circle class="trk" cx="80" cy="80" r="68"/><circle class="bar" cx="80" cy="80" r="68" transform="rotate(-90 80 80)"/></svg>';
    R.bar = R.ring.querySelector('.bar');
    R.pct = h('div', { class: 'pct' });
    R.ring.append(R.pct);
    const metric = (label) => { const b = h('b', {}, '—'); return { el: h('div', { class: 'metric' }, h('span', {}, label), b), b }; };
    R.m1 = metric('Transferido');
    R.m2 = metric('Velocidade');
    R.m3 = metric('Tempo restante');
    R.m4 = metric('Arquivos');
    R.files = h('div', { class: 'files' });
    R.errBadge = h('span', { class: 'err-count' });
    R.toggle = h('button', { class: 'log-toggle', onclick: () => { S.run.showLog = !S.run.showLog; renderSheet(); } }, icon('chev'), 'Detalhes', R.errBadge);
    R.log = h('div', { class: 'log' });
    R.cancel = h('button', { class: 'danger-btn', onclick: () => { R.cancel.disabled = true; R.cancel.textContent = 'Cancelando…'; api.cancel(); } }, 'Cancelar');
    R.done = h('button', { class: 'primary sm', onclick: closeSheet }, 'Fechar');
    R.actions = h('div', { class: 's-actions' }, R.cancel, R.done);

    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 's-head' }, R.chip, R.close),
      R.title, R.route,
      h('div', { class: 's-body' }, R.ring, h('div', { class: 'metrics' }, R.m1.el, R.m2.el, R.m3.el, R.m4.el)),
      R.files,
      R.toggle, R.log,
      R.actions);
    ov.replaceChildren(sheet);
    ov.hidden = false;
    renderSheet();
  }

  function closeSheet() {
    if (S.run.status === 'running') return;
    $('#overlay').hidden = true;
    S.run.status = 'idle';
  }

  function addLog(text, err) {
    const run = S.run;
    if (!run.log) run.log = [];
    if (err) run.errors = (run.errors || 0) + 1;
    run.log.push({ text, err });
    if (run.log.length > 400) run.log.shift();
    if (R && R.log && !$('#overlay').hidden) {
      R.log.append(h('div', { class: err ? 'e' : '' }, text));
      while (R.log.childElementCount > 400) R.log.firstChild.remove();
      R.log.scrollTop = R.log.scrollHeight;
      R.errBadge.hidden = !run.errors;
      R.errBadge.textContent = `${run.errors} erro${run.errors === 1 ? '' : 's'}`;
    }
  }

  function renderSheet() {
    if (!R) return;
    const run = S.run;
    const st = run.stats || {};
    const running = run.status === 'running';
    const total = Number(st.totalBytes) || 0;
    const done = Number(st.bytes) || 0;
    let pct = total ? Math.min(100, (done * 100) / total) : 0;
    if (run.status === 'done') pct = 100;

    const label = { running: run.dry ? 'Simulando' : 'Copiando', done: 'Concluído', error: 'Com erros', cancelled: 'Cancelado' }[run.status] || '';
    R.chip.className = `status ${run.status}`;
    R.chip.lastChild.textContent = label;
    R.title.textContent = {
      running: run.dry ? 'Simulando a cópia…' : 'Copiando seus arquivos…',
      done: run.dry ? 'Simulação concluída' : 'Cópia concluída',
      error: 'A cópia terminou com erros',
      cancelled: 'Cópia cancelada',
    }[run.status] || '';
    R.route.textContent = run.route || '';
    R.route.title = run.route || '';

    const indeterminate = running && !total;
    R.ring.className = `ring${indeterminate ? ' indet' : ''}${running ? '' : ` finished ${run.status}`}`;
    R.bar.style.strokeDashoffset = indeterminate ? '' : String(427.26 * (1 - pct / 100));
    R.pct.replaceChildren(...(indeterminate ? [h('span', { style: 'font-size:14px;font-weight:600;color:var(--muted)' }, 'Preparando…')]
      : [h('span', {}, String(Math.floor(pct)), h('small', {}, '%'))]));

    R.m1.b.textContent = total ? `${fmtBytes(done)} de ${fmtBytes(total)}` : fmtBytes(done);
    R.m2.el.firstChild.textContent = running ? 'Velocidade' : 'Duração';
    R.m3.el.firstChild.textContent = running ? 'Tempo restante' : 'Terminou às';
    if (running) {
      R.m2.b.textContent = `${fmtBytes(st.speed)}/s`;
      R.m3.b.textContent = fmtEta(st.eta);
    } else {
      const secs = Math.max(1, Math.round(((run.ended || Date.now()) - run.started) / 1000));
      R.m2.b.textContent = fmtEta(secs);
      R.m3.b.textContent = new Date(run.ended || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    R.m4.b.textContent = `${st.transfers || 0} de ${st.totalTransfers || 0}`;

    const tr = running ? (st.transferring || []) : [];
    R.files.replaceChildren(...tr.slice(0, 3).map((t) => h('div', { class: 'file' },
      h('div', { class: 'l' }, h('span', { title: t.name }, t.name), h('span', {}, `${t.percentage || 0}%`)),
      h('div', { class: 't' }, h('i', { style: `width:${t.percentage || 0}%` })))),
    ...(tr.length > 3 ? [h('div', { class: 'more' }, `+${tr.length - 3} em paralelo`)] : []));

    R.toggle.classList.toggle('open', !!run.showLog);
    R.log.hidden = !run.showLog;
    R.errBadge.hidden = !run.errors;
    R.errBadge.textContent = `${run.errors || 0} erro${run.errors === 1 ? '' : 's'}`;
    if (run.showLog && !R.log.childElementCount) {
      R.log.replaceChildren(...(run.log || []).map((l) => h('div', { class: l.err ? 'e' : '' }, l.text)));
    }
    if (run.showLog) R.log.scrollTop = R.log.scrollHeight;

    R.close.hidden = running;
    R.cancel.hidden = !running;
    R.done.hidden = running;
  }

  api.onCopy((ev) => {
    const run = S.run;
    if (run.status !== 'running') return;
    if (ev.type === 'stats') {
      run.stats = ev.stats;
      renderSheet();
    } else if (ev.type === 'log') {
      addLog(ev.text, ev.err);
    } else if (ev.type === 'done') {
      run.ended = Date.now();
      run.status = ev.cancelled ? 'cancelled' : (ev.code === 0 ? 'done' : 'error');
      renderSheet();
      updateCommand();
      if (run.status === 'done' && !run.dry) {
        cache.clear();
        loadDirs('local');
        loadDirs('cloud');
      }
      try {
        if (!document.hasFocus()) {
          new Notification('Revoada', {
            body: run.status === 'done' ? (run.dry ? 'Simulação concluída.' : 'Cópia concluída.')
              : run.status === 'cancelled' ? 'Cópia cancelada.' : 'A cópia terminou com erros.',
            silent: false,
          });
        }
      } catch (_) { /* sem notificações */ }
    }
  });

  // --------------------------------------------------------------------- init
  const swapBtn = h('button', {
    class: 'swap', title: 'Inverter direção (Local ⇄ Nuvem)',
    onclick: () => {
      S.direction = S.direction === 'up' ? 'down' : 'up';
      for (const k of ['local', 'cloud']) if (roleOf(k) === 'dst') P[k].file = null;
      persist();
      applyDirection();
      updatePanel('local'); updatePanel('cloud');
      renderList('local'); renderList('cloud');
      updateCommand();
    },
  }, icon('swap'));

  function fillRemotes() {
    const sel = $('#remote');
    sel.replaceChildren(...S.remotes.map((r) => h('option', { value: r }, noRemote(r))));
    if (!S.remotes.length) sel.append(h('option', { value: '' }, 'nenhum remote'));
    sel.value = S.remote;
  }

  async function loadRemotes(preferred) {
    const res = await api.remotes();
    S.remotes = res.ok ? res.remotes : [];
    const banner = $('#banner');
    if (!res.ok) {
      banner.replaceChildren(icon('alert'), `Não consegui listar os remotes: ${res.error}`);
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
    const keep = S.remotes.includes(S.remote) ? S.remote : '';
    S.remote = keep || (S.remotes.includes(preferred) ? preferred : (S.remotes[0] || ''));
    fillRemotes();
  }

  // Ponte para o assistente de conexões (connections.js)
  window.RV = {
    h, icon, ICONS, S,
    openConnections: () => {},
    // Recarrega a lista de remotes; com `use`, já seleciona essa conexão.
    async remotesChanged(use) {
      cache.clear();
      await loadRemotes(use || S.remote);
      if (use && S.remotes.includes(use)) {
        S.remote = use; S.cloudPath = ''; P.cloud.virtual = false;
        $('#remote').value = use;
        persist();
      }
      updatePanel('cloud'); updateCommand();
      loadDirs('cloud');
    },
  };

  async function init() {
    $('#manageIcon').append(icon('plug'));
    $('#manage').addEventListener('click', () => window.RV.openConnections());
    $('#reloadRemotes').append(icon('refresh'));
    $('#copyCmd').append(icon('copy'));
    $('#startIcon').append(icon('play'));
    buildPanel('local');
    buildPanel('cloud');

    const info = await api.init();
    S.rclone = info.rclone;
    S.home = info.home;
    S.places = info.places;
    const st = info.state || {};
    S.direction = st.direction === 'down' ? 'down' : 'up';
    S.localPath = st.localPath || info.home;
    S.cloudPath = cleanCloud(st.cloudPath);
    S.subfolder = !!st.subfolder;
    S.extra = st.extra || '';
    $('#optSub').checked = S.subfolder;
    $('#extra').value = S.extra;

    applyDirection();

    if (!S.rclone) {
      const b = $('#banner');
      b.replaceChildren(icon('alert'), 'rclone não encontrado no PATH. Instale o rclone (Linux: sudo dnf install rclone · Windows: winget install Rclone.Rclone) e abra o Revoada de novo.');
      b.hidden = false;
    } else {
      await loadRemotes(st.remote);
    }
    updatePanel('local'); updatePanel('cloud');
    updateCommand();
    loadDirs('local', true);
    loadDirs('cloud');
  }

  $('#remote').addEventListener('change', (e) => {
    S.remote = e.target.value;
    S.cloudPath = '';
    P.cloud.virtual = false;
    persist();
    updatePanel('cloud');
    loadDirs('cloud');
    updateCommand();
  });
  $('#reloadRemotes').addEventListener('click', async () => {
    cache.clear();
    await loadRemotes(S.remote);
    updatePanel('cloud'); updateCommand();
    loadDirs('cloud'); loadDirs('local');
  });
  $('#optSub').addEventListener('change', (e) => { S.subfolder = e.target.checked; persist(); updateCommand(); });
  $('#optDry').addEventListener('change', (e) => { S.dry = e.target.checked; updateCommand(); });
  $('#extra').addEventListener('input', (e) => { S.extra = e.target.value; persist(); updateCommand(); });
  $('#copyCmd').addEventListener('click', () => {
    const t = $('#cmd').textContent;
    navigator.clipboard.writeText(t).catch(() => {});
    const b = $('#copyCmd');
    b.replaceChildren(icon('check'));
    setTimeout(() => b.replaceChildren(icon('copy')), 1200);
  });
  $('#start').addEventListener('click', startCopy);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#overlay').hidden) closeSheet(); });

  init();
})();
