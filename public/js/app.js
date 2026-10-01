const $ = s => document.querySelector(s);
const api = (u, o = {}) => fetch(u, { headers: { 'Content-Type': 'application/json' }, ...o })
  .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Erro'); return r.status === 204 ? null : r.json(); });
let schema, itens = [], sort = { k: 'titulo', d: 1 }, sel = null, modo = 'lista';
const campos = () => schema.grupos.flatMap(g => g.campos);
const COLS = [['titulo','Título'],['tipo','Tipo'],['editora','Editora'],['edicao','Nº'],['ano','Ano'],['roteiro','Roteiro'],['nivel','Nível'],['preco_capa','Preço']];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const brl = n => n == null ? '' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function init() {
  schema = await api('/api/schema');
  await carregar();
  $('#thead').innerHTML = '<tr><th></th>' + COLS.map(([k,l]) => `<th data-k="${k}">${l}<span id="s-${k}"></span></th>`).join('') + '</tr>';
  $('#thead').onclick = e => { const k = e.target.closest('th')?.dataset.k; if (!k) return; sort = { k, d: sort.k === k ? -sort.d : 1 }; render(); };
  ['#q','#fTipo','#fEditora','#fAno','#fCapa'].forEach(s => $(s).oninput = render);
  $('#novo').onclick = () => abrir();
  $('#csv').onclick = exportar;
  $('#impBtn').onclick = abrirImportar;
  $('#modo').onclick = () => { modo = modo === 'lista' ? 'galeria' : 'lista'; $('#modo').textContent = modo === 'lista' ? 'Ver galeria' : 'Ver lista'; render(); };
  $('#gal').onclick = e => { const c = e.target.closest('[data-id]'); if (c) selecionar(+c.dataset.id); };
  document.onkeydown = e => { if (e.key === 'Escape' && sel && !$('#dlg').open) fechar(); };
}

async function carregar() {
  itens = await api('/api/items');
  const opts = (sel, vals, todos) => { const v = $(sel).value; $(sel).innerHTML = `<option value="">${todos}</option>` + vals.map(x => `<option>${esc(x)}</option>`).join(''); $(sel).value = v; };
  opts('#fTipo', schema.tipos, 'Todos os tipos');
  opts('#fEditora', [...new Set(itens.map(i => i.editora).filter(Boolean))].sort(), 'Todas as editoras');
  opts('#fAno', [...new Set(itens.map(i => i.ano).filter(Boolean))].sort((a,b) => b - a), 'Todos os anos');
  const valor = itens.reduce((s, i) => s + (i.preco_capa || 0), 0);
  const eds = new Set(itens.map(i => i.editora).filter(Boolean)).size;
  $('#stats').innerHTML = `<div><b>${itens.length}</b><span>itens</span></div><div><b>${eds}</b><span>editoras</span></div><div><b>${brl(valor)}</b><span>em preço de capa</span></div>`;
  if ($('#thead').innerHTML) render();
  if (sel) mostrarDet();
}

function filtrados() {
  const q = norm($('#q').value), t = $('#fTipo').value, e = $('#fEditora').value, a = $('#fAno').value, cp = $('#fCapa').value;
  return itens.filter(i => (!cp || (cp === 'sem') === !i.capa) && (!t || i.tipo === t) && (!e || i.editora === e) && (!a || String(i.ano) === a) &&
    (!q || norm(Object.values(i).join(' ')).includes(q)))
    .sort((x, y) => {
      const a = x[sort.k], b = y[sort.k];
      if (a == null) return 1; if (b == null) return -1;
      return (typeof a === 'number' ? a - b : String(a).localeCompare(String(b), 'pt-BR', { numeric: true })) * sort.d;
    });
}

function render() {
  const l = filtrados();
  const gal = modo === 'galeria';
  $('#wrap').hidden = gal; $('#gal').hidden = !gal;
  if (gal) {
    $('#gal').innerHTML = l.length ? l.map(i => `<figure class="card${i.id === sel ? ' sel' : ''}" data-id="${i.id}">${i.capa ? `<img loading="lazy" alt="Capa de ${esc(i.titulo)}" src="/capas/${esc(i.capa)}">` : '<div class="ph">Sem capa</div>'}<b>${esc(i.titulo)}</b><small>${esc([i.editora, i.ano, i.edicao && '#' + i.edicao].filter(Boolean).join(' · '))}</small></figure>`).join('') : '<p class="vazio">Nenhum item encontrado.</p>';
    $('#info').textContent = `Mostrando ${l.length} de ${itens.length} itens`; return;
  }
  COLS.forEach(([k]) => $('#s-' + k).textContent = sort.k === k ? (sort.d > 0 ? ' ▲' : ' ▼') : '');
  $('#tbody').innerHTML = l.length ? l.map(i => `<tr data-id="${i.id}"${i.id === sel ? ' class="sel"' : ''}>
    <td>${i.capa ? `<a href="/capas/${esc(i.capa)}" target="_blank"><img class="th" loading="lazy" alt="Capa de ${esc(i.titulo)}" src="/capas/${esc(i.capa)}"></a>` : '<div class="sem"></div>'}</td>
    <td class="t">${esc(i.titulo)}${i.subtitulo ? `<small>${esc(i.subtitulo)}</small>` : ''}</td>
    <td><span class="tag">${esc(i.tipo)}</span></td><td>${esc(i.editora)}</td><td>${esc(i.edicao)}</td><td>${esc(i.ano)}</td>
    <td>${esc(i.roteiro)}</td><td class="st" title="Nível ${i.nivel ?? '-'}">${i.nivel ? '★'.repeat(i.nivel) : ''}</td><td>${brl(i.preco_capa)}</td></tr>`).join('')
    : '<tr><td colspan="9" class="vazio">Nenhum item encontrado. Ajuste a busca ou adicione um novo item.</td></tr>';
  $('#info').textContent = `Mostrando ${l.length} de ${itens.length} itens`;
}

$('#tbody').onclick = e => {
  if (e.target.closest('a')) return;
  const tr = e.target.closest('tr[data-id]'); if (tr) selecionar(+tr.dataset.id);
};

async function excluir(i) {
  if (!confirm(`Excluir "${i.titulo}"? Essa ação não pode ser desfeita.`)) return;
  await api('/api/items/' + i.id, { method: 'DELETE' }); fechar(); carregar();
}
function selecionar(id) { sel = id; mostrarDet(); render(); }
function fechar() { sel = null; $('#layout').classList.remove('aberto'); render(); }

function mostrarDet() {
  const i = itens.find(x => x.id === sel);
  if (!i) return fechar();
  const fmt = (c, v) => c.k === 'preco_capa' ? brl(v) : c.k === 'nivel' ? '★'.repeat(v) + ` (${v})` : c.k === 'data_aquisicao' ? esc(String(v).split('-').reverse().join('/')) : esc(v);
  const grupos = schema.grupos.map(g => {
    const cs = g.campos.filter(c => i[c.k] != null && c.k !== 'titulo' && c.k !== 'subtitulo');
    return cs.length ? `<h3>${g.nome}</h3><dl>${cs.map(c => `<dt>${c.l}</dt><dd>${fmt(c, i[c.k])}</dd>`).join('')}</dl>` : '';
  }).join('');
  $('#det').innerHTML = `<button class="x" id="fechar" aria-label="Fechar detalhes">✕</button>
    ${i.capa ? `<a href="/capas/${esc(i.capa)}" target="_blank"><img class="big" alt="Capa de ${esc(i.titulo)}" src="/capas/${esc(i.capa)}"></a>` : `<div class="big ph">Sem capa. Salve a imagem como id-${i.id}.jpg na pasta importar_capas</div>`}
    <h2>${esc(i.titulo)}</h2>${i.subtitulo ? `<p class="sub">${esc(i.subtitulo)}</p>` : ''}
    <p class="sub">ID <b>${i.id}</b></p>
    <div class="acts"><button id="ed">Editar</button><button class="del" id="ex">Excluir</button></div>${grupos}`;
  $('#fechar').onclick = fechar; $('#ed').onclick = () => abrir(i); $('#ex').onclick = () => excluir(i);
  $('#layout').classList.add('aberto');
}

function abrir(it = null) {
  const v = it || { tipo: schema.tipos[0] };
  const dl = campos().filter(c => c.sug).map(c => `<datalist id="dl-${c.k}">${[...new Set(itens.map(i => i[c.k]).filter(Boolean))].sort().map(x => `<option value="${esc(x)}">`).join('')}</datalist>`).join('');
  const campo = c => {
    const val = esc(v[c.k]);
    let el;
    if (c.t === 'select') el = `<select name="${c.k}">${schema[c.opcoes].map(o => `<option${o === v[c.k] ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (c.t === 'textarea') el = `<textarea name="${c.k}" rows="3">${val}</textarea>`;
    else el = `<input name="${c.k}" type="${c.t}" value="${val}" ${c.req ? 'required' : ''} ${c.sug ? `list="dl-${c.k}"` : ''} ${c.step ? `step="${c.step}"` : ''} ${c.min ? `min="${c.min}" max="${c.max}"` : ''}>`;
    return `<label${c.t === 'textarea' ? ' class="full"' : ''}>${c.l}${el}</label>`;
  };
  let novaCapa = null, tirarCapa = false;
  const capaHtml = `<div class="capa">${it?.capa ? `<img id="prev" alt="Capa" src="/capas/${esc(it.capa)}">` : '<div class="sem" id="prev"></div>'}<div><input type="file" id="arq" accept="image/*"><button type="button" id="rm">Remover capa</button></div></div>`;
  $('#form').innerHTML = `<h2>${it ? 'Editar item' : 'Novo item'}</h2>${capaHtml}${dl}` +
    schema.grupos.map(g => `<fieldset><legend>${g.nome}</legend><div class="g">${g.campos.map(campo).join('')}</div></fieldset>`).join('') +
    `<div class="fim"><span id="msg"></span><button type="button" id="cancelar">Cancelar</button><button class="pri" type="submit">Salvar</button></div>`;
  $('#cancelar').onclick = () => $('#dlg').close();
  const mostrar = url => $('#prev').replaceWith(Object.assign(url ? document.createElement('img') : document.createElement('div'), url ? { src: url, id: 'prev', alt: 'Capa' } : { id: 'prev', className: 'sem' }));
  $('#arq').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { novaCapa = await reduzir(f); tirarCapa = false; mostrar(URL.createObjectURL(novaCapa)); }
    catch { $('#msg').textContent = 'Não foi possível ler essa imagem'; }
  };
  $('#rm').onclick = () => { novaCapa = null; tirarCapa = true; $('#arq').value = ''; mostrar(null); };
  $('#form').onsubmit = async e => {
    e.preventDefault();
    try {
      const dados = Object.fromEntries([...new FormData(e.target)].filter(([k]) => k !== 'arq'));
      const salvo = await api(it ? '/api/items/' + it.id : '/api/items', { method: it ? 'PUT' : 'POST', body: JSON.stringify(dados) });
      if (novaCapa) {
        const r = await fetch(`/api/items/${salvo.id}/capa`, { method: 'POST', headers: { 'Content-Type': novaCapa.type }, body: novaCapa });
        if (!r.ok) throw new Error('Item salvo, mas a capa não foi enviada');
      } else if (tirarCapa && it?.capa) await api(`/api/items/${salvo.id}/capa`, { method: 'DELETE' });
      $('#dlg').close(); carregar();
    } catch (err) { $('#msg').textContent = err.message; }
  };
  $('#dlg').showModal();
}

// Reduz a imagem (máx. 900 px) e converte para JPEG antes de enviar
async function reduzir(file) {
  const bmp = await createImageBitmap(file), s = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
}

function baixar(nome, lin) {
  const csv = lin.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nome; a.click();
}
function exportar() {
  const cs = campos(), lin = [['id', ...cs.map(c => c.l)]];
  filtrados().forEach(i => lin.push([i.id, ...cs.map(c => i[c.k] ?? '')]));
  baixar('biblioteca.csv', lin);
}

// Importação de capas em lote (pasta importar_capas)
async function abrirImportar() {
  const { arquivos } = await api('/api/capas/pendentes');
  const sem = itens.filter(i => !i.capa);
  $('#impc').innerHTML = `<h2>Importar capas</h2>
    <p>1. Coloque as imagens (JPG, PNG ou WebP) na pasta <code>importar_capas</code>.</p>
    <p>2. Nomeie cada arquivo com <code>id-NÚMERO</code> (ex.: <code>id-12.jpg</code>) ou com o título exato da revista.</p>
    <p>3. Clique em Importar agora.</p>
    <p><b>${arquivos.length}</b> imagem(ns) esperando na pasta. <b>${sem.length}</b> item(ns) sem capa.</p>
    <div id="res"></div>
    <div class="fim"><button type="button" id="lista">Baixar lista de itens sem capa (CSV)</button><button type="button" id="fecharImp">Fechar</button><button type="button" class="pri" id="go">Importar agora</button></div>`;
  $('#fecharImp').onclick = () => $('#imp').close();
  $('#lista').onclick = () => baixar('itens_sem_capa.csv', [['id', 'nome do arquivo', 'titulo', 'subtitulo', 'edicao', 'editora', 'ano'],
    ...sem.map(i => [i.id, `id-${i.id}.jpg`, i.titulo, i.subtitulo ?? '', i.edicao ?? '', i.editora ?? '', i.ano ?? ''])]);
  $('#go').onclick = async () => {
    $('#go').disabled = true; $('#go').textContent = 'Importando…';
    try {
      const r = await api('/api/capas/importar', { method: 'POST' });
      $('#res').innerHTML = `<p class="ok"><b>${r.ok.length}</b> capa(s) importada(s).</p>` +
        (r.falhas.length ? `<p class="no"><b>${r.falhas.length}</b> arquivo(s) não importado(s), continuam na pasta:</p><ul>${r.falhas.map(f => `<li>${esc(f.arquivo)}: ${esc(f.motivo)}</li>`).join('')}</ul>` : '');
      carregar();
    } catch (e) { $('#res').innerHTML = `<p class="no">${esc(e.message)}</p>`; }
    $('#go').disabled = false; $('#go').textContent = 'Importar agora';
  };
  $('#imp').showModal();
}

init();
