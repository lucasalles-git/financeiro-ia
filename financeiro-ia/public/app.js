const API = '';
let token = localStorage.getItem('token');
let nomeUsuario = localStorage.getItem('nome');

if (token && nomeUsuario) {
  document.getElementById('tela-auth').classList.remove('active');
  document.getElementById('tela-auth').style.display = 'none';
  document.getElementById('tela-app').style.display = 'block';
  document.getElementById('nome-usuario').textContent = nomeUsuario;
  carregarDados();
}

function mostrarCadastro() {
  document.getElementById('form-login').style.display = 'none';
  document.getElementById('form-cadastro').style.display = 'block';
}

function mostrarLogin() {
  document.getElementById('form-cadastro').style.display = 'none';
  document.getElementById('form-login').style.display = 'block';
}

async function fazerLogin() {
  const email = document.getElementById('login-email').value;
  const senha = document.getElementById('login-senha').value;
  if (!email || !senha) return alert('Preencha email e senha');
  try {
    const res = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    });
    const data = await res.json();
    if (data.erro) return alert(data.erro);
    token = data.token;
    nomeUsuario = data.nome;
    localStorage.setItem('token', token);
    localStorage.setItem('nome', nomeUsuario);
    document.getElementById('tela-auth').style.display = 'none';
    document.getElementById('tela-app').style.display = 'block';
    document.getElementById('nome-usuario').textContent = nomeUsuario;
    carregarDados();
  } catch (e) {
    alert('Erro ao conectar. Verifique se o servidor está rodando.');
  }
}

async function fazerCadastro() {
  const nome = document.getElementById('cad-nome').value;
  const email = document.getElementById('cad-email').value;
  const senha = document.getElementById('cad-senha').value;
  if (!nome || !email || !senha) return alert('Preencha todos os campos');
  try {
    const res = await fetch(`${API}/api/registrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, senha }),
    });
    const data = await res.json();
    if (data.erro) return alert(data.erro);
    token = data.token;
    nomeUsuario = data.nome;
    localStorage.setItem('token', token);
    localStorage.setItem('nome', nomeUsuario);
    document.getElementById('tela-auth').style.display = 'none';
    document.getElementById('tela-app').style.display = 'block';
    document.getElementById('nome-usuario').textContent = nomeUsuario;
    carregarDados();
  } catch (e) {
    alert('Erro ao conectar.');
  }
}

function sair() {
  localStorage.removeItem('token');
  localStorage.removeItem('nome');
  location.reload();
}

function headers() {
  return { 'Content-Type': 'application/json', 'Authorization': token };
}

function mudarTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
}

async function carregarResumo() {
  try {
    const res = await fetch(`${API}/api/resumo`, { headers: headers() });
    const data = await res.json();
    document.getElementById('resumo-receitas').textContent = `R$ ${Number(data.receitas).toFixed(2)}`;
    document.getElementById('resumo-despesas').textContent = `R$ ${Number(data.despesas).toFixed(2)}`;
    document.getElementById('resumo-saldo').textContent = `R$ ${Number(data.saldo).toFixed(2)}`;
    const grafico = document.getElementById('grafico-categorias');
    grafico.innerHTML = '';
    if (data.gastos_por_categoria.length === 0) {
      grafico.innerHTML = '<p style="color:var(--text-muted);padding:20px">Nenhum gasto registrado este mês. Adicione seus gastos na aba "Gastos".</p>';
      return;
    }
    const totalGastos = data.gastos_por_categoria.reduce((s, g) => s + Number(g.total), 0);
    const cores = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3', '#e84393', '#00cec9', '#fab1a0', '#636e72'];
    data.gastos_por_categoria.forEach((g, i) => {
      const pct = (Number(g.total) / totalGastos * 100).toFixed(1);
      const div = document.createElement('div');
      div.className = 'barra-item';
      div.innerHTML = `<span class="barra-label">${g.categoria}</span><div class="barra-container"><div class="barra-preenchimento" style="width:${Math.max(pct, 5)}%;background:${cores[i % cores.length]}">R$ ${Number(g.total).toFixed(2)} (${pct}%)</div></div>`;
      grafico.appendChild(div);
    });
  } catch (e) {
    console.error('Erro ao carregar resumo:', e);
  }
}

async function carregarTransacoes() {
  try {
    const res = await fetch(`${API}/api/transacoes`, { headers: headers() });
    const transacoes = await res.json();
    const lista = document.getElementById('lista-transacoes');
    lista.innerHTML = '';
    if (transacoes.length === 0) {
      lista.innerHTML = '<p style="color:var(--text-muted);padding:20px;text-align:center">Nenhuma transação neste mês.</p>';
      return;
    }
    transacoes.forEach(t => {
      const div = document.createElement('div');
      div.className = 'item-lista';
      div.innerHTML = `<div class="item-info"><span class="item-descricao">${t.descricao}</span><span class="item-categoria">${t.categoria} • ${new Date(t.data).toLocaleDateString('pt-BR')}</span></div><div class="item-acoes"><span class="item-valor ${t.tipo}">${t.tipo === 'receita' ? '+' : '-'} R$ ${Number(t.valor).toFixed(2)}</span><button class="btn-danger" onclick="removerTransacao('${t.id}')">✕</button></div>`;
      lista.appendChild(div);
    });
  } catch (e) {
    console.error(e);
  }
}

async function adicionarTransacao() {
  const descricao = document.getElementById('input-descricao').value;
  const valor = document.getElementById('input-valor').value;
  const tipo = document.getElementById('input-tipo').value;
  let categoria = document.getElementById('input-categoria').value;
  if (!descricao || !valor) return alert('Preencha descrição e valor');
  if (!categoria && tipo === 'despesa') {
    try {
      const res = await fetch(`${API}/api/ia/categorizar`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ descricao }),
      });
      const data = await res.json();
      categoria = data.categoria || 'Outros';
    } catch {
      categoria = 'Outros';
    }
  } else if (!categoria) {
    categoria = 'Outros';
  }
  try {
    await fetch(`${API}/api/transacoes`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ descricao, valor, categoria, tipo }),
    });
    document.getElementById('input-descricao').value = '';
    document.getElementById('input-valor').value = '';
    document.getElementById('input-categoria').value = '';
    carregarTransacoes();
    carregarResumo();
  } catch (e) {
    alert('Erro ao adicionar');
  }
}

async function removerTransacao(id) {
  await fetch(`${API}/api/transacoes/${id}`, { method: 'DELETE', headers: headers() });
  carregarTransacoes();
  carregarResumo();
}

let timeoutCategoria;
function categorizarAutomatico(valor) {
  clearTimeout(timeoutCategoria);
  if (!valor || valor.length < 3) return;
  timeoutCategoria = setTimeout(async () => {
    try {
      const res = await fetch(`${API}/api/ia/categorizar`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ descricao: valor }),
      });
      const data = await res.json();
      if (data.categoria) document.getElementById('input-categoria').value = data.categoria;
    } catch {}
  }, 800);
}

async function carregarAssinaturas() {
  try {
    const res = await fetch(`${API}/api/assinaturas`, { headers: headers() });
    const assinaturas = await res.json();
    const lista = document.getElementById('lista-assinaturas');
    lista.innerHTML = '';
    let total = 0;
    if (assinaturas.length === 0) {
      lista.innerHTML = '<p style="color:var(--text-muted);padding:20px;text-align:center">Nenhuma assinatura cadastrada.</p>';
      document.getElementById('total-assinaturas').textContent = 'R$ 0,00';
      return;
    }
    assinaturas.forEach(a => {
      total += Number(a.valor);
      const div = document.createElement('div');
      div.className = 'item-lista';
      div.innerHTML = `<div class="item-info"><span class="item-descricao">${a.nome}</span><span class="item-categoria">Vence dia ${a.vencimento_dia} • ${a.categoria}</span></div><div class="item-acoes"><span class="item-valor despesa">R$ ${Number(a.valor).toFixed(2)}</span><button class="btn-danger" onclick="removerAssinatura('${a.id}')">✕</button></div>`;
      lista.appendChild(div);
    });
    document.getElementById('total-assinaturas').textContent = `R$ ${total.toFixed(2)}`;
  } catch (e) {
    console.error(e);
  }
}

async function adicionarAssinatura() {
  const nome = document.getElementById('assinatura-nome').value;
  const valor = document.getElementById('assinatura-valor').value;
  const dia = document.getElementById('assinatura-dia').value;
  if (!nome || !valor || !dia) return alert('Preencha todos os campos');
  await fetch(`${API}/api/assinaturas`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ nome, valor, vencimento_dia: parseInt(dia) }),
  });
  document.getElementById('assinatura-nome').value = '';
  document.getElementById('assinatura-valor').value = '';
  document.getElementById('assinatura-dia').value = '';
  carregarAssinaturas();
  carregarResumo();
}

async function removerAssinatura(id) {
  await fetch(`${API}/api/assinaturas/${id}`, { method: 'DELETE', headers: headers() });
  carregarAssinaturas();
  carregarResumo();
}

async function carregarMetas() {
  try {
    const res = await fetch(`${API}/api/metas`, { headers: headers() });
    const metas = await res.json();
    const lista = document.getElementById('lista-metas');
    lista.innerHTML = '';
    if (metas.length === 0) {
      lista.innerHTML = '<p style="color:var(--text-muted);padding:20px;text-align:center">Nenhuma meta criada ainda.</p>';
      return;
    }
    metas.forEach(m => {
      const pct = Math.min(Number(m.valor_atual) / Number(m.valor_meta) * 100, 100).toFixed(1);
      const div = document.createElement('div');
      div.className = 'item-lista';
      div.innerHTML = `<div class="item-info"><span class="item-descricao">${m.nome}</span><span class="item-categoria">R$ ${Number(m.valor_atual).toFixed(2)} de R$ ${Number(m.valor_meta).toFixed(2)} ${m.prazo ? `• até ${new Date(m.prazo).toLocaleDateString('pt-BR')}` : ''}</span></div><div class="item-acoes"><div class="meta-progresso"><div class="meta-progresso-preenchimento" style="width:${pct}%"></div></div><span style="font-size:0.85em;min-width:45px;text-align:right">${pct}%</span></div>`;
      lista.appendChild(div);
    });
  } catch (e) {
    console.error(e);
  }
}

async function adicionarMeta() {
  const nome = document.getElementById('meta-nome').value;
  const valor = document.getElementById('meta-valor').value;
  const prazo = document.getElementById('meta-prazo').value;
  if (!nome || !valor) return alert('Preencha nome e valor da meta');
  await fetch(`${API}/api/metas`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ nome, valor_meta: valor, prazo: prazo || null }),
  });
  document.getElementById('meta-nome').value = '';
  document.getElementById('meta-valor').value = '';
  document.getElementById('meta-prazo').value = '';
  carregarMetas();
}

async function perguntarIA() {
  const input = document.getElementById('input-pergunta');
  const pergunta = input.value.trim();
  if (!pergunta) return;
  const chat = document.getElementById('chat-mensagens');
  const msgUser = document.createElement('div');
  msgUser.className = 'msg usuario';
  msgUser.innerHTML = `<p>${pergunta}</p>`;
  chat.appendChild(msgUser);
  chat.scrollTop = chat.scrollHeight;
  input.value = '';
  const msgLoading = document.createElement('div');
  msgLoading.className = 'msg ia';
  msgLoading.id = 'msg-loading';
  msgLoading.innerHTML = '<strong>🤖 Consultor:</strong><p>Analisando suas finanças...</p>';
  chat.appendChild(msgLoading);
  chat.scrollTop = chat.scrollHeight;
  try {
    const res = await fetch(`${API}/api/ia/perguntar`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ pergunta }),
    });
    const data = await res.json();
    document.getElementById('msg-loading')?.remove();
    if (data.erro) {
      const msgErro = document.createElement('div');
      msgErro.className = 'msg ia';
      msgErro.innerHTML = `<strong>🤖 Consultor:</strong><p>${data.erro}</p>`;
      chat.appendChild(msgErro);
    } else {
      const msgIa = document.createElement('div');
      msgIa.className = 'msg ia';
      msgIa.innerHTML = `<strong>🤖 Consultor:</strong><p>${data.resposta.replace(/\n/g, '<br>')}</p>`;
      chat.appendChild(msgIa);
    }
    chat.scrollTop = chat.scrollHeight;
  } catch (e) {
    document.getElementById('msg-loading')?.remove();
    const msgErro = document.createElement('div');
    msgErro.className = 'msg ia';
    msgErro.innerHTML = '<strong>🤖 Consultor:</strong><p>Erro de conexão. Verifique se a chave da API está configurada.</p>';
    chat.appendChild(msgErro);
  }
}

function carregarDados() {
  carregarResumo();
  carregarTransacoes();
  carregarAssinaturas();
  carregarMetas();
}