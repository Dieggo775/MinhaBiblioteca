// Backend da Biblioteca Física — Express + repositório de arquivo JSON.
// Etapa 2: troque apenas o objeto `repo` por uma versão que fale com o banco.
const express = require('express');
const fs = require('fs');
const path = require('path');

const schema = require('./schema.json');
const CAMPOS = schema.grupos.flatMap(g => g.campos);
const FILE = path.join(__dirname, 'data', 'items.json');
const CAPAS = path.join(__dirname, 'data', 'capas');
fs.mkdirSync(CAPAS, { recursive: true });
const INBOX = path.join(__dirname, 'importar_capas');
const FEITAS = path.join(INBOX, '_processadas');
fs.mkdirSync(FEITAS, { recursive: true });
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const apagarCapa = it => { if (it && it.capa) fs.rmSync(path.join(CAPAS, it.capa), { force: true }); };

const repo = {
  _items: JSON.parse(fs.readFileSync(FILE, 'utf8')),
  _save() {
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(this._items, null, 1));
    fs.renameSync(FILE + '.tmp', FILE);
  },
  all: () => repo._items,
  get: id => repo._items.find(i => i.id === id),
  create(d) {
    d.id = Math.max(0, ...this._items.map(i => i.id)) + 1;
    this._items.push(d); this._save(); return d;
  },
  update(id, d) {
    const i = this._items.findIndex(x => x.id === id);
    if (i < 0) return null;
    this._items[i] = { ...d, id, capa: this._items[i].capa ?? null }; this._save(); return this._items[i];
  },
  setCapa(id, nome) { const it = this.get(id); it.capa = nome; this._save(); return it; },
  remove(id) {
    const n = this._items.length;
    apagarCapa(this.get(id));
    this._items = this._items.filter(i => i.id !== id);
    this._save(); return n !== this._items.length;
  }
};

// Limpa e valida o corpo da requisição conforme o schema.
function limpar(body) {
  const out = {};
  for (const c of CAMPOS) {
    let v = body[c.k];
    if (typeof v === 'string') v = v.replace(/\s+/g, ' ').trim();
    if (v === '' || v === undefined || v === null) { out[c.k] = null; continue; }
    if (c.t === 'number') { v = Number(v); if (Number.isNaN(v)) return { erro: `${c.l} inválido` }; }
    out[c.k] = v;
  }
  if (!out.titulo) return { erro: 'Título é obrigatório' };
  if (out.nivel != null && (out.nivel < 1 || out.nivel > 5)) return { erro: 'Nível deve ser de 1 a 5' };
  return { dados: out };
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/capas', express.static(CAPAS));

app.get('/api/schema', (_, res) => res.json(schema));
app.get('/api/items', (_, res) => res.json(repo.all()));
app.get('/api/items/:id', (req, res) => {
  const it = repo.get(+req.params.id);
  it ? res.json(it) : res.status(404).json({ erro: 'Não encontrado' });
});
app.post('/api/items', (req, res) => {
  const { erro, dados } = limpar(req.body);
  erro ? res.status(400).json({ erro }) : res.status(201).json(repo.create(dados));
});
app.put('/api/items/:id', (req, res) => {
  const { erro, dados } = limpar(req.body);
  if (erro) return res.status(400).json({ erro });
  const it = repo.update(+req.params.id, dados);
  it ? res.json(it) : res.status(404).json({ erro: 'Não encontrado' });
});
app.delete('/api/items/:id', (req, res) =>
  repo.remove(+req.params.id) ? res.status(204).end() : res.status(404).json({ erro: 'Não encontrado' }));

// Capas: o corpo da requisição é a própria imagem (jpeg, png ou webp, até 10 MB)
app.post('/api/items/:id/capa', express.raw({ type: Object.keys(EXT), limit: '10mb' }), (req, res) => {
  const it = repo.get(+req.params.id);
  if (!it) return res.status(404).json({ erro: 'Não encontrado' });
  const ext = EXT[req.headers['content-type']];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length)
    return res.status(400).json({ erro: 'Envie uma imagem JPEG, PNG ou WebP' });
  const nome = `${it.id}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(CAPAS, nome), req.body);
  apagarCapa(it);
  res.json(repo.setCapa(it.id, nome));
});
app.delete('/api/items/:id/capa', (req, res) => {
  const it = repo.get(+req.params.id);
  if (!it) return res.status(404).json({ erro: 'Não encontrado' });
  apagarCapa(it); res.json(repo.setCapa(it.id, null));
});

// ---- Importação em lote: imagens soltas na pasta importar_capas/ ----
const chave = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const listarInbox = () => fs.readdirSync(INBOX, { withFileTypes: true })
  .filter(d => d.isFile() && /\.(jpe?g|png|webp)$/i.test(d.name)).map(d => d.name);

function montarMapa() {
  const mapa = new Map();
  for (const i of repo.all())
    for (const partes of [[i.titulo], [i.titulo, i.subtitulo], [i.titulo, i.edicao], [i.titulo, i.subtitulo, i.edicao], [i.isbn]]) {
      const k = chave(partes.filter(Boolean).join(' '));
      if (k) (mapa.get(k) || mapa.set(k, new Set()).get(k)).add(i.id);
    }
  return mapa;
}
// Regras: "id-12 qualquer coisa.jpg" → item 12; senão compara o nome com título, título + edição, título + subtítulo ou ISBN.
function achar(nome, mapa) {
  const base = nome.replace(/\.[^.]+$/, ''), m = base.match(/^id[\s_-]*(\d+)(?!\d)/i);
  if (m) { const it = repo.get(+m[1]); return it ? { it } : { erro: `O ID ${m[1]} não existe` }; }
  const ids = mapa.get(chave(base));
  if (!ids) return { erro: 'Nenhum item com esse nome. Renomeie para id-NÚMERO (veja a lista de itens)' };
  if (ids.size > 1) return { erro: `Nome serve para vários itens (IDs ${[...ids].join(', ')}). Renomeie para id-NÚMERO` };
  return { it: repo.get([...ids][0]) };
}
async function otimizar(buf) { // reduz para 900 px se o módulo sharp estiver instalado
  try { return await require('sharp')(buf).rotate().resize(900, 900, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(); }
  catch { return null; }
}
app.get('/api/capas/pendentes', (_, res) => res.json({ arquivos: listarInbox() }));
app.post('/api/capas/importar', async (_, res) => {
  const mapa = montarMapa(), ok = [], falhas = [];
  for (const nome of listarInbox()) {
    const { it, erro } = achar(nome, mapa);
    if (erro) { falhas.push({ arquivo: nome, motivo: erro }); continue; }
    try {
      const orig = fs.readFileSync(path.join(INBOX, nome));
      let buf = await otimizar(orig), ext = 'jpg';
      if (!buf) { // sem o sharp: só aceita se o conteúdo for mesmo JPEG, PNG ou WebP
        const h = orig.subarray(0, 12), jpg = h[0] === 0xff && h[1] === 0xd8, png = h.toString('latin1', 1, 4) === 'PNG', webp = h.toString('latin1', 0, 4) === 'RIFF' && h.toString('latin1', 8, 12) === 'WEBP';
        if (!(jpg || png || webp)) throw new Error('não é imagem');
        buf = orig; ext = jpg ? 'jpg' : png ? 'png' : 'webp';
      }
      const novo = `${it.id}-${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(CAPAS, novo), buf);
      apagarCapa(it); repo.setCapa(it.id, novo);
      fs.renameSync(path.join(INBOX, nome), path.join(FEITAS, `${Date.now()}-${nome}`)); // guarda o original
      ok.push({ arquivo: nome, id: it.id, titulo: it.titulo });
    } catch { falhas.push({ arquivo: nome, motivo: 'Não foi possível ler essa imagem' }); }
  }
  res.json({ ok, falhas });
});

// Resumo para o painel
app.get('/api/stats', (_, res) => {
  const it = repo.all(), cont = k => it.reduce((a, x) => (x[k] && (a[x[k]] = (a[x[k]] || 0) + 1), a), {});
  res.json({
    total: it.length,
    valor: +it.reduce((s, x) => s + (x.preco_capa || 0), 0).toFixed(2),
    porTipo: cont('tipo'), porEditora: cont('editora'), porDecada: it.reduce((a, x) => {
      if (x.ano) { const d = Math.floor(x.ano / 10) * 10 + 's'; a[d] = (a[d] || 0) + 1; } return a; }, {})
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Biblioteca em http://localhost:${PORT}`));
