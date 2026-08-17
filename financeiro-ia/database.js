const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'financeiro.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transacoes (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL,
    categoria TEXT DEFAULT 'Outros',
    tipo TEXT DEFAULT 'despesa',
    data TEXT DEFAULT (date('now')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS assinaturas (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    valor REAL NOT NULL,
    vencimento_dia INTEGER NOT NULL,
    categoria TEXT DEFAULT 'Assinatura',
    ativa INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS metas (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    valor_meta REAL NOT NULL,
    valor_atual REAL DEFAULT 0,
    prazo TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
`);

module.exports = db;