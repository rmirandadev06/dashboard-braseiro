require('dotenv').config();
const express = require('express');
const db = require('./db');
const app = express();
const PORT = process.env.PORT || 3001;
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('Falta JWT_SECRET no .env'); process.exit(1); }

app.use(cors());
app.use(express.json());

// --- LINHA NOVA E OBRIGATÓRIA PARA O RENDER ---
// Isso faz o Node.js servir o seu index.html, style.css e script.js para o mundo
app.use(express.static(__dirname));

// --- LOGS ---
async function registrarLog(u, a, d) { 
    try { await db('logs').insert({ usuario_nome: u, acao: a, detalhes: d }); } 
    catch (e) { console.error('Log Error:', e.message); } 
}

// --- DATA HELPER ---
function getDates(periodo, cI, cF) {
    const h = new Date();
    let dI, dF;
    h.setHours(0,0,0,0);

    if (periodo === 'today') {
        dI = new Date(h);
        dF = new Date(h); dF.setHours(23,59,59,999);
    } else if (periodo === 'week') {
        const d = h.getDay();
        dI = new Date(h); dI.setDate(h.getDate() - d);
        dF = new Date(dI); dF.setDate(dI.getDate() + 6); dF.setHours(23,59,59,999);
    } else if (periodo === 'custom' && cI && cF) {
        const [a1,m1,d1] = cI.split('-').map(Number);
        const [a2,m2,d2] = cF.split('-').map(Number);
        dI = new Date(a1, m1-1, d1);
        dF = new Date(a2, m2-1, d2, 23,59,59,999);
    } else {
        dI = new Date(h.getFullYear(), h.getMonth(), 1);
        dF = new Date(h.getFullYear(), h.getMonth() + 1, 0, 23,59,59,999);
    }
    return { start: dI.toISOString(), end: dF.toISOString() };
}

const auth = (req, res, next) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Token ausente' });
        req.usuario = jwt.verify(token, JWT_SECRET);
        next();
    } catch { res.status(403).json({ error: 'Acesso negado' }); }
};

// --- ROTAS ---
app.post('/api/login', async (req, res) => {
    try {
        const u = await db('usuarios').where({ email: req.body.email }).first();
        if (u && await bcrypt.compare(req.body.senha, u.senha_hash)) {
            const token = jwt.sign({ userId: u.id, role: u.role, nome: u.nome }, JWT_SECRET, { expiresIn: '8h' });
            res.json({ token, usuario: { nome: u.nome, email: u.email, role: u.role } });
        } else res.status(401).json({ error: 'Dados incorretos' });
    } catch { res.status(500).send(); }
});

app.get('/api/dados-dashboard', auth, async (req, res) => {
    try {
        const { start, end } = getDates(req.query.periodo, req.query.dataInicio, req.query.dataFim);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const q = db('lancamentos').whereBetween('data', [start, end]);
        
        if (req.usuario.role !== 'admin') q.where({ user_id: req.usuario.userId });

        if (req.query.tipo && req.query.tipo !== 'all') q.where('tipo', req.query.tipo);
        if (req.query.categoria && req.query.categoria !== 'all') q.where('categoria', req.query.categoria);
        if (req.query.metodoPagamento && req.query.metodoPagamento !== 'all') q.where('metodo_pagamento', req.query.metodoPagamento);
        if (req.query.descricao) q.where('descricao', 'ilike', `%${req.query.descricao}%`);
        if (req.query.valorMin) q.where('valor', '>=', req.query.valorMin);
        if (req.query.valorMax) q.where('valor', '<=', req.query.valorMax);

        const [countEnt] = await q.clone().where('tipo', 'Entrada').count('* as total');
        const [countSai] = await q.clone().where('tipo', 'Saída').count('* as total');

        const [kpiRaw, saldoAntRaw, despesasRaw, fluxoRaw, entradasRaw, saidasRaw] = await Promise.all([
            q.clone().select(
                db.raw("COALESCE(SUM(CASE WHEN tipo='Entrada' THEN valor ELSE 0 END),0) as total_entradas"),
                db.raw("COALESCE(SUM(CASE WHEN tipo='Saída' THEN valor ELSE 0 END),0) as total_saidas")
            ),
            db('lancamentos')
                .select(db.raw("COALESCE(SUM(CASE WHEN tipo='Entrada' THEN valor ELSE -valor END), 0) as saldo"))
                .where('data', '<', start)
                .modify(qb => { if (req.usuario.role !== 'admin') qb.where({ user_id: req.usuario.userId }); }),
            q.clone().select('categoria').sum('valor as total').where('tipo', 'Saída').groupBy('categoria').orderBy('total', 'desc'),
            q.clone().select(
                db.raw("DATE_TRUNC('day', data) as dia"),
                db.raw("COALESCE(SUM(CASE WHEN tipo='Entrada' THEN valor ELSE 0 END),0) as entradas"),
                db.raw("COALESCE(SUM(CASE WHEN tipo='Saída' THEN valor ELSE 0 END),0) as saidas")
            ).groupByRaw("DATE_TRUNC('day', data)").orderBy('dia', 'asc'),
            q.clone().where('tipo', 'Entrada').orderBy('data', 'desc').limit(limit).offset(offset)
                .select('*', db.raw("TO_CHAR(data, 'DD/MM/YYYY') as data_tabela"), db.raw("TO_CHAR(data, 'YYYY-MM-DD') as data_input")),
            q.clone().where('tipo', 'Saída').orderBy('data', 'desc').limit(limit).offset(offset)
                .select('*', db.raw("TO_CHAR(data, 'DD/MM/YYYY') as data_tabela"), db.raw("TO_CHAR(data, 'YYYY-MM-DD') as data_input"))
        ]);

        const totalEntradas = parseFloat(kpiRaw[0]?.total_entradas || 0);
        const totalSaidas = parseFloat(kpiRaw[0]?.total_saidas || 0);
        const saldoAnterior = parseFloat(saldoAntRaw[0]?.saldo || 0);
        const saldoPeriodo = totalEntradas - totalSaidas;
        const saldoAtual = saldoAnterior + saldoPeriodo;

        const labels = [], dataEnt = [], dataSai = [], dataAcc = [];
        let acc = saldoAnterior;

        fluxoRaw.forEach(d => {
            const e = parseFloat(d.entradas);
            const s = parseFloat(d.saidas);
            acc += (e - s);
            labels.push(new Date(d.dia).toLocaleDateString('pt-BR', { timeZone: 'UTC' }));
            dataEnt.push(e);
            dataSai.push(s);
            dataAcc.push(acc);
        });

        res.json({
            kpis: { totalEntradas, totalSaidas, saldoAnterior, saldoPeriodo, saldoAtual },
            despesas: { labels: despesasRaw.map(d => d.categoria), valores: despesasRaw.map(d => parseFloat(d.total)) },
            graficoFluxoCaixa: { labels, valoresEntradas: dataEnt, valoresSaidas: dataSai, valoresSaldoAcumulado: dataAcc },
            tabelas: { 
                ultimasEntradas: entradasRaw, 
                ultimasSaidas: saidasRaw,
                pagination: {
                    totalEntradas: parseInt(countEnt?.total || 0),
                    totalSaidas: parseInt(countSai?.total || 0),
                    perPage: limit,
                    currentPage: page
                }
            }
        });

    } catch (e) { 
        console.error('ERRO SERVER:', e.message); 
        res.status(500).json({ error: 'Erro interno' }); 
    }
});

app.get('/api/categorias', auth, async (req, res) => { try { res.json(await db('categorias').orderBy('nome', 'asc')); } catch { res.status(500).send(); } });
app.post('/api/categorias', auth, async (req, res) => { try { const { nome, tipo } = req.body; await db('categorias').insert({ nome, tipo }); await registrarLog(req.usuario.nome, 'CRIAR CATEGORIA', `${nome} (${tipo})`); res.status(201).send(); } catch { res.status(500).send(); } });
app.delete('/api/categorias/:id', auth, async (req, res) => { try { const cat = await db('categorias').where({ id: req.params.id }).first(); if (!cat) return res.status(404).json({error: 'Não encontrada'}); await db('categorias').where({ id: req.params.id }).del(); await registrarLog(req.usuario.nome, 'EXCLUIR CATEGORIA', `${cat.nome} (${cat.tipo})`); res.status(204).send(); } catch (e) { if(e.code === '23503') return res.status(409).json({error: 'Categoria em uso'}); res.status(500).send(); } });
app.post('/api/lancamento', auth, async (req, res) => { try { const [novo] = await db('lancamentos').insert({...req.body, user_id: req.usuario.userId}).returning('*'); await registrarLog(req.usuario.nome, 'INSERIR', `${req.body.tipo}: ${req.body.descricao}`); res.status(201).json(novo); } catch { res.status(500).send(); } });
app.delete('/api/lancamento/:id', auth, async (req, res) => { try { const item = await db('lancamentos').where({ id: req.params.id }).first(); if(!item) return res.status(404).send(); const q = db('lancamentos').where({ id: req.params.id }); if(req.usuario.role !== 'admin') q.where({ user_id: req.usuario.userId }); if(await q.del()) { await registrarLog(req.usuario.nome, 'EXCLUIR', `Lançamento: ${item.descricao}`); res.status(204).send(); } else res.status(403).send(); } catch { res.status(500).send(); } });
app.put('/api/lancamento/:id', auth, async (req, res) => { try { const q = db('lancamentos').where({ id: req.params.id }); if(req.usuario.role !== 'admin') q.where({ user_id: req.usuario.userId }); if(await q.update(req.body)) { await registrarLog(req.usuario.nome, 'EDITAR', `Editou ID ${req.params.id}`); res.json({ok:1}); } else res.status(404).send(); } catch { res.status(500).send(); } });
app.get('/api/logs', auth, async (req, res) => { if (req.usuario.role !== 'admin') return res.status(403).send(); try { const { startDate, endDate, user } = req.query; const q = db('logs').orderBy('data', 'desc').limit(200); if(startDate) q.where('data', '>=', `${startDate}T00:00:00`); if(endDate) q.where('data', '<=', `${endDate}T23:59:59`); if(user) q.where('usuario_nome', 'ilike', `%${user}%`); res.json(await q); } catch(e){ res.status(500).send(); } });
app.get('/api/usuarios', auth, async (req, res) => { if(req.usuario.role!=='admin')return res.status(403).send(); res.json(await db('usuarios').select('*')); });
app.post('/api/registrar', auth, async (req, res) => { if(req.usuario.role!=='admin')return res.status(403).send(); await db('usuarios').insert({nome:req.body.nome, email:req.body.email, role:'simples', senha_hash: await bcrypt.hash(req.body.senha, 10)}); await registrarLog(req.usuario.nome, 'CRIAR USUÁRIO', req.body.email); res.status(201).send(); });
app.delete('/api/usuarios/:id', auth, async (req, res) => { if(req.usuario.role!=='admin')return res.status(403).send(); await db('usuarios').where({id:req.params.id}).del(); await registrarLog(req.usuario.nome, 'EXCLUIR USUÁRIO', `ID ${req.params.id}`); res.send(); });
app.post('/api/perfil/alterar-senha', auth, async (req, res) => { const u = await db('usuarios').where({id:req.usuario.userId}).first(); if(u && await bcrypt.compare(req.body.senhaAtual, u.senha_hash)) { await db('usuarios').where({id:u.id}).update({senha_hash: await bcrypt.hash(req.body.novaSenha, 10)}); await registrarLog(req.usuario.nome, 'ALTERAR SENHA', 'Própria senha'); res.send(); } else res.status(401).send(); });
app.get('/api/exportar', auth, async (req, res) => { const d = await db('lancamentos').select('*').limit(500); res.send('ID;Data;Valor\n'+d.map(r=>`${r.id};${r.data};${r.valor}`).join('\n')); });

app.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}`));