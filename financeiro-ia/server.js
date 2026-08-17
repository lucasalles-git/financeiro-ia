require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const OpenAI = require('openai');
const db = require('./database');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

function hashSenha(senha) {
  return crypto.createHash('sha256').update(senha + 'sal-' + process.env.SESSION_SECRET).digest('hex');
}

// ============ CADASTRO ============
app.post('/api/registrar', (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Campos obrigatórios: nome, email, senha' });
  try {
    const id = uuidv4();
    const senha_hash = hashSenha(senha);
    db.prepare('INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (?, ?, ?, ?)').run(id, nome, email, senha_hash);
    res.json({ id, nome, email, token: id });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ erro: 'Email já cadastrado' });
    res.status(500).json({ erro: 'Erro ao cadastrar' });
  }
});

// ============ LOGIN ============
app.post('/api/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Email e senha obrigatórios' });
  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!usuario || usuario.senha_hash !== hashSenha(senha)) {
    return res.status(401).json({ erro: 'Email ou senha inválidos' });
  }
  res.json({ id: usuario.id, nome: usuario.nome, email: usuario.email, token: usuario.id });
});

// ============ AUTENTICAÇÃO ============
function autenticar(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ erro: 'Token necessário' });
  const usuario = db.prepare('SELECT id, nome, email FROM usuarios WHERE id = ?').get(token);
  if (!usuario) return res.status(401).json({ erro: 'Token inválido' });
  req.usuario = usuario;
  next();
}

// ============ TRANSAÇÕES ============
app.get('/api/transacoes', autenticar, (req, res) => {
  const { mes, ano } = req.query;
  const data = new Date();
  const m = mes || String(data.getMonth() + 1).padStart(2, '0');
  const a = ano || data.getFullYear();
  const transacoes = db.prepare(`SELECT * FROM transacoes WHERE usuario_id = ? AND strftime('%m', data) = ? AND strftime('%Y', data) = ? ORDER BY data DESC`).all(req.usuario.id, String(m).padStart(2, '0'), String(a));
  res.json(transacoes);
});

app.post('/api/transacoes', autenticar, (req, res) => {
  const { descricao, valor, categoria, tipo, data } = req.body;
  if (!descricao || !valor) return res.status(400).json({ erro: 'Descrição e valor obrigatórios' });
  const id = uuidv4();
  db.prepare(`INSERT INTO transacoes (id, usuario_id, descricao, valor, categoria, tipo, data) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, req.usuario.id, descricao, Number(valor), categoria || 'Outros', tipo || 'despesa', data || new Date().toISOString().split('T')[0]);
  res.json({ id, mensagem: 'Transação adicionada' });
});

app.delete('/api/transacoes/:id', autenticar, (req, res) => {
  db.prepare('DELETE FROM transacoes WHERE id = ? AND usuario_id = ?').run(req.params.id, req.usuario.id);
  res.json({ mensagem: 'Transação removida' });
});

// ============ ASSINATURAS ============
app.get('/api/assinaturas', autenticar, (req, res) => {
  const assinaturas = db.prepare('SELECT * FROM assinaturas WHERE usuario_id = ? AND ativa = 1').all(req.usuario.id);
  res.json(assinaturas);
});

app.post('/api/assinaturas', autenticar, (req, res) => {
  const { nome, valor, vencimento_dia, categoria } = req.body;
  if (!nome || !valor || !vencimento_dia) return res.status(400).json({ erro: 'Nome, valor e dia de vencimento obrigatórios' });
  const id = uuidv4();
  db.prepare(`INSERT INTO assinaturas (id, usuario_id, nome, valor, vencimento_dia, categoria) VALUES (?, ?, ?, ?, ?, ?)`).run(id, req.usuario.id, nome, Number(valor), Number(vencimento_dia), categoria || 'Assinatura');
  res.json({ id, mensagem: 'Assinatura cadastrada' });
});

app.delete('/api/assinaturas/:id', autenticar, (req, res) => {
  db.prepare('UPDATE assinaturas SET ativa = 0 WHERE id = ? AND usuario_id = ?').run(req.params.id, req.usuario.id);
  res.json({ mensagem: 'Assinatura removida' });
});

// ============ METAS ============
app.get('/api/metas', autenticar, (req, res) => {
  const metas = db.prepare('SELECT * FROM metas WHERE usuario_id = ?').all(req.usuario.id);
  res.json(metas);
});

app.post('/api/metas', autenticar, (req, res) => {
  const { nome, valor_meta, prazo } = req.body;
  if (!nome || !valor_meta) return res.status(400).json({ erro: 'Nome e valor da meta obrigatórios' });
  const id = uuidv4();
  db.prepare(`INSERT INTO metas (id, usuario_id, nome, valor_meta, prazo) VALUES (?, ?, ?, ?, ?)`).run(id, req.usuario.id, nome, Number(valor_meta), prazo || null);
  res.json({ id, mensagem: 'Meta criada' });
});

app.put('/api/metas/:id/progresso', autenticar, (req, res) => {
  const { valor_atual } = req.body;
  db.prepare('UPDATE metas SET valor_atual = ? WHERE id = ? AND usuario_id = ?').run(Number(valor_atual), req.params.id, req.usuario.id);
  res.json({ mensagem: 'Progresso atualizado' });
});

// ============ RESUMO / DASHBOARD ============
app.get('/api/resumo', autenticar, (req, res) => {
  const data = new Date();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  const totalDespesas = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM transacoes WHERE usuario_id = ? AND tipo = 'despesa' AND strftime('%m', data) = ? AND strftime('%Y', data) = ?`).get(req.usuario.id, mes, String(ano));
  const totalReceitas = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM transacoes WHERE usuario_id = ? AND tipo = 'receita' AND strftime('%m', data) = ? AND strftime('%Y', data) = ?`).get(req.usuario.id, mes, String(ano));
  const gastosCategoria = db.prepare(`SELECT categoria, SUM(valor) as total FROM transacoes WHERE usuario_id = ? AND tipo = 'despesa' AND strftime('%m', data) = ? AND strftime('%Y', data) = ? GROUP BY categoria ORDER BY total DESC`).all(req.usuario.id, mes, String(ano));
  const assinaturas = db.prepare('SELECT * FROM assinaturas WHERE usuario_id = ? AND ativa = 1').all(req.usuario.id);
  const totalAssinaturas = assinaturas.reduce((s, a) => s + a.valor, 0);
  const metas = db.prepare('SELECT * FROM metas WHERE usuario_id = ?').all(req.usuario.id);
  res.json({
    totalDespesas: totalDespesas.total || 0,
    totalReceitas: totalReceitas.total || 0,
    saldo: (totalReceitas.total || 0) - (totalDespesas.total || 0),
    gastosCategoria,
    assinaturas,
    totalAssinaturas,
    metas
  });
});

// ============ IA (GROQ) ============
app.post('/api/ia/perguntar', autenticar, async (req, res) => {
  const { pergunta } = req.body;
  if (!pergunta) return res.status(400).json({ erro: 'Pergunta obrigatória' });
  try {
    const transacoes = db.prepare(`SELECT descricao, valor, categoria, tipo, data FROM transacoes WHERE usuario_id = ? ORDER BY data DESC LIMIT 30`).all(req.usuario.id);
    const assinaturas = db.prepare(`SELECT nome, valor, vencimento_dia FROM assinaturas WHERE usuario_id = ? AND ativa = 1`).all(req.usuario.id);
    const contextoFinanceiro = `Dados financeiros do usuário:\n${transacoes.length > 0 ? 'Últimas transações:\n' + JSON.stringify(transacoes, null, 2) : 'Nenhuma transação registrada.'}${assinaturas.length > 0 ? '\nAssinaturas ativas:\n' + JSON.stringify(assinaturas, null, 2) : '\nNenhuma assinatura.'}`;
    const response = await openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Você é um consultor financeiro pessoal amigável e prático. Use os dados do usuário para dar conselhos específicos e acionáveis. Seja direto, use linguagem simples e, quando possível, dê números e prazos.' },
        { role: 'user', content: `${contextoFinanceiro}\n\nPergunta do usuário: ${pergunta}` }
      ],
      max_tokens: 600,
    });
    res.json({ resposta: response.choices[0].message.content });
  } catch (err) {
    console.error('ERRO IA perguntar:', err.message);
    res.status(500).json({ erro: 'Erro ao consultar IA. Verifique sua chave API.' });
  }
});

app.post('/api/ia/categorizar', autenticar, async (req, res) => {
  const { descricao } = req.body;
  if (!descricao) return res.status(400).json({ erro: 'Descrição obrigatória' });
  try {
    const response = await openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Você categoriza gastos pessoais. Responda APENAS com o nome da categoria em português. Categorias possíveis: Alimentação, Transporte, Moradia, Saúde, Educação, Lazer, Assinaturas, Compras, Serviços, Outros.' },
        { role: 'user', content: descricao }
      ],
      max_tokens: 20,
    });
    res.json({ categoria: response.choices[0].message.content.trim() });
  } catch (err) {
    console.error('ERRO IA categorizar:', err.message);
    res.json({ categoria: 'Outros' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 App rodando em http://localhost:${PORT}`);
});
