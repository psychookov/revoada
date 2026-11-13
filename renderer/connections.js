'use strict';
// Assistente de conexões: lista, cria, reconecta e remove remotes do rclone.
// Usa o modo guiado do rclone (config create/update --non-interactive): cada
// pergunta do rclone chega como JSON e é mostrada aqui de forma amigável.
(() => {
  const RV = window.RV;
  const { h, icon, S } = RV;
  const api = window.api;
  const ov = document.getElementById('connOverlay');

  const SERVICES = [
    {
      id: 'sharepoint', icon: 'sites', label: 'SharePoint', type: 'onedrive', tenant: true, base: 'sharepoint',
      sub: 'Biblioteca de documentos de um site da sua organização', preset: { config_type: 'search' },
    },
    {
      id: 'onedrive-biz', icon: 'building', label: 'OneDrive empresarial', type: 'onedrive', tenant: true, base: 'onedrive-empresa',
      sub: 'Sua pasta pessoal na conta de trabalho ou escola', preset: { config_type: 'onedrive' },
    },
    {
      id: 'onedrive', icon: 'cloud', label: 'OneDrive pessoal', type: 'onedrive', base: 'onedrive-pessoal',
      sub: 'Conta Microsoft (outlook.com, hotmail.com…)', preset: { config_type: 'onedrive' },
    },
    { id: 'gdrive', icon: 'triangle', label: 'Google Drive', type: 'drive', base: 'google-drive', sub: 'Meu Drive ou Drives compartilhados', preset: {} },
    { id: 'dropbox', icon: 'box', label: 'Dropbox', type: 'dropbox', base: 'dropbox', sub: 'Conta pessoal ou de equipe', preset: {} },
    { id: 'other', icon: 'dots', label: 'Outro serviço', generic: true, sub: 'Lista completa do rclone: S3, SFTP, WebDAV, Box, MEGA…' },
  ];

  const OAUTH_TYPES = new Set(['onedrive', 'drive', 'dropbox', 'box', 'pcloud', 'yandex', 'zoho', 'jottacloud', 'hidrive', 'premiumizeme', 'putio', 'sharefile', 'mailru', 'sugarsync']);

  const QTEXT = {
    config_type: { title: 'O que você quer conectar?', hint: 'Escolha como o rclone vai localizar a biblioteca.' },
    config_search_term: { title: 'Qual site do SharePoint?', hint: 'Digite o nome (ou parte do nome) do site. O rclone busca os sites que combinam.' },
    config_site: { title: 'Escolha o site', hint: 'Estes são os sites encontrados para a sua busca.' },
    config_url: { title: 'Endereço do site do SharePoint', hint: 'Cole a URL do site, por exemplo https://empresa.sharepoint.com/sites/Equipe' },
    config_driveid: { title: 'Escolha a biblioteca de documentos', hint: 'Cada site pode ter várias bibliotecas (por exemplo “Documentos”).' },
    config_drive_ok: { title: 'Confirmar biblioteca', hint: 'Confira os dados abaixo antes de concluir.' },
    config_site_url: { title: 'Endereço do site do SharePoint', hint: 'Cole a URL do site, por exemplo https://empresa.sharepoint.com/sites/Equipe' },
    config_sharepoint_url: { title: 'Caminho relativo do servidor', hint: 'Por exemplo: /teams/rh' },
    config_driveid_fixed: { title: 'ID da biblioteca (drive_id)', hint: '' },
    config_siteid: { title: 'ID do site', hint: '' },
    config_path: { title: 'Caminho relativo do servidor', hint: '' },
    config_change_team_drive: { title: 'Usar um Drive compartilhado?', hint: 'Responda “Não” para usar o seu “Meu Drive”.' },
    config_team_drive: { title: 'Escolha o Drive compartilhado', hint: '' },
  };
  const TYPE_CHOICE_PT = {
    onedrive: 'OneDrive (pessoal ou empresarial)',
    sharepoint: 'Site raiz do SharePoint',
    url: 'Site do SharePoint pelo nome ou URL',
    search: 'Buscar um site do SharePoint',
    driveid: 'Informar o ID da biblioteca (avançado)',
    siteid: 'Informar o ID do site (avançado)',
    path: 'Caminho relativo do servidor (avançado)',
  };

  // ----------------------------------------------------------------- estado
  const C = { view: 'list', remotes: [], configFile: '', loadErr: '', tests: {}, confirmDel: null, w: null, providers: null, provErr: '' };

  const newW = () => ({
    mode: 'create', step: 'service', service: null, type: '', name: '', tenant: '', options: null, values: {}, params: [],
    created: false, state: '', q: null, usedPreset: {}, authUrl: '', err: '', test: null, qanswer: '', lastError: '', working: '', fp: '',
    hops: 0, pendingErr: '',
  });

  const firstLine = (t) => String(t || '').split('\n')[0].trim();
  const clip = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

  function typeLabel(r) {
    if (r.type === 'onedrive') {
      if (r.driveType === 'documentLibrary') return 'SharePoint · biblioteca de documentos';
      if (r.driveType === 'business') return 'OneDrive empresarial';
      if (r.driveType === 'personal') return 'OneDrive pessoal';
      return 'OneDrive';
    }
    const known = { drive: 'Google Drive', dropbox: 'Dropbox', box: 'Box', s3: 'Amazon S3 / compatível', sftp: 'SFTP', webdav: 'WebDAV', ftp: 'FTP', smb: 'SMB', mega: 'MEGA', pcloud: 'pCloud' };
    return known[r.type] || r.type || 'Desconhecido';
  }
  function typeIcon(r) {
    if (r.type === 'onedrive') return r.driveType === 'documentLibrary' ? 'sites' : (r.driveType === 'business' ? 'building' : 'cloud');
    if (r.type === 'drive') return 'triangle';
    if (r.type === 'dropbox') return 'box';
    return 'cloud';
  }
  const suggestName = (base) => {
    let n = base; let i = 2;
    while (C.remotes.some((r) => r.name === n)) n = `${base}-${i++}`;
    return n;
  };
  function nameError(n) {
    if (!n) return 'Dê um nome à conexão.';
    if (!/^[A-Za-z0-9_.+@][A-Za-z0-9_.+@-]*$/.test(n)) return 'Use letras sem acento, números e - _ . + @ (sem espaços).';
    if (C.remotes.some((r) => r.name === n)) return 'Já existe uma conexão com esse nome.';
    return '';
  }
  function hintFor(msg) {
    const m = String(msg || '');
    if (/address already in use|53682/i.test(m)) return 'A porta 53682, usada para o login, está ocupada. Feche outra janela do rclone e tente de novo.';
    if (/AADSTS/i.test(m)) return 'A Microsoft recusou o login (veja o código acima). Se a sua organização exige login direcionado, informe o ID do locatário (tenant) em “Avançado”.';
    if (/invalid_grant|token|unauthorized|401|expired/i.test(m)) return 'A autorização parece ter expirado. Use “Reconectar” para renová-la.';
    if (/no such host|dial tcp|timeout|i\/o timeout|connection refused/i.test(m)) return 'Não foi possível alcançar o servidor. Verifique a internet e os dados informados.';
    return '';
  }

  // ------------------------------------------------------------ abrir/fechar
  async function open(opts = {}) {
    ov.hidden = false; C.note = '';
    C.view = 'list'; C.confirmDel = null; C.w = null; C.tests = {};
    render();
    await refreshList();
    if (opts.wizard) startWizard();
    else if (opts.import) startImport();
  }
  RV.openConnections = open;

  async function refreshList() {
    const r = await api.confList();
    if (r.ok) { C.remotes = r.remotes; C.configFile = r.configFile; C.loadErr = ''; } else { C.loadErr = r.error || 'Erro ao ler a configuração'; }
    if (C.view === 'list') render();
  }

  function closeAll() {
    ov.hidden = true; C.view = 'list'; C.w = null;
  }
  async function requestClose() {
    if (C.view === 'import' && C.imp && !C.imp.busy) { await cancelImport(); return; }
    if (C.w && C.w.step !== 'done') { await cancelWizard(true); return; }
    closeAll();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.hidden) requestClose(); });

  // ------------------------------------------------------------ componentes
  const closeBtn = () => h('button', { class: 'icon-btn', title: 'Fechar', onclick: requestClose }, icon('x'));
  const head = (title, sub) => h('div', { class: 'c-head' },
    h('div', {}, h('h2', { class: 's-title' }, title), sub ? h('p', { class: 'c-sub' }, sub) : null), closeBtn());

  const DOT_LABELS = ['Serviço', 'Nome', 'Autorização', 'Detalhes', 'Pronto'];
  const DOT_AT = { service: 0, provider: 0, name: 1, form: 1, auth: 2, working: 2, question: 3, done: 4, error: 2 };
  const dots = (w) => (w.mode === 'reconnect' ? null : h('div', { class: 'dots' },
    DOT_LABELS.map((l, i) => h('div', { class: `dot${i === DOT_AT[w.step] ? ' on' : ''}${i < DOT_AT[w.step] ? ' past' : ''}` }, h('i'), h('span', {}, l)))));
  const spinner = () => h('div', { class: 'spin' });
  const actions = (...btns) => h('div', { class: 's-actions' }, ...btns.filter(Boolean));
  const ghost = (label, onclick, ico) => h('button', { class: 'ghost-btn', onclick }, ico ? icon(ico) : null, label);
  const primary = (label, onclick, ico) => {
    const b = h('button', { class: 'primary sm', onclick }, ico ? icon(ico) : null, label);
    return b;
  };

  function render() {
    const body = C.view === 'list' ? listView() : (C.view === 'import' ? importView() : wizardView());
    ov.replaceChildren(h('div', { class: 'sheet wide', role: 'dialog', 'aria-modal': 'true' }, body));
  }

  // ------------------------------------------------------------------ lista
  function listView() {
    const rows = C.remotes.map(rowEl);
    return h('div', {},
      head('Conexões', 'Contas e bibliotecas configuradas no rclone deste computador'),
      C.loadErr ? h('div', { class: 'conn-err' }, icon('alert'), C.loadErr) : null,
      C.note ? h('div', { class: 'conn-ok' }, icon('check'), C.note) : null,
      h('div', { class: 'conn-list' }, rows.length ? rows : h('div', { class: 'empty' }, icon('plug'), h('b', {}, 'Nenhuma conexão ainda'),
        h('p', {}, 'Conecte o SharePoint, o OneDrive ou outro serviço para começar.'))),
      h('div', { class: 'conn-foot' },
        h('div', { class: 'cfg-note', title: C.configFile }, icon('lock'),
          h('div', {}, h('div', {}, 'As conexões guardam tokens de acesso — mantenha o arquivo privado'),
            C.configFile ? h('code', {}, C.configFile) : null)),
        h('div', { class: 'btns' }, ghost('Fechar', closeAll), ghost('Exportar backup', exportBackup, 'upload'), ghost('Importar backup', startImport, 'downloads'), primary('Nova conexão', startWizard, 'plus'))));
  }

  // --------------------------------------------------------- importar backup
  async function exportBackup() {
    C.note = ''; C.loadErr = '';
    const r = await api.confExport();
    if (!r.ok) C.loadErr = r.error;
    else if (!r.canceled) {
      C.note = `Backup salvo em ${r.file}${r.encrypted ? ' (configuração com senha)' : ` · ${r.count} conexão(ões)`}. Guarde-o em local seguro: ele contém os tokens de acesso.`;
    }
    render();
  }
  async function startImport() {
    const r = await api.confImportPick();
    if (!r.ok) { C.loadErr = r.error; C.view = 'list'; render(); return; }
    if (r.canceled) return;
    C.loadErr = '';
    C.imp = {
      file: r.file, remotes: r.remotes, skipped: r.skipped, busy: false, err: '', result: null,
      sel: new Set(r.remotes.map((x) => x.name)), over: new Set(),
    };
    C.view = 'import'; render();
  }
  async function cancelImport() {
    await api.confImportClear(); C.imp = null; C.view = 'list'; render();
  }
  async function applyImport() {
    const m = C.imp; m.busy = true; m.err = ''; render();
    const names = [...m.sel].filter((n) => { const r = m.remotes.find((x) => x.name === n); return r && (!r.exists || m.over.has(n)); });
    const r = await api.confImportApply({ names, overwrite: [...m.over] });
    m.busy = false;
    if (r.ok) m.result = r; else m.err = r.error || 'Falha ao importar';
    render();
    if (r.ok) { await refreshList(); await RV.remotesChanged(); }
  }
  function importView() {
    const m = C.imp;
    if (m.result) {
      const x = m.result;
      return h('div', {},
        head('Backup importado', null),
        h('div', { class: 'conn-list' }, h('div', { class: 'empty' }, icon('check'), h('b', {}, `${x.imported} conexão(ões) importada(s)`),
          h('p', {}, x.replaced ? `${x.replaced} substituída(s). ` : '', 'Use “Testar” na lista para confirmar que o acesso continua válido.'),
          x.backup ? h('p', { class: 'c-sub' }, 'Cópia da configuração anterior: ', h('code', {}, x.backup)) : null)),
        actions(primary('Ver conexões', () => { C.imp = null; C.view = 'list'; render(); })));
    }
    const rows = m.remotes.map((r) => {
      const on = m.sel.has(r.name);
      const cb = h('input', { type: 'checkbox', checked: on, disabled: m.busy, onchange: (e) => { if (e.target.checked) m.sel.add(r.name); else m.sel.delete(r.name); render(); } });
      const ow = r.exists ? h('label', { class: 'ow' }, h('input', { type: 'checkbox', checked: m.over.has(r.name), disabled: m.busy || !on,
        onchange: (e) => { if (e.target.checked) m.over.add(r.name); else m.over.delete(r.name); render(); } }), 'substituir a existente') : null;
      return h('div', { class: 'conn-row' }, h('div', { class: 'conn-main' },
        h('label', { class: 'imp-pick' }, cb),
        h('div', { class: 'ic' }, icon(typeIcon(r))),
        h('div', { class: 'meta' }, h('div', { class: 'nm' }, r.name), h('div', { class: 'ty' }, typeLabel(r))),
        r.exists ? h('span', { class: 'chip2 warn' }, 'Já existe') : (OAUTH_TYPES.has(r.type) && !r.hasToken ? h('span', { class: 'chip2 warn' }, 'Sem autorização') : null),
        ow));
    });
    const n = [...m.sel].filter((k) => { const r = m.remotes.find((x) => x.name === k); return r && (!r.exists || m.over.has(k)); }).length;
    return h('div', {},
      head('Importar backup', `Arquivo: ${m.file}`),
      m.err ? h('div', { class: 'conn-err' }, icon('alert'), m.err) : null,
      h('div', { class: 'conn-list' }, ...rows),
      h('div', { class: 'conn-foot' },
        h('div', { class: 'cfg-note' }, icon('lock'), h('div', {}, 'As conexões são copiadas como estão (com os tokens), direto para a configuração do rclone. Uma cópia da configuração atual é guardada antes.')),
        h('div', { class: 'btns' }, ghost('Cancelar', cancelImport),
          h('button', { class: 'primary sm', disabled: m.busy || !n, onclick: applyImport }, m.busy ? 'Importando…' : `Importar ${n}`))));
  }

  function rowEl(r) {
    const t = C.tests[r.name];
    const needsAuth = OAUTH_TYPES.has(r.type) && !r.hasToken;
    let chip = null;
    if (needsAuth) chip = h('span', { class: 'chip2 warn' }, 'Sem autorização');
    else if (t && t.state === 'running') chip = h('span', { class: 'chip2' }, 'Testando…');
    else if (t && t.state === 'ok') chip = h('span', { class: 'chip2 ok' }, 'Funcionando');
    else if (t && t.state === 'err') chip = h('span', { class: 'chip2 bad' }, 'Falhou');

    const confirming = C.confirmDel === r.name;
    const acts = confirming
      ? [h('span', { class: 'confirm-q' }, 'Remover só a conexão?'), ghost('Cancelar', () => { C.confirmDel = null; render(); }),
        h('button', { class: 'danger-btn mini', onclick: () => removeRemote(r.name) }, 'Remover')]
      : [h('button', { class: 'ghost-btn mini', onclick: () => testRemote(r.name) }, 'Testar'),
        OAUTH_TYPES.has(r.type) ? h('button', { class: 'ghost-btn mini', onclick: () => startReconnect(r) }, 'Reconectar') : null,
        h('button', { class: 'icon-btn', title: 'Remover conexão', onclick: () => { C.confirmDel = r.name; render(); } }, icon('trash'))];

    const msg = t && t.state === 'err'
      ? h('div', { class: 'row-msg' }, clip(t.msg || 'Erro', 220), hintFor(t.msg) ? h('div', { class: 'row-hint' }, hintFor(t.msg)) : null)
      : (confirming ? h('div', { class: 'row-msg' }, 'Isso apaga apenas a configuração neste computador. Os arquivos na nuvem não são afetados.') : null);

    return h('div', { class: 'conn-row' },
      h('div', { class: 'conn-main' },
        h('div', { class: 'ic' }, icon(typeIcon(r))),
        h('div', { class: 'meta' }, h('div', { class: 'nm' }, r.name), h('div', { class: 'ty' }, typeLabel(r))),
        chip,
        h('div', { class: 'row-acts' }, ...acts)),
      msg);
  }

  async function testRemote(name) {
    C.tests[name] = { state: 'running' }; render();
    const r = await api.confTest(name);
    C.tests[name] = r.ok ? { state: 'ok', count: r.count } : { state: 'err', msg: r.error };
    if (C.view === 'list') render();
  }

  async function removeRemote(name) {
    C.confirmDel = null;
    const r = await api.confDelete(name);
    if (!r.ok) C.loadErr = r.error || 'Não foi possível remover'; else C.loadErr = '';
    delete C.tests[name];
    await refreshList();
    await RV.remotesChanged();
  }

  // ---------------------------------------------------------------- assistente
  function startWizard() {
    C.view = 'wizard'; C.w = newW(); render();
  }

  function wizardView() {
    const w = C.w;
    return ({
      service: serviceStep, provider: providerStep, name: nameStep, form: formStep, auth: authStep,
      question: questionStep, working: workingStep, done: doneStep, error: errorStep,
    }[w.step] || workingStep)(w);
  }

  const wizTitle = (w) => (w.mode === 'reconnect' ? `Reconectar “${w.name}”` : 'Nova conexão');

  // 1) serviço
  function serviceStep(w) {
    return h('div', {},
      head('Nova conexão', 'O que você quer conectar?'), dots(w),
      h('div', { class: 'svc-grid' }, SERVICES.map((s) => h('button', { class: 'svc', onclick: () => pickService(s) },
        h('div', { class: 'ic big' }, icon(s.icon)), h('div', {}, h('b', {}, s.label), h('span', {}, s.sub))))),
      actions(ghost('Voltar', () => { C.view = 'list'; C.w = null; render(); }, 'back')));
  }

  function pickService(s) {
    const w = C.w; w.service = s;
    if (s.generic) { w.step = 'provider'; render(); loadProviderList(); return; }
    w.type = s.type; w.name = suggestName(s.base); w.step = 'name'; render();
  }

  // 1b) outro serviço
  async function loadProviderList() {
    if (!C.providers) {
      const r = await api.confProviders();
      C.providers = r.ok ? r.providers : []; C.provErr = r.ok ? '' : (r.error || 'Erro');
    }
    if (C.w && C.w.step === 'provider') render();
  }

  function providerStep(w) {
    const list = h('div', { class: 'pick-list' });
    if (!C.providers) list.append(h('div', { class: 'center-note' }, spinner(), 'Carregando serviços do rclone…'));
    else if (C.provErr) list.append(h('div', { class: 'conn-err' }, icon('alert'), C.provErr));
    else {
      for (const p of C.providers) {
        const b = h('button', { class: 'pick', 'data-text': `${p.description} ${p.name}`.toLowerCase(), onclick: () => pickProvider(p) },
          h('span', { class: 'pk-main' }, clip(p.description || p.name, 70)), h('span', { class: 'pk-sub' }, p.name));
        list.append(b);
      }
    }
    const search = h('input', {
      class: 'big-in', placeholder: 'Buscar serviço (ex.: s3, sftp, webdav, mega)…', spellcheck: 'false',
      oninput: (e) => {
        const f = e.target.value.trim().toLowerCase();
        list.querySelectorAll('.pick').forEach((el) => { el.hidden = !!f && !el.dataset.text.includes(f); });
      },
    });
    return h('div', {},
      head('Outro serviço', 'Escolha o serviço que você quer conectar'), dots(w),
      search, list,
      actions(ghost('Voltar', () => { w.step = 'service'; render(); }, 'back')));
  }

  async function pickProvider(p) {
    const w = C.w;
    w.step = 'working'; w.working = 'Carregando os campos do serviço…'; render();
    const r = await api.confProvider(p.name);
    if (C.w !== w) return;
    if (!r.ok) { w.err = r.error || 'Erro'; w.step = 'error'; render(); return; }
    w.type = p.name; w.providerLabel = p.description || p.name; w.options = r.options; w.values = {};
    w.name = suggestName(p.name.replace(/[^A-Za-z0-9_.+@-]/g, '') || 'conexao');
    w.step = 'name'; render();
  }

  // 2) nome (+ tenant para Microsoft corporativo)
  function nameStep(w) {
    const err = h('div', { class: 'fld-err' });
    const goBtn = primary(w.service.generic ? 'Continuar' : 'Autorizar no navegador', () => submitName(), w.service.generic ? null : 'link');
    const check = () => {
      const e = nameError(w.name) || (w.tenant && !/^[\w.-]+$/.test(w.tenant) ? 'O ID do locatário tem caracteres inválidos.' : '');
      err.textContent = e; goBtn.disabled = !!e;
    };
    const nameIn = h('input', {
      class: 'big-in mono', value: w.name, spellcheck: 'false', autocomplete: 'off',
      oninput: (e) => { w.name = e.target.value.trim(); check(); },
      onkeydown: (e) => { if (e.key === 'Enter' && !goBtn.disabled) submitName(); },
    });
    setTimeout(() => { check(); nameIn.focus(); nameIn.select(); }, 0);

    const adv = w.service.tenant ? h('details', { class: 'adv', open: w.tenant ? '' : null },
      h('summary', {}, 'Avançado'),
      h('label', { class: 'fld-label' }, 'ID do locatário (tenant) — opcional'),
      h('input', { class: 'big-in mono', value: w.tenant, placeholder: 'ex.: 308479d6-abd6-486b-b62c-5f9019fb5697', spellcheck: 'false', oninput: (e) => { w.tenant = e.target.value.trim(); check(); } }),
      h('div', { class: 'fld-help' }, 'Faz o login ir direto para a sua organização (em vez do endereço genérico). Use se o login comum for recusado. Equivale ao campo “tenant” do rclone.')) : null;

    return h('div', {},
      head(w.service.generic ? w.providerLabel || 'Nova conexão' : w.service.label, 'Dê um nome a esta conexão'), dots(w),
      h('label', { class: 'fld-label' }, 'Nome da conexão'),
      nameIn, err,
      h('div', { class: 'fld-help' }, 'É assim que ela aparece no Revoada e no rclone (por exemplo: media-sharepoint). Não dá para mudar depois sem recriar.'),
      adv,
      actions(ghost('Voltar', () => { w.step = w.service.generic ? 'provider' : 'service'; render(); if (w.service.generic) loadProviderList(); }, 'back'), goBtn));
  }

  function submitName() {
    const w = C.w;
    const e = nameError(w.name);
    if (e) return;
    if (w.tenant && !/^[\w.-]+$/.test(w.tenant)) { w.tenantErr = true; return; }
    if (w.service.generic && w.options && w.options.length) { w.step = 'form'; render(); return; }
    startCreate();
  }

  // 2b) formulário genérico
  const matchProvider = (cfg, optProvider) => {
    if (!optProvider) return true;
    let p = optProvider; let neg = false;
    if (p.startsWith('!')) { neg = true; p = p.slice(1); }
    const hit = p.split(',').includes(cfg);
    return neg ? !hit : hit;
  };
  const provKey = (w) => {
    if (w.values.provider !== undefined) return w.values.provider;
    const o = (w.options || []).find((x) => x.name === 'provider');
    return o ? o.def : '';
  };
  const valueOf = (w, o) => (w.values[o.name] !== undefined ? w.values[o.name] : o.def);

  function fieldEl(w, o, rebuild) {
    const val = valueOf(w, o);
    const pk = provKey(w);
    const ex = o.examples.filter((e) => matchProvider(pk, e.provider));
    const label = h('label', { class: 'fld-label' }, o.name, o.required ? h('i', { title: 'obrigatório' }, ' *') : null);
    const help = h('div', { class: 'fld-help' }, clip(String(o.help).split('\n\n')[0].replace(/\s*\n\s*/g, ' ').trim(), 240));
    const set = (v) => { w.values[o.name] = v; if (o.name === 'provider') rebuild(); };
    let input;
    if (o.type === 'bool') {
      const cb = h('input', { type: 'checkbox', onchange: (e) => set(e.target.checked ? 'true' : 'false') });
      cb.checked = String(val) === 'true';
      return h('div', { class: 'fld' }, h('label', { class: 'switch' }, cb, h('span', { class: 'track' }), h('span', { class: 'txt' }, o.name)), help);
    }
    if (o.exclusive && ex.length) {
      input = h('select', { class: 'big-in', onchange: (e) => set(e.target.value) },
        ...(o.required || val ? [] : [h('option', { value: '' }, '—')]),
        ...ex.map((e) => h('option', { value: e.value }, clip(firstLine(e.help) || e.value, 70))));
      input.value = val;
    } else {
      const id = `dl-${o.name}`;
      input = h('input', {
        class: 'big-in mono', type: o.password ? 'password' : 'text', value: val, spellcheck: 'false', autocomplete: 'off',
        list: ex.length ? id : null, placeholder: o.def ? String(o.def) : '', oninput: (e) => set(e.target.value),
      });
      if (ex.length) return h('div', { class: 'fld' }, label, input, h('datalist', { id }, ...ex.slice(0, 80).map((e) => h('option', { value: e.value }, clip(firstLine(e.help), 60)))), help);
    }
    return h('div', { class: 'fld' }, label, input, help);
  }

  function formStep(w) {
    const box = h('div', { class: 'fields' });
    const err = h('div', { class: 'fld-err' });
    const rebuild = () => {
      const pk = provKey(w);
      box.replaceChildren(...w.options.filter((o) => matchProvider(pk, o.provider)).map((o) => fieldEl(w, o, rebuild)));
    };
    rebuild();
    return h('div', {},
      head(w.providerLabel || w.type, `Dados da conexão “${w.name}”`), dots(w),
      box, err,
      actions(ghost('Voltar', () => { w.step = 'name'; render(); }, 'back'),
        primary('Criar conexão', () => {
          const pk = provKey(w);
          const missing = w.options.filter((o) => matchProvider(pk, o.provider) && o.required && !String(valueOf(w, o)).trim());
          if (missing.length) { err.textContent = `Preencha: ${missing.map((o) => o.name).join(', ')}`; return; }
          startCreate();
        })));
  }

  function buildParams(w) {
    const params = [];
    if (w.options) {
      const pk = provKey(w);
      for (const o of w.options) {
        if (!matchProvider(pk, o.provider)) continue;
        const v = String(valueOf(w, o));
        if (v !== '' && v !== String(o.def)) params.push([o.name, v]);
        else if (o.name === 'provider' && v !== '') params.push([o.name, v]);
      }
    }
    if (w.tenant) params.push(['tenant', w.tenant]);
    return params;
  }

  // 3) executar passos do rclone
  async function startCreate() {
    const w = C.w;
    w.step = 'working'; w.working = 'Criando a conexão…'; render();
    w.params = buildParams(w);
    const res = await api.confStep({ mode: 'create', name: w.name, type: w.type, params: w.params });
    // Só vale como "criada por nós" depois que o rclone confirmou o primeiro passo;
    // assim um erro (como nome já existente) nunca apaga uma conexão que já existia.
    if (res.ok) w.created = true;
    if (C.w !== w) { if (res.ok) await api.confDelete(w.name); return; } // cancelado no meio
    await handle(res, w);
  }

  async function startReconnect(r) {
    C.view = 'wizard';
    const w = Object.assign(newW(), { mode: 'reconnect', name: r.name, type: r.type, service: { preset: {} }, step: 'working', working: 'Preparando a reconexão…' });
    C.w = w; render();
    w.fp = await api.confFingerprint(r.name);
    const res = await api.confStep({ mode: 'update', name: r.name, params: [] });
    await handle(res, w);
  }

  async function answer(value) {
    const w = C.w;
    if (w.q && w.q.Name === 'config_is_local') { w.step = 'auth'; w.authUrl = ''; } else { w.step = 'working'; w.working = 'Continuando…'; }
    render();
    const res = await api.confStep({ mode: 'update', name: w.name, type: w.type, params: w.params, state: w.state, result: String(value) });
    await handle(res, w);
  }

  async function handle(res, w) {
    if (C.w !== w || res.cancelled) return;
    if (!res.ok) { await fail(res.error); return; }
    const j = res.json || {};
    if (!j.State) { await (w.mode === 'reconnect' ? finishReconnect() : finishCreate()); return; }
    w.state = j.State;
    if (!j.Option) {
      // O rclone mandou só um erro (ex.: site não encontrado) para ser mostrado junto
      // com a próxima pergunta. Segue para o estado indicado e guarda o erro.
      if (++w.hops > 40) { await fail('O assistente do rclone não avançou. Tente de novo.'); return; }
      if (j.Error) w.pendingErr = j.Error;
      w.q = {};
      await answer(j.Result || '');
      return;
    }
    w.hops = 0;
    const q = j.Option;
    w.q = q; w.lastError = j.Error || w.pendingErr || ''; w.pendingErr = '';
    if (q.Name === 'config_refresh_token' || q.Name === 'config_is_local') { await answer('true'); return; }
    if (w.mode === 'reconnect') { await finishReconnect(); return; } // token já renovado
    const ex = q.Examples || [];
    const pre = w.service && w.service.preset ? w.service.preset[q.Name] : undefined;
    if (pre !== undefined && !w.usedPreset[q.Name] && ex.some((e) => e.Value === pre)) {
      w.usedPreset[q.Name] = true; await answer(pre); return;
    }
    if (q.Name === 'config_driveid' && q.Exclusive && ex.length === 1) { await answer(ex[0].Value); return; }
    w.step = 'question'; w.qanswer = q.DefaultStr != null ? String(q.DefaultStr) : ''; render();
  }

  async function fail(msg) {
    const w = C.w;
    if (w.mode === 'create' && w.created) { await api.confCancel(w.name); w.created = false; }
    w.step = 'error'; w.err = msg || 'Erro desconhecido'; render();
  }

  async function verify(w) {
    w.test = { state: 'running' }; render();
    const t = await api.confTest(w.name);
    w.test = t.ok ? { state: 'ok', count: t.count } : { state: 'err', msg: t.error };
    if (C.w === w) render();
  }

  async function finishCreate() {
    const w = C.w;
    w.step = 'done';
    await refreshList(); await RV.remotesChanged();
    await verify(w);
  }

  async function finishReconnect() {
    const w = C.w;
    const fp = await api.confFingerprint(w.name);
    if (!fp || fp === w.fp) { await fail('O rclone não gravou uma nova autorização. Tente de novo ou rode “rclone config reconnect” no terminal.'); return; }
    w.renewed = true; w.step = 'done';
    await refreshList(); await RV.remotesChanged();
    await verify(w);
  }

  async function cancelWizard(closeOverlay) {
    const w = C.w;
    const del = w && w.mode === 'create' && w.created && w.step !== 'done' ? w.name : null;
    C.w = null; C.view = 'list';
    await api.confCancel(del);
    if (closeOverlay) { ov.hidden = true; } else { render(); await refreshList(); }
    if (del) await RV.remotesChanged();
  }

  // telas de andamento
  function workingStep(w) {
    return h('div', {}, head(wizTitle(w)), dots(w), h('div', { class: 'center-note big' }, spinner(), w.working || 'Falando com o rclone…'));
  }

  function authStep(w) {
    const link = w.authUrl;
    return h('div', {},
      head(wizTitle(w), 'Autorize o acesso no navegador'), dots(w),
      h('div', { class: 'auth' },
        h('div', { class: 'ring-wait' }, spinner()),
        h('div', { class: 'auth-txt' },
          h('b', {}, 'Aguardando você entrar no navegador…'),
          h('p', {}, 'Abrimos a página de login no seu navegador. Entre com a sua conta, aceite o acesso do rclone e depois volte para esta janela. Não feche o Revoada enquanto isso.'))),
      h('div', { class: 'link-box' }, icon('link'), h('code', {}, link || 'Gerando o link…')),
      actions(
        link ? ghost('Copiar link', (e) => { navigator.clipboard.writeText(link).catch(() => {}); e.currentTarget.lastChild.textContent = 'Copiado'; }, 'copy') : null,
        link ? ghost('Abrir de novo', () => api.confOpen(link), 'link') : null,
        h('button', { class: 'danger-btn', onclick: () => cancelWizard(false) }, 'Cancelar')));
  }

  // pergunta do rclone
  function questionStep(w) {
    const q = w.q;
    const tx = QTEXT[q.Name] || {};
    const ex = q.Examples || [];
    const isBool = q.Type === 'bool' || (ex.length === 2 && ex.every((e) => ['true', 'false'].includes(e.Value)));
    const title = tx.title || firstLine(q.Help) || q.Name;
    const showHelp = !tx.title || q.Name === 'config_drive_ok';
    const helpEl = showHelp ? h('pre', { class: 'q-help' }, clip(String(q.Help || '').trim(), 900)) : (tx.hint ? h('p', { class: 'c-sub' }, tx.hint) : null);
    let control; let foot = actions(h('button', { class: 'danger-btn', onclick: () => cancelWizard(false) }, 'Cancelar'));

    if (isBool) {
      const defTrue = String(q.Default) !== 'false';
      control = h('div', { class: 'yn' },
        h('button', { class: `primary sm${defTrue ? '' : ' alt'}`, onclick: () => answer('true') }, 'Sim'),
        h('button', { class: `primary sm${defTrue ? ' alt' : ''}`, onclick: () => answer('false') }, 'Não'));
    } else if (ex.length) {
      // Lista clicável. Quando a pergunta não é exclusiva (escolha de site/biblioteca),
      // também dá para informar outro valor à mão.
      const list = h('div', { class: 'pick-list' }, ex.map((e) => {
        const lines = String(e.Help || '').split('\n').map((l) => l.trim()).filter(Boolean);
        const main = (q.Name === 'config_type' && TYPE_CHOICE_PT[e.Value]) || lines[0] || e.Value;
        const sub = lines.slice(1).join(' · ') || (!q.Exclusive && e.Value !== main ? e.Value : '');
        return h('button', { class: 'pick', 'data-text': `${main} ${sub} ${e.Value}`.toLowerCase(), onclick: () => answer(e.Value) },
          h('span', { class: 'pk-main' }, clip(main, 90)), sub ? h('span', { class: 'pk-sub' }, clip(sub, 110)) : null);
      }));
      let custom = null;
      if (!q.Exclusive) {
        const use = primary('Usar este valor', () => answer(w.qanswer));
        use.disabled = true;
        custom = h('div', { class: 'custom-val' },
          h('label', { class: 'fld-label' }, 'Ou informe outro valor'),
          h('div', { class: 'custom-row' },
            h('input', {
              class: 'big-in mono', spellcheck: 'false', autocomplete: 'off',
              oninput: (e) => { w.qanswer = e.target.value; use.disabled = !w.qanswer.trim(); },
              onkeydown: (e) => { if (e.key === 'Enter' && !use.disabled) answer(w.qanswer); },
            }), use));
      }
      control = h('div', {},
        ex.length > 7 ? h('input', {
          class: 'big-in', placeholder: 'Filtrar…', spellcheck: 'false',
          oninput: (e) => { const f = e.target.value.trim().toLowerCase(); list.querySelectorAll('.pick').forEach((el) => { el.hidden = !!f && !el.dataset.text.includes(f); }); },
        }) : null,
        list, custom);
    } else {
      const go = primary('Continuar', () => answer(w.qanswer));
      const check = () => { go.disabled = !!q.Required && !String(w.qanswer).trim(); };
      const inp = h('input', {
        class: 'big-in mono', type: q.IsPassword ? 'password' : 'text', value: w.qanswer, spellcheck: 'false', autocomplete: 'off',
        list: ex.length ? 'q-dl' : null,
        oninput: (e) => { w.qanswer = e.target.value; check(); },
        onkeydown: (e) => { if (e.key === 'Enter' && !go.disabled) answer(w.qanswer); },
      });
      setTimeout(() => { check(); inp.focus(); }, 0);
      control = h('div', {}, inp, ex.length ? h('datalist', { id: 'q-dl' }, ...ex.map((e) => h('option', { value: e.Value }, clip(firstLine(e.Help), 60)))) : null);
      foot = actions(h('button', { class: 'danger-btn', onclick: () => cancelWizard(false) }, 'Cancelar'), go);
    }

    return h('div', {},
      head(title), dots(w), helpEl,
      w.lastError ? h('div', { class: 'conn-err' }, icon('alert'), w.lastError) : null,
      h('div', { class: 'q-body' }, control), foot);
  }

  // final
  function doneStep(w) {
    const t = w.test || { state: 'running' };
    let status;
    if (t.state === 'running') status = h('div', { class: 'center-note' }, spinner(), 'Verificando o acesso…');
    else if (t.state === 'ok') status = h('div', { class: 'test-ok' }, icon('check'), `Acesso verificado${t.count != null ? ` · ${t.count} pasta${t.count === 1 ? '' : 's'} na raiz` : ''}`);
    else status = h('div', { class: 'test-bad' }, icon('alert'), h('div', {}, h('b', {}, 'A conexão foi criada, mas o teste de acesso falhou'),
      h('p', {}, clip(t.msg || '', 240)), hintFor(t.msg) ? h('p', { class: 'row-hint' }, hintFor(t.msg)) : null));
    return h('div', {},
      head(w.renewed ? 'Conexão renovada' : 'Conexão criada'), dots(w),
      h('div', { class: 'done-hero' }, h('div', { class: 'okmark' }, icon('check')),
        h('b', {}, `“${w.name}” ${w.renewed ? 'foi reconectada' : 'está pronta'}`),
        h('p', { class: 'c-sub' }, w.renewed ? 'A autorização foi renovada.' : 'Ela já aparece na lista de conexões do Revoada.')),
      status,
      actions(ghost('Voltar à lista', () => { C.view = 'list'; C.w = null; render(); refreshList(); }),
        primary('Usar esta conexão', async () => { await RV.remotesChanged(w.name); closeAll(); }, 'play')));
  }

  function errorStep(w) {
    return h('div', {},
      head(w.mode === 'reconnect' ? `Não foi possível reconectar “${w.name}”` : 'Não foi possível criar a conexão'),
      h('div', { class: 'test-bad' }, icon('alert'), h('div', {}, h('b', {}, 'O rclone informou:'), h('p', {}, clip(w.err || '', 400)),
        hintFor(w.err) ? h('p', { class: 'row-hint' }, hintFor(w.err)) : null)),
      actions(ghost('Voltar à lista', () => { C.view = 'list'; C.w = null; render(); refreshList(); }),
        primary('Tentar de novo', () => {
          if (w.mode === 'reconnect') { const r = C.remotes.find((x) => x.name === w.name); if (r) startReconnect(r); return; }
          w.step = 'name'; w.created = false; w.usedPreset = {}; render();
        }, 'refresh')));
  }

  api.onConf((ev) => {
    const w = C.w;
    if (!w || ev.type !== 'auth-url') return;
    w.authUrl = ev.url;
    if (w.step === 'auth') render();
  });
})();
