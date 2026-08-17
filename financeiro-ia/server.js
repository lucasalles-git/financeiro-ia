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

// ============ AUTENTICAÇÃO ============
function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ erro: 'Não autenticado' });
  const usuario = db.prepare('SELECT id, nome, email FROM usuarios WHERE token = ?').get(token);
  if (!usuario) return res.status(401).json({ erro: 'Sessão inválida' });
  req.usuario = usuario;
  next();
}

// ============ ROTAS DE AUTENTICAÇÃO ============
app.post('/api/auth/cadastro', (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (existe) return res.status(400).json({ erro: 'Email já cadastrado' });
  const id = uuidv4();
  const token = uuidv4();
  db.prepare('INSERT INTO usuarios (id, nome, email, senha, token) VALUES (?, ?, ?, ?, ?)')
    .run(id, nome, email, hashSenha(senha), token);
  res.json({ token, usuario: { id, nome, email } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!usuario || usuario.senha !== hashSenha(senha)) return res.status(401).json({ erro: 'Email ou senha incorretos' });
  const token = uuidv4();
  db.prepare('UPDATE usuarios SET token = ? WHERE id = ?').run(token, usuario.id);
  res.json({ token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
});

// ============ TRANSAÇÕES ============
app.get('/api/transacoes', autenticar, (req, res) => {
  const transacoes = db.prepare('SELECT * FROM transacoes WHERE usuario_id = ? ORDER BY data DESC').all(req.usuario.id);
  res.json(transacoes);
});

app.post('/api/transacoes', autenticar, (req, res) => {
  const { descricao, valor, tipo, categoria } = req.body;
  if (!descricao || !valor || !tipo) return res.status(400).json({ erro: 'Preencha descrição, valor e tipo' });
  const id = uuidv4();
  const data = new Date().toISOString().split('T')[0];
  db.prepare('INSERT INTO transacoes (id, usuario_id, descricao, valor, tipo, categoria, data) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.usuario.id, descricao, valor, tipo, categoria || 'Outros', data);
  res.json({ id, descricao, valor, tipo, categoria: categoria || 'Outros', data });
});

app.delete('/api/transacoes/:id', autenticar, (req, res) => {
  db.prepare('DELETE FROM transacoes WHERE id = ? AND usuario_id = ?').run(req.params.id, req.usuario.id);
  res.json({ ok: true });
});

// ============ ASSINATURAS ============
app.get('/api/assinaturas', autenticar, (req, res) => {
  const assinaturas = db.prepare('SELECT * FROM assinaturas WHERE usuario_id = ? AND ativa = 1').all(req.usuario.id);
  res.json(assinaturas);
});

app.post('/api/assinaturas', autenticar, (req, res) => {
  const { nome, valor, vencimento_dia } = req.body;
  if (!nome || !valor) return res.status(400).json({ erro: 'Preencha nome e valor' });
  const id = uuidv4();
  db.prepare('INSERT INTO assinaturas (id, usuario_id, nome, valor, vencimento_dia, ativa) VALUES (?, ?, ?, ?, ?, 1)')
    .run(id, req.usuario.id, nome, valor, vencimento_dia || 1);
  res.json({ id, nome, valor, vencimento_dia: vencimento_dia || 1 });
});

app.delete('/api/assinaturas/:id', autenticar, (req, res) => {
  db.prepare('UPDATE assinaturas SET ativa = 0 WHERE id = ? AND usuario_id = ?').run(req.params.id, req.usuario.id);
  res.json({ ok: true });
});

// ============ METAS ============
app.get('/api/metas', autenticar, (req, res) => {
  const metas = db.prepare('SELECT * FROM metas WHERE usuario_id = ?').all(req.usuario.id);
  res.json(metas);
});

app.post('/api/metas', autenticar, (req, res) => {
  const { nome, valor, prazo } = req.body;
  if (!nome || !valor) return res.status(400).json({ erro: 'Preencha nome e valor' });
  const id = uuidv4();
  db.prepare('INSERT INTO metas (id, usuario_id, nome, valor, prazo, salvo) VALUES (?, ?, ?, ?, ?, 0)')
    .run(id, req.usuario.id, nome, valor, prazo || null);
  res.json({ id, nome, valor, prazo: prazo || null });
});

app.put('/api/metas/:id/salvar', autenticar, (req, res) => {
  const { valor } = req.body;
  db.prepare('UPDATE metas SET salvo = salvo + ? WHERE id = ? AND usuario_id = ?').run(valor || 0, req.params.id, req.usuario.id);
  res.json({ ok: true });
});

app.delete('/api/metas/:id', autenticar, (req, res) => {
  db.prepare('DELETE FROM metas WHERE id = ? AND usuario_id = ?').run(req.params.id, req.usuario.id);
  res.json({ ok: true });
});

// ============ DASHBOARD ============
app.get('/api/dashboard', autenticar, (req, res) => {
  const receitas = db.prepare('SELECT COALESCE(SUM(valor), 0) as total FROM transacoes WHERE usuario_id = ? AND tipo = "receita"').get(req.usuario.id).total;
  const despesas = db.prepare('SELECT COALESCE(SUM(valor), 0) as total FROM transacoes WHERE usuario_id = ? AND tipo = "despesa"').get(req.usuario.id).total;
  const saldo = receitas - despesas;
  const porCategoria = db.prepare('SELECT categoria, SUM(valor) as total FROM transacoes WHERE usuario_id = ? AND tipo = "despesa" GROUP BY categoria ORDER BY total DESC').all(req.usuario.id);
  res.json({ receitas, despesas, saldo, porCategoria });
});

// ============ IA (GROQ) ============
app.post('/api/ia/perguntar', autenticar, async (req, res) => {
  const { pergunta } = req.body;
  if (!pergunta) return res.status(400).json({ erro: 'Pergunta obrigatória' });
  try {
    const transacoes = db.prepare('SELECT descricao, valor, categoria, tipo, data FROM transacoes WHERE usuario_id = ? ORDER BY data DESC LIMIT 30').all(req.usuario.id);
    const assinaturas = db.prepare('SELECT nome, valor, vencimento_dia FROM assinaturas WHERE usuario_id = ? AND ativa = 1').all(req.usuario.id);
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
    res.json({ categoria: 'Outros' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 App rodando em http://localhost:${PORT}`);
});
