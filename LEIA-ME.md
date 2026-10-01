# Minha Biblioteca — Etapa 1 (front + back)

## Como rodar
1. Instale o Node.js (versão 18 ou mais nova): https://nodejs.org
2. Nesta pasta, rode: `npm install` e depois `npm start`
3. Abra http://localhost:3000

## Estrutura
- `server.js`  → API REST (GET/POST/PUT/DELETE em `/api/items`, `/api/stats`) e validação
- `schema.json` → **lista de campos**. Para incluir um dado novo, adicione uma linha aqui:
  ele aparece sozinho no formulário e no CSV (para aparecer na tabela, inclua em `COLS` no `index.html`)
- `public/index.html` → interface (busca, filtros, ordenação, cadastro/edição, exportar CSV)
- `data/items.json` → seus 261 itens da planilha (tudo salvo aqui por enquanto)
- `data/capas/` → imagens das capas (o item guarda só o nome do arquivo). Faça backup desta pasta junto com `items.json`

## Importar capas em lote
Coloque as imagens em `importar_capas/` e clique em **Importar capas** na tela principal.
Nomes aceitos: `id-12.jpg` (o mais seguro), ISBN, título ou título + edição. Detalhes em `importar_capas/LEIA-ME.txt`.
O botão também baixa a lista (CSV) dos itens sem capa, já com o nome de arquivo sugerido.

## Etapa 2 (banco de dados)
Todo acesso aos dados passa pelo objeto `repo` em `server.js`. Na etapa 2 basta
trocar esse objeto por uma versão que use o banco; API e interface não mudam.
