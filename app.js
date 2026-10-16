const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const states = { trabalhando: 'Trabalhando', delegando: 'Delegando', aguardando: 'Aguardando', concluida: 'Concluída', orfa: 'Órfã' };

const FIXED_ROLES = [
  'antigravity-core',
  'architect-pm',
  'qa-auditor',
  'guardian-sre',
  'sdr-prospector',
  'chatbot-engine',
  'data-dba',
  'cybersec',
  'jarvis'
];

function formatarFocoProjeto(cwd) {
  if (!cwd) return 'Geral';
  const normal = String(cwd).replace(/\\/g, '/').replace(/\/+$/, '');
  const lower = normal.toLowerCase();
  const markers = ['/codebase/', '/projects/', '/projetos/', '/home/felipe/', '/home/'];
  for (const m of markers) {
    const idx = lower.indexOf(m);
    if (idx !== -1) {
      const rest = normal.slice(idx + m.length);
      const parts = rest.split('/').filter(Boolean);
      if (parts.length > 0) {
        if (parts[0].toLowerCase() === 'fgsoftware' && parts.length > 1) return parts[1];
        return parts[0];
      }
    }
  }
  const parts = normal.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && last.toLowerCase() !== 'codebase' && last.toLowerCase() !== 'projects') return last;
  return 'Geral';
}

function buildDefaultDashboard(events = []) {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const agentEvents = events.filter((e) => e.session_id !== 'quota-sync');
  const latestSessionId = agentEvents[0]?.session_id || 'fgsoftware-main';
  const mainKey = `s_${latestSessionId}`;
  const execMap = new Map();

  const roleByProject = (cwd = '') => {
    const lower = cwd.toLowerCase();
    if (lower.includes('homestudio') || lower.includes('portfolio') || lower.includes('architect') || lower.includes('pauta-limpa')) return 'architect-pm';
    if (lower.includes('garden-cut') || lower.includes('fit') || lower.includes('test') || lower.includes('audit')) return 'qa-auditor';
    if (lower.includes('infra') || lower.includes('ops') || lower.includes('docker') || lower.includes('canivete')) return 'guardian-sre';
    if (lower.includes('leads') || lower.includes('prospect') || lower.includes('linkedin') || lower.includes('agrofinance')) return 'sdr-prospector';
    if (lower.includes('second-brain') || lower.includes('whatsapp') || lower.includes('chat') || lower.includes('subtitle') || lower.includes('sfx')) return 'chatbot-engine';
    if (lower.includes('db') || lower.includes('database') || lower.includes('sql') || lower.includes('prisma') || lower.includes('fraud')) return 'data-dba';
    if (lower.includes('security') || lower.includes('cyber') || lower.includes('vault') || lower.includes('auth')) return 'cybersec';
    return null;
  };

  // Agrupa eventos por sessão para mapear todas as IAs em execução simultânea
  const sessionsSeen = new Map();
  for (const e of agentEvents) {
    if (!sessionsSeen.has(e.session_id)) sessionsSeen.set(e.session_id, []);
    sessionsSeen.get(e.session_id).push(e);
  }

  const assignedRoles = new Set();
  let isFirstSession = true;

  for (const [, sEvents] of sessionsSeen.entries()) {
    const latestEvent = sEvents[0];
    const eventMs = Date.parse(latestEvent.created_at || nowIso);
    const isRecent = (nowMs - eventMs) < 300000; // 5 minutos de janela ativa
    const isWorking = isRecent && (latestEvent.status === 'trabalhando' || latestEvent.status === 'delegando');

    let targetRole = latestEvent.agent_type;
    if (targetRole === 'principal' || targetRole === 'antigravity-core') {
      if (isFirstSession) {
        targetRole = 'antigravity-core';
        isFirstSession = false;
      } else {
        const inferred = roleByProject(latestEvent.cwd);
        if (inferred && !assignedRoles.has(inferred)) {
          targetRole = inferred;
        } else {
          const freeRole = FIXED_ROLES.find((r) => r !== 'antigravity-core' && r !== 'jarvis' && !assignedRoles.has(r));
          targetRole = freeRole || 'antigravity-core';
        }
      }
    }
    assignedRoles.add(targetRole);

    const isPrincipal = targetRole === 'antigravity-core';
    const runKey = isPrincipal ? mainKey : `s_${latestSessionId}_a_${targetRole}`;

    if (!execMap.has(runKey)) {
      execMap.set(runKey, {
        chave: runKey,
        session_id: latestSessionId,
        agent_id: isPrincipal ? null : targetRole,
        tipo: targetRole,
        estado: isWorking ? latestEvent.status : 'aguardando',
        pai_chave: isPrincipal ? null : mainKey,
        cwd: latestEvent.cwd || 'Global Workspace',
        foco_projeto: formatarFocoProjeto(latestEvent.cwd),
        criado_em: latestEvent.created_at || nowIso,
        atualizado_em: latestEvent.created_at || nowIso,
        device: latestEvent.device || 'Nuvem',
        tool: latestEvent.tool || null,
        projeto_id: 1,
        projeto_nome: 'FGSOFT Operations Room'
      });
    }
  }

  // Preenche a equipe fixa que não possui tarefas no momento
  for (const role of FIXED_ROLES) {
    const isPrincipal = role === 'antigravity-core';
    const isJarvis = role === 'jarvis';
    const runKey = isPrincipal ? mainKey : `s_${latestSessionId}_a_${role}`;
    if (!execMap.has(runKey)) {
      execMap.set(runKey, {
        chave: runKey,
        session_id: latestSessionId,
        agent_id: isPrincipal ? null : role,
        tipo: role,
        estado: 'aguardando',
        pai_chave: isPrincipal ? null : mainKey,
        cwd: isJarvis ? 'Netbook Ubuntu 24/7' : 'Global Workspace',
        foco_projeto: isJarvis ? 'Life OS Core' : 'Geral',
        criado_em: nowIso,
        atualizado_em: nowIso,
        device: isJarvis ? 'Netbook NP-N150' : 'Equipe Global',
        tool: isJarvis ? 'Evolution API / Supabase' : null,
        projeto_id: 1,
        projeto_nome: 'FGSOFT Operations Room'
      });
    }
  }

  const execucoes = [...execMap.values()];
  return {
    horas: 6,
    convivencia: 12,
    execucoes,
    historico: execucoes,
    historico_tipos: {},
    sessoes: execucoes.filter(r => !r.pai_chave),
    resumo: {
      trabalhando: execucoes.filter(r => r.estado === 'trabalhando').length,
      delegando: execucoes.filter(r => r.estado === 'delegando').length,
      aguardando: execucoes.filter(r => r.estado === 'aguardando').length,
      concluida: execucoes.filter(r => r.estado === 'concluida').length,
      orfa: 0,
      sessoes_ativas: new Set(execucoes.filter(r => ['trabalhando', 'delegando', 'aguardando'].includes(r.estado)).map(r => r.session_id)).size,
      execucoes_na_janela: execucoes.length
    }
  };
}

let projects = [{ id: 1, nome: 'FGSOFT Operations Room', caminho_local: 'Global Workspace', arquivado: false }];
let sessions = [{ session_id: 'fgsoftware-main', cwd: 'Global Workspace', ultimo_evento: 'aguardando', ultima_atualizacao: new Date().toISOString(), projeto_id: 1, projeto_nome: 'FGSOFT Operations Room' }];
let dashboard = buildDefaultDashboard();
let editingId = null;
let selected = null;
let viewMode = 'office';
const visualRuns = new Map();

async function request(method, path, body) {
  const response = await fetch('/api' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Não foi possível concluir a ação.');
  return data;
}

function notice(message, error = false) { const target = $('#notice'); target.textContent = message; target.classList.toggle('error', error); target.hidden = false; }
function openProject(project = null, path = '') { editingId = project?.id ?? null; $('#dialog-title').textContent = project ? 'Editar projeto' : 'Novo projeto'; $('#dialog-help').textContent = project ? 'A mudança da pasta atualiza as associações existentes.' : 'Escolha um nome curto para identificar a sala.'; $('#project-name').value = project?.nome ?? ''; $('#project-path').value = path || project?.caminho_local || ''; $('#project-dialog').showModal(); $('#project-name').focus(); }

function visualId(value) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function officeData() {
  const rooms = new Map();
  visualRuns.clear();
  const ativo = (dashboard.execucoes || []).find((e) => ['trabalhando', 'delegando'].includes(e.estado));
  const focoAtual = ativo ? (ativo.foco_projeto || formatarFocoProjeto(ativo.cwd)) : null;
  const salaNome = focoAtual ? `FGSOFT Operations Room — [${focoAtual}]` : 'FGSOFT Operations Room — Operações Globais';

  for (const run of dashboard.execucoes) {
    const key = 'p_fgsoftware';
    const room = rooms.get(key) || { chave: key, nome: salaNome, projeto_id: 1, cwd: run.cwd || 'Global Workspace', ativos: 0, execucoes: [] };
    const id = visualId(run.chave);
    visualRuns.set(String(id), run);
    room.execucoes.push({
      id,
      session_id: run.session_id,
      agent_id: run.agent_id,
      tipo_agente: run.agent_id ? run.tipo : 'principal',
      status: run.estado,
      foco_projeto: run.foco_projeto || formatarFocoProjeto(run.cwd),
      execucao_pai_id: run.pai_chave ? visualId(run.pai_chave) : null,
      duracao_segundos: Math.max(0, Math.floor((Date.now() - Date.parse(run.criado_em)) / 1000)),
      desde_segundos: Math.max(0, Math.floor((Date.now() - Date.parse(run.atualizado_em)) / 1000)),
    });
    if (['trabalhando', 'delegando', 'aguardando'].includes(run.estado)) room.ativos += 1;
    rooms.set(key, room);
  }
  return { salas: [...rooms.values()] };
}

function renderRoom() {
  const counts = dashboard.resumo;
  const metrics = [
    ['verde', 'Trabalhando', counts.trabalhando || 0],
    ['azul', 'Delegando', counts.delegando || 0],
    ['laranja', 'Aguardando', counts.aguardando || 0],
    ['roxo', 'Equipe FGSOFT', FIXED_ROLES.length],
  ];
  $('#office-summary').innerHTML = metrics.map(([color, label, value]) => `<article class="kpi"><span class="kpi-rotulo"><i class="ponto ${color}"></i>${label}</span><strong class="kpi-valor">${value}</strong></article>`).join('');
  $('#operation-bar').innerHTML = `<span class="ao-vivo"><i></i>Ao vivo</span><span class="jarvis-pill"><i class="jarvis-led"></i>J.A.R.V.I.S.: Online (Netbook Ubuntu 24/7)</span><span>${counts.sessoes_ativas || 0} sessão(ões)</span><span class="sep">·</span><span>${counts.execucoes_na_janela || 0} execuções</span><span class="meta-fim">atualiza a cada 4 s</span>`;
  const room = $('#office-room');
  if (viewMode === 'panel') {
    if (window.EscritorioPixel?.montado()) window.EscritorioPixel.destruir();
    room.innerHTML = `<div class="panel-table" role="region" aria-label="Painel de execuções"><table><thead><tr><th>Agente</th><th>Projeto</th><th>Estado</th><th>Atualização</th></tr></thead><tbody>${(dashboard.historico || []).map((run) => `<tr data-session="${esc(run.session_id)}" tabindex="0"><td>${esc(run.tipo)}</td><td>${esc(run.projeto_nome || run.cwd || 'Sem projeto')}</td><td>${esc(states[run.estado] || run.estado)}</td><td>${esc(new Date(run.atualizado_em).toLocaleString('pt-BR'))}</td></tr>`).join('') || '<tr><td colspan="4">Nenhuma execução no período.</td></tr>'}</tbody></table></div>`;
    return;
  }
  const data = officeData();
  if (!data.salas.length) {
    if (window.EscritorioPixel?.montado()) window.EscritorioPixel.destruir();
    room.innerHTML = '<p class="empty room-empty">Nenhuma sessão recebida. Configure os hooks ou inicie a demonstração.</p>';
    return;
  }
  if (window.EscritorioPixel?.montado()) window.EscritorioPixel.atualizar(data);
  else window.EscritorioPixel?.montar(room, data, { historico: () => dashboard.historico_tipos || {}, trajeto: () => $('#show-route')?.checked });
}

async function selectSession(sessionId) {
  selected = sessionId;
  renderRoom();
  const ROTULOS = {
    principal: 'Juliano - Tech Lead',
    'antigravity-core': 'Juliano - Tech Lead',
    'architect-pm': 'Luis - Arquitech',
    'qa-auditor': 'Duda - Q&A',
    'guardian-sre': 'Gabriel - Infra',
    'sdr-prospector': 'Yago - Leads',
    'chatbot-engine': 'Pedro - ChatBot',
    'data-dba': 'Gislaine - DBA',
    'dba-architect': 'Gislaine - DBA',
    'cybersec': 'Daniel - Cybersec',
    'cybersec-guardian': 'Daniel - Cybersec',
    'jarvis': 'J.A.R.V.I.S. - Life OS Core',
    'jarvis-core': 'J.A.R.V.I.S. - Life OS Core'
  };
  try {
    let evs = [];
    if (supabaseClient) {
      const { data } = await supabaseClient
        .from('ops_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      evs = (data || []).filter((e) => e.session_id === sessionId);
    } else if (SUPABASE_CONFIG.key) {
      const resp = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/ops_events?session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=created_at.desc&limit=50`, {
        headers: { apikey: SUPABASE_CONFIG.key, Authorization: `Bearer ${SUPABASE_CONFIG.key}` }
      });
      if (resp.ok) evs = await resp.json();
    }
    if (evs.length || SUPABASE_CONFIG.key) {
      const main = dashboard.execucoes.find((e) => e.session_id === sessionId && !e.pai_chave) || dashboard.execucoes[0];
      const sessionAgents = dashboard.execucoes.filter((e) => e.session_id === sessionId);
      const foco = main?.foco_projeto || formatarFocoProjeto(main?.cwd);
      const dispositivo = main?.device || evs[0]?.device || 'Equipe Global';
      $('#details').innerHTML = `<h2>${esc(ROTULOS[main?.tipo] || main?.tipo || 'FGSOFT Operations Room')}</h2><p class="status">${esc(states[main?.estado] || main?.estado || 'Ativo')}</p><p class="detail-path">🎯 Foco Atual: <strong>${esc(foco)}</strong></p><p class="detail-device" style="margin:4px 0 10px;font-size:12px;color:#94a3b8">💻 Dispositivo: <strong>${esc(dispositivo)}</strong></p><h3>Equipe da Software House</h3><ul class="agent-list">${sessionAgents.map((agent) => `<li><span>${esc(ROTULOS[agent.tipo] || agent.tipo)}</span><small>${agent.foco_projeto ? `[${esc(agent.foco_projeto)}] ` : ''}${esc(states[agent.estado] || agent.estado)}</small></li>`).join('')}</ul><h3>Histórico recente</h3><ol class="history">${evs.map((e) => `<li><span>${e.device ? `<small style="color:#60a5fa;margin-right:4px;">[${esc(e.device)}]</small>` : ''}${esc(ROTULOS[e.agent_type] || e.agent_type)}: ${esc(states[e.status] || e.status)} ${e.tool ? `(${esc(e.tool)})` : ''} <em>[${formatarFocoProjeto(e.cwd)}]</em></span><time>${esc(new Date(e.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</time></li>`).join('') || '<li>Aguardando novos eventos...</li>'}</ol>`;
      $('#details-modal').innerHTML = $('#details').innerHTML;
      $('#details-dialog').showModal();
      return;
    }
    const [agents, history] = await Promise.all([request('GET', `/sessoes/${encodeURIComponent(sessionId)}/agentes`), request('GET', `/sessoes/${encodeURIComponent(sessionId)}/historico`)]);
    const main = agents.agentes.find((agent) => !agent.pai_chave);
    $('#details').innerHTML = `<h2>${esc(ROTULOS[main?.tipo] || main?.tipo || 'Sessão')}</h2><p class="status">${esc(states[main?.estado] || '')}</p><p class="detail-path">🎯 Foco: ${esc(formatarFocoProjeto(main?.cwd))}</p><h3>Equipe</h3><ul class="agent-list">${agents.agentes.map((agent) => `<li><span>${esc(ROTULOS[agent.tipo] || agent.tipo)}</span><small>${esc(states[agent.estado])}</small></li>`).join('') || '<li>Nenhum agente registrado.</li>'}</ul><h3>Histórico</h3><ol class="history">${history.eventos.map((event) => `<li><span>${esc(event.nome)}</span><time>${esc(new Date(event.ocorrido_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</time></li>`).join('') || '<li>Sem eventos.</li>'}</ol>`;
    $('#details-modal').innerHTML = $('#details').innerHTML;
    $('#details-dialog').showModal();
  } catch (error) {
    notice(error.message, true);
  }
}


// Suporte a credenciais via hash na URL (#key=... ou localStorage)
if (window.location.hash) {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  if (hashParams.get('key')) {
    localStorage.setItem('OPS_SUPABASE_KEY', hashParams.get('key'));
  }
  if (hashParams.get('url')) {
    localStorage.setItem('OPS_SUPABASE_URL', hashParams.get('url'));
  }
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

// A chave é configurada pelo próprio usuário no navegador (via localStorage ou URL #key=...) para segurança total do repositório
const DEFAULT_SUPABASE_KEY = '';

let storedKey = localStorage.getItem('OPS_SUPABASE_KEY');
if (storedKey && storedKey.startsWith('sb_secret_')) {
  localStorage.removeItem('OPS_SUPABASE_KEY');
  storedKey = null;
}

const SUPABASE_CONFIG = {
  url: localStorage.getItem('OPS_SUPABASE_URL') || 'https://vlanohkshwjkkekkljtv.supabase.co',
  key: storedKey || DEFAULT_SUPABASE_KEY
};

let supabaseClient = null;
let realtimeChannel = null;

async function ensureSupabase() {
  if (supabaseClient) return supabaseClient;
  if (SUPABASE_CONFIG.key && SUPABASE_CONFIG.key.startsWith('sb_secret_')) {
    // Chaves secretas são bloqueadas nativamente por CORS/Edge Gateway pelo Supabase em navegadores
    return null;
  }
  if (!window.supabase) {
    for (let i = 0; i < 25 && !window.supabase; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (window.supabase && SUPABASE_CONFIG.key && !supabaseClient) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
      realtimeChannel = supabaseClient
        .channel('ops-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ops_events' }, () => {
          refresh();
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            $('#connection').textContent = 'Ao vivo (Supabase 24/7)';
          }
        });
    } catch (e) {
      console.warn('Supabase init:', e);
    }
  }
  return supabaseClient;
}

async function getSupabaseEvents() {
  await ensureSupabase();
  if (SUPABASE_CONFIG.key) {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('ops_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60);
      if (!error && data) return data;
    }
    // Fallback REST direto
    try {
      const resp = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/ops_events?select=*&order=created_at.desc&limit=60`, {
        headers: {
          apikey: SUPABASE_CONFIG.key,
          Authorization: `Bearer ${SUPABASE_CONFIG.key}`
        }
      });
      if (resp.ok) return await resp.json();
    } catch {}
  }
  return null;
}

function renderUsage(usage) {
  const container = $('#usage-widget');
  if (!container) return;
  if (!usage) {
    container.innerHTML = '<span class="usage-title">⚡ Antigravity Quota</span><span class="usage-label">Carregando limites...</span>';
    return;
  }

  const gemini5hStr = String(usage.gemini_5h || '100%');
  const geminiWeeklyStr = String(usage.gemini_weekly || '100%');
  const num5h = parseInt(gemini5hStr, 10) || 0;
  const numWeekly = parseInt(geminiWeeklyStr, 10) || 0;

  const cor5h = num5h > 40 ? 'verde' : (num5h > 15 ? 'amarelo' : 'vermelho');
  const corWeekly = numWeekly > 40 ? 'verde' : (numWeekly > 15 ? 'amarelo' : 'vermelho');

  const reset5h = usage.reset_gemini_5h ? new Date(usage.reset_gemini_5h).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  const resetWeekly = usage.reset_gemini_weekly ? new Date(usage.reset_gemini_weekly).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';

  container.innerHTML = `
    <div class="usage-title">
      <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      <span>Quota & Limites</span>
    </div>
    <div class="usage-group">
      <div class="usage-item" title="Limite Gemini 5 Horas${reset5h ? ` (reseta às ${reset5h})` : ''}">
        <span class="usage-label">Gemini 5h:</span>
        <div class="usage-track"><div class="usage-fill ${cor5h}" style="width: ${num5h}%"></div></div>
        <span class="usage-val">${gemini5hStr} rest.</span>
      </div>
      <div class="usage-item" title="Limite Gemini Semanal${resetWeekly ? ` (reseta em ${resetWeekly})` : ''}">
        <span class="usage-label">Gemini Semanal:</span>
        <div class="usage-track"><div class="usage-fill ${corWeekly}" style="width: ${numWeekly}%"></div></div>
        <span class="usage-val">${geminiWeeklyStr} rest.</span>
      </div>
      ${usage.claude_weekly ? `
        <div class="usage-item" title="Limite Claude & GPT Semanal">
          <span class="usage-label">Claude/GPT Semanal:</span>
          <div class="usage-track"><div class="usage-fill verde" style="width: ${parseInt(usage.claude_weekly, 10) || 100}%"></div></div>
          <span class="usage-val">${usage.claude_weekly} rest.</span>
        </div>
      ` : ''}
    </div>
  `;
}

async function fetchUsage() {
  try {
    const data = await request('GET', '/usage');
    if (data && data.gemini_weekly) {
      renderUsage(data);
      return;
    }
  } catch (e) {}
  try {
    if (supabaseClient) {
      const { data } = await supabaseClient
        .from('ops_events')
        .select('*')
        .eq('session_id', 'quota-sync')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length && data[0].tool) {
        renderUsage(JSON.parse(data[0].tool));
        return;
      }
    } else if (SUPABASE_CONFIG.key) {
      const resp = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/ops_events?session_id=eq.quota-sync&select=*&order=created_at.desc&limit=1`, {
        headers: { apikey: SUPABASE_CONFIG.key, Authorization: `Bearer ${SUPABASE_CONFIG.key}` }
      });
      if (resp.ok) {
        const rows = await resp.json();
        if (rows && rows.length && rows[0].tool) {
          renderUsage(JSON.parse(rows[0].tool));
          return;
        }
      }
    }
  } catch {}
  try {
    const resp = await fetch('./data/usage.json');
    if (resp.ok) {
      const cached = await resp.json();
      renderUsage(cached);
    }
  } catch {}
}

async function fetchFromSupabase() {
  const isSecretKey = SUPABASE_CONFIG.key && SUPABASE_CONFIG.key.startsWith('sb_secret_');
  if (isSecretKey) {
    $('#connection').innerHTML = '<span style="color:#f87171;cursor:pointer;font-weight:600;" title="O Supabase bloqueia chaves secretas no navegador. Clique para inserir a chave Anon pública.">🔑 Chave Anon Necessária (Clique)</span>';
    $('#connection').onclick = () => {
      const k = prompt('O Supabase bloqueia chaves secretas (sb_secret_) no navegador por segurança.\n\nCopie a chave ANON pública no painel do Supabase (Project Settings > API > Project API keys > anon public) e cole aqui:');
      if (k && k.trim()) {
        localStorage.setItem('OPS_SUPABASE_KEY', k.trim());
        SUPABASE_CONFIG.key = k.trim();
        supabaseClient = null;
        refresh();
      }
    };
    renderRoom();
    return;
  }

  const events = await getSupabaseEvents();
  if (events && Array.isArray(events) && events.length) {
    dashboard = buildDefaultDashboard(events);
    projects = [{ id: 1, nome: 'FGSOFT Operations Room', caminho_local: 'Global Workspace', arquivado: false }];
    sessions = dashboard.execucoes.filter(e => !e.pai_chave).map(e => ({ session_id: e.session_id, cwd: e.cwd, ultimo_evento: e.estado, ultima_atualizacao: e.atualizado_em, projeto_id: 1, projeto_nome: 'FGSOFT Operations Room' }));
    $('#connection').textContent = 'Ao vivo (Supabase 24/7)';
    $('#connection').onclick = () => {
      const k = prompt('Chave Supabase ativa. Deseja alterar?', SUPABASE_CONFIG.key || '');
      if (k && k.trim()) {
        localStorage.setItem('OPS_SUPABASE_KEY', k.trim());
        SUPABASE_CONFIG.key = k.trim();
        supabaseClient = null;
        refresh();
      }
    };
  } else if (!SUPABASE_CONFIG.key || events === null) {
    $('#connection').innerHTML = '<span style="color:#f59e0b;cursor:pointer" title="Clique para informar a chave anon">⚙️ Conectar Chave Anon</span>';
    $('#connection').onclick = () => {
      const k = prompt('Insira a chave ANON pública do seu Supabase (Project Settings > API > anon public):');
      if (k && k.trim()) {
        localStorage.setItem('OPS_SUPABASE_KEY', k.trim());
        SUPABASE_CONFIG.key = k.trim();
        supabaseClient = null;
        refresh();
      }
    };
  }
  renderRoom();
}

async function refresh() {
  fetchUsage();
  try {
    const isLocalHost = ['localhost', '127.0.0.1', '192.168.15.7'].includes(window.location.hostname);
    if (isLocalHost) {
      try {
        [projects, { sessoes: sessions }, dashboard] = await Promise.all([
          request('GET', '/projetos'),
          request('GET', '/sessoes'),
          request('GET', `/painel?horas=${$('#history-period')?.value || 6}&convivencia=12`)
        ]);
        renderRoom();
        $('#connection').textContent = 'Ao vivo (Netbook Local)';
        return;
      } catch {}
    }
    await fetchFromSupabase();
  } catch (error) {
    console.warn('Refresh error:', error);
    renderRoom();
  }
}

$('#office-room').addEventListener('click', (event) => {
  const person = event.target.closest('.pessoa');
  const run = person && visualRuns.get(person.dataset.id);
  if (run) return selectSession(run.session_id).catch((error) => notice(error.message, true));
  const card = event.target.closest('[data-session]');
  if (card) selectSession(card.dataset.session).catch((error) => notice(error.message, true));
});
$('#office-room').addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const row = event.target.closest('tr[data-session]');
  if (!row) return;
  event.preventDefault();
  selectSession(row.dataset.session).catch((error) => notice(error.message, true));
});
document.querySelector('.alternador').insertAdjacentHTML('afterend', '<label class="trajeto"><input id="show-route" type="checkbox"> Mostrar trajeto</label><label class="periodo">Período do histórico<select id="history-period" aria-label="Período do histórico"><option value="6">últimas 6 h</option><option value="12">últimas 12 h</option><option value="24">últimas 24 h</option></select></label>');
document.querySelectorAll('.alternador .botao-mini').forEach((button) => button.addEventListener('click', () => {
  viewMode = button.dataset.mode;
  document.querySelectorAll('.alternador .botao-mini').forEach((item) => item.classList.toggle('ativo', item === button));
  renderRoom();
}));
$('#history-period').addEventListener('change', refresh);
$('#show-route')?.addEventListener('change', renderRoom);
renderRoom();
refresh();
setInterval(refresh, 4000);
try {
  const evtSource = new EventSource('/api/stream');
  evtSource.onmessage = () => { refresh(); };
} catch {}
