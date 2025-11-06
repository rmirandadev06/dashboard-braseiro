// --- CORREÇÃO GLOBAL DE IPV4 (ENETUNREACH) ---
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const db = require('./db');
const app = express();
const PORT = process.env.PORT || 3001;

const cors = require('cors');
app.use(cors());
app.use(express.json());

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 🔒 Configuração segura da JWT_SECRET
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('❌ ERRO: JWT_SECRET não configurada no .env');
    process.exit(1);
}

console.log('✅ Servidor configurado com sucesso!');

// Mapas (sem alteração)
function calcularIntervaloDatas(periodo, customInicio, customFim) { //
    const hoje = new Date(); 
    let dataInicio, dataFim;
    switch (periodo) {
        case 'today':
            dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0);
            dataFim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);
            break;
        case 'week':
            const diaSemana = hoje.getDay(); 
            dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diaSemana, 0, 0, 0, 0);
            dataFim = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), dataInicio.getDate() + 6, 23, 59, 59, 999);
            break;
        case 'custom':
            if (customInicio && customFim) {
                const [anoI, mesI, diaI] = customInicio.split('-').map(Number);
                dataInicio = new Date(anoI, mesI - 1, diaI, 0, 0, 0, 0);
                const [anoF, mesF, diaF] = customFim.split('-').map(Number);
                dataFim = new Date(anoF, mesF - 1, diaF, 23, 59, 59, 999);
            } else {
                return calcularIntervaloDatas('month'); 
            }
            break;
        case 'month':
        default: 
            dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0);
            dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);
            break;
    }
    return { 
        dataInicio: dataInicio.toISOString(), 
        dataFim: dataFim.toISOString() 
    };
}
const categoriaMap = { //
    'sales': 'Vendas (Salão)', 'extra': 'Recebíveis Extras',
    'market': 'Mercado', 'purchases': 'Compras', 'staff': 'Pessoal',
    'utilities': 'Utilidades', 'maintenance': 'Manutenção', 'taxes': 'Impostos', 
    'investments': 'Investimentos', 'butchery': 'Açougue', 'bills': 'Contas/Boletos',
    'other': 'Outros'
};
const metodoMap = { //
    'cash': 'Dinheiro', 'card': 'Cartão', 'pix': 'Pix', 'transfer': 'Transferência', 
    'bill': 'Boleto', 'card-pix': 'Cartão + Pix',
    'other': 'Outro'
};

/* * ========================================
 * MIDDLEWARE DE AUTENTICAÇÃO (O "GUARDA")
 * ========================================
 */
const authMiddleware = (req, res, next) => { //
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; 
        if (token == null) {
            return res.status(401).json({ error: 'Token de acesso não fornecido.' });
        }
        const usuario = jwt.verify(token, JWT_SECRET); //
        req.usuario = usuario; //
        next(); //
    } catch (err) {
        console.error('Erro no middleware de autenticação:', err.message);
        return res.status(403).json({ error: 'Token inválido ou expirado.' });
    }
};

/* * ========================================
 * ENDPOINTS DE USUÁRIO (Registrar, Login, etc.)
 * ========================================
 */
app.post('/api/registrar', authMiddleware, async (req, res) => { //
    try {
        if (req.usuario.role !== 'admin') { //
            return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem registrar novos usuários.' });
        }
        const { nome, email, senha } = req.body;
        if (!nome || !email || !senha) {
            return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
        }
        const usuarioExistente = await db('usuarios').where({ email }).first();
        if (usuarioExistente) {
            return res.status(400).json({ error: 'Este email já está em uso.' });
        }
        const senha_hash = await bcrypt.hash(senha, 10); //
        const [novoUsuario] = await db('usuarios').insert({ //
            nome,
            email,
            senha_hash,
            role: 'simples'
        }).returning(['id', 'nome', 'email', 'role']);
        res.status(201).json({
            message: 'Usuário registrado com sucesso!',
            usuario: novoUsuario
        });
    } catch (error) {
        console.error('Erro ao registrar usuário (POST):', error); //
        res.status(500).json({ error: 'Erro interno ao registrar usuário' }); //
    }
});

app.post('/api/login', async (req, res) => { //
    try {
        const { email, senha } = req.body;
        if (!email || !senha) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
        }
        const usuario = await db('usuarios').where({ email }).first();
        if (!usuario) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash); //
        if (!senhaCorreta) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        const token = jwt.sign( //
            { 
                userId: usuario.id, 
                role: usuario.role,
                nome: usuario.nome
            }, 
            JWT_SECRET, 
            { expiresIn: '8h' }
        );
        res.status(200).json({
            message: 'Login bem-sucedido!',
            token,
            usuario: {
                nome: usuario.nome,
                email: usuario.email,
                role: usuario.role
            }
        });
    } catch (error) {
        console.error('Erro ao fazer login (POST):', error);
        res.status(500).json({ error: 'Erro interno ao tentar fazer login' });
    }
});

app.get('/api/usuarios', authMiddleware, async (req, res) => { //
    if (req.usuario.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    try {
        const usuarios = await db('usuarios')
            .select('id', 'nome', 'email', 'role', 'created_at')
            .orderBy('created_at', 'desc');
        res.status(200).json(usuarios);
    } catch (error) {
        console.error('Erro ao listar usuários (GET):', error);
        res.status(500).json({ error: 'Erro interno ao buscar usuários' });
    }
});

app.put('/api/usuarios/:id', authMiddleware, async (req, res) => { //
    if (req.usuario.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    try {
        const { id } = req.params;
        const { nome, email, role } = req.body;
        if (!nome || !email || !role) {
            return res.status(400).json({ error: 'Nome, email e role são obrigatórios.' });
        }
        if (role !== 'admin' && role !== 'simples') {
             return res.status(400).json({ error: 'Role inválida. Use "admin" ou "simples".' });
        }
        const [usuarioAtualizado] = await db('usuarios')
            .where({ id: id })
            .update({
                nome: nome,
                email: email,
                role: role
            })
            .returning(['id', 'nome', 'email', 'role']);
        if (usuarioAtualizado) {
            res.status(200).json(usuarioAtualizado);
        } else {
            res.status(404).json({ error: 'Usuário não encontrado.' });
        }
    } catch (error) {
        if (error.code === '23505') { 
            return res.status(400).json({ error: 'Este email já está em uso por outra conta.' });
        }
        console.error('Erro ao atualizar usuário (PUT):', error);
        res.status(500).json({ error: 'Erro interno ao atualizar usuário' });
    }
});

app.post('/api/usuarios/admin-reset-senha', authMiddleware, async (req, res) => { //
    if (req.usuario.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    try {
        const { userId, novaSenha } = req.body;
        if (!userId || !novaSenha) {
            return res.status(400).json({ error: 'ID do usuário e nova senha são obrigatórios.' });
        }
        const senha_hash = await bcrypt.hash(novaSenha, 10); //
        const linhasAfetadas = await db('usuarios')
            .where({ id: userId })
            .update({
                senha_hash: senha_hash
            });
        if (linhasAfetadas > 0) {
            res.status(200).json({ message: 'Senha do usuário atualizada com sucesso.' });
        } else {
            res.status(404).json({ error: 'Usuário não encontrado.' });
        }
    } catch (error) {
        console.error('Erro ao resetar senha (POST):', error);
        res.status(500).json({ error: 'Erro interno ao resetar senha' });
    }
});

app.delete('/api/usuarios/:id', authMiddleware, async (req, res) => { //
    if (req.usuario.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    try {
        const { id } = req.params; 
        const adminUserId = req.usuario.userId; 
        if (id === adminUserId) {
            return res.status(400).json({ error: 'Ação negada. Você não pode deletar sua própria conta de administrador.' });
        }
        const linhasApagadas = await db('usuarios')
            .where({ id: id })
            .del();
        if (linhasApagadas > 0) {
            res.status(204).send(); 
        } else {
            res.status(404).json({ error: 'Usuário não encontrado.' });
        }
    } catch (error) {
        console.error('Erro ao deletar usuário (DELETE):', error);
        res.status(500).json({ error: 'Erro interno ao deletar usuário' });
    }
});

/* * ========================================
 * ENDPOINT DE ALTERAR A PRÓPRIA SENHA (POST /api/perfil/alterar-senha)
 * Rota protegida para QUALQUER usuário logado
 * ========================================
 */
app.post('/api/perfil/alterar-senha', authMiddleware, async (req, res) => {
    try {
        const { senhaAtual, novaSenha } = req.body;
        const userId = req.usuario.userId; // Pega o ID do próprio usuário logado

        if (!senhaAtual || !novaSenha) {
            return res.status(400).json({ error: 'A senha atual e a nova senha são obrigatórias.' });
        }

        // 1. Busca o usuário no banco
        const usuario = await db('usuarios').where({ id: userId }).first(); //
        if (!usuario) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        // 2. Compara a senha "atual" enviada com a senha no banco
        const senhaCorreta = await bcrypt.compare(senhaAtual, usuario.senha_hash); //

        if (!senhaCorreta) {
            return res.status(401).json({ error: 'A "Senha Atual" está incorreta.' });
        }

        // 3. Criptografa a nova senha
        const nova_senha_hash = await bcrypt.hash(novaSenha, 10); //

        // 4. Atualiza a senha no banco
        await db('usuarios')
            .where({ id: userId })
            .update({ senha_hash: nova_senha_hash }); //

        res.status(200).json({ message: 'Senha alterada com sucesso! Faça o login novamente.' });

    } catch (error) {
        console.error('Erro ao alterar a própria senha (POST):', error);
        res.status(500).json({ error: 'Erro interno ao alterar a senha.' });
    }
});

// (Endpoint de alterar a própria senha - o adicionaremos no próximo passo)

/* * ========================================
 * ENDPOINT DE LEITURA (GET /dados-dashboard)
 * ========================================
 */
app.get('/api/dados-dashboard', authMiddleware, async (req, res) => { //
    try {
        const { userId, role } = req.usuario; //
        const { 
            periodo = 'month', categoria, metodoPagamento, 
            dataInicio: dataInicioCustom, dataFim: dataFimCustom,
            tipo, descricao, valorMin, valorMax,
            sortBy: sortByClient = 'data', 
            sortOrder: sortOrderClient = 'desc'
        } = req.query;
        
        const { dataInicio, dataFim } = calcularIntervaloDatas(periodo, dataInicioCustom, dataFimCustom);
        const queryBase = db('lancamentos') //
            .whereBetween('data', [dataInicio, dataFim]);
        
        if (role !== 'admin') { //
            queryBase.where({ user_id: userId });
        }
        // (Filtros de categoria, etc. permanecem iguais)
        if (categoria && categoria !== 'all' && categoriaMap[categoria]) {
            queryBase.where('categoria', categoriaMap[categoria]);
        }
        if (metodoPagamento && metodoPagamento !== 'all' && metodoMap[metodoPagamento]) {
            queryBase.where('metodo_pagamento', metodoMap[metodoPagamento]);
        }
        if (tipo && tipo !== 'all') {
            queryBase.where('tipo', tipo);
        }
        if (descricao) {
            queryBase.where('descricao', 'ilike', `%${descricao}%`);
        }
        if (valorMin) {
            queryBase.where('valor', '>=', parseFloat(valorMin));
        }
        if (valorMax) {
            queryBase.where('valor', '<=', parseFloat(valorMax));
        }
        const allowedSortBy = ['data', 'valor'];
        const allowedSortOrder = ['asc', 'desc'];
        const sortBy = allowedSortBy.includes(sortByClient) ? sortByClient : 'data';
        const sortOrder = allowedSortOrder.includes(sortOrderClient) ? sortOrderClient : 'desc';

        // --- Promessas ---
        const kpisPromise = queryBase.clone() //
            .select(
                db.raw("COALESCE(SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE 0 END), 0) as \"totalEntradas\""),
                db.raw("COALESCE(SUM(CASE WHEN tipo = 'Saída' THEN valor ELSE 0 END), 0) as \"totalSaidas\"")
            );
        const saldoAnteriorPromise = db('lancamentos') //
            .select(db.raw("COALESCE(SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE (valor * -1) END), 0) as saldo"))
            .where('data', '<', dataInicio);
        
        if (role !== 'admin') { //
            saldoAnteriorPromise.where({ user_id: userId });
        }
        const despesasPromise = queryBase.clone() //
            .select('categoria')
            .sum('valor as total')
            .where('tipo', 'Saída')
            .groupBy('categoria')
            .orderBy('total', 'desc');

        // --- MUDANÇA 1: "Fluxo de Caixa" (Timeline por Dia) ---
        const graficoFluxoCaixaPromise = queryBase.clone() //
            .select(
                db.raw("DATE_TRUNC('day', data) as dia"), //
                db.raw("COALESCE(SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE 0 END), 0) as \"entradas\""),
                db.raw("COALESCE(SUM(CASE WHEN tipo = 'Saída' THEN valor ELSE 0 END), 0) as \"saidas\""),
                db.raw("COALESCE(SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE (valor * -1) END), 0) as \"saldo\"")
            )
            .groupBy('dia')
            .orderBy('dia', 'asc');
            
        const tabelaCampos = [ //
            'id', 'descricao', 'categoria', 'valor', 'tipo', 'metodo_pagamento',
            db.raw("TO_CHAR(data, 'DD/MM/YYYY') as data_tabela"),
            db.raw("TO_CHAR(data, 'YYYY-MM-DD') as data_input")
        ];
        const tabelaEntradasPromise = queryBase.clone() //
            .select(tabelaCampos)
            .where('tipo', 'Entrada')
            .orderBy(sortBy, sortOrder); 
        const tabelaSaidasPromise = queryBase.clone() //
            .select(tabelaCampos)
            .where('tipo', 'Saída')
            .orderBy(sortBy, sortOrder); 
        
        const [
            kpisResult, saldoAnteriorResult, despesasResult, 
            graficoFluxoCaixaResult, // <-- MUDANÇA 2
            ultimasEntradas, ultimasSaidas
        ] = await Promise.all([ //
            kpisPromise, saldoAnteriorPromise, despesasPromise, 
            graficoFluxoCaixaPromise, // <-- MUDANÇA 3
            tabelaEntradasPromise, tabelaSaidasPromise
        ]);
        
        // --- Formatar Resposta ---
        const kpis = kpisResult[0] || { totalEntradas: 0, totalSaidas: 0 };
        const saldoPeriodo = parseFloat(kpis.totalEntradas) - parseFloat(kpis.totalSaidas);
        const saldoAnterior = parseFloat(saldoAnteriorResult[0].saldo) || 0; //
        const saldoAtual = saldoAnterior + saldoPeriodo;

        const despesasFormatado = {
            labels: despesasResult.map(d => d.categoria),
            valores: despesasResult.map(d => parseFloat(d.total))
        };

        // --- MUDANÇA 4: Formatar dados do Fluxo de Caixa (com Saldo Acumulado) ---
        const fluxoLabels = [];
        const valoresEntradas = [];
        const valoresSaidas = [];
        const valoresSaldoAcumulado = [];
        
        let saldoAcumulado = saldoAnterior; // Começa com o saldo anterior

        graficoFluxoCaixaResult.forEach(dia => {
            const saldoDoDia = parseFloat(dia.saldo);
            saldoAcumulado += saldoDoDia; // Calcula o saldo acumulado

            fluxoLabels.push(new Date(dia.dia).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }));
            valoresEntradas.push(parseFloat(dia.entradas));
            valoresSaidas.push(parseFloat(dia.saidas));
            valoresSaldoAcumulado.push(saldoAcumulado); // Adiciona o saldo acumulado
        });

        const fluxoCaixaFormatado = {
            labels: fluxoLabels,
            valoresEntradas: valoresEntradas,
            valoresSaidas: valoresSaidas,
            valoresSaldoAcumulado: valoresSaldoAcumulado
        };

        res.json({
            kpis: {
                totalEntradas: parseFloat(kpis.totalEntradas),
                totalSaidas: parseFloat(kpis.totalSaidas),
                saldoPeriodo: saldoPeriodo,
                margemLucro: (saldoPeriodo / (parseFloat(kpis.totalEntradas) || 1)) || 0,
                saldoAnterior: saldoAnterior,
                saldoAtual: saldoAtual
            },
            despesas: despesasFormatado,
            graficoFluxoCaixa: fluxoCaixaFormatado, // <-- MUDANÇA 5
            tabelas: {
                ultimasEntradas: ultimasEntradas.map(e => ({...e, valor: parseFloat(e.valor)})),
                ultimasSaidas: ultimasSaidas.map(s => ({...s, valor: parseFloat(s.valor)}))
            }
        });

    } catch (error) {
        console.error('Erro ao buscar dados do dashboard (GET):', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});


/* * ========================================
 * ENDPOINT DE EXPORTAÇÃO (GET /api/exportar)
 * ========================================
 */
const escapeCSV = (val) => { //
    let str = String(val == null ? '' : val);
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        str = `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};
app.get('/api/exportar', authMiddleware, async (req, res) => { //
    try {
        const { userId, role } = req.usuario; //
        const { 
            periodo = 'month', categoria, metodoPagamento, 
            dataInicio: dataInicioCustom, dataFim: dataFimCustom,
            tipo, descricao, valorMin, valorMax,
            sortBy: sortByClient = 'data', 
            sortOrder: sortOrderClient = 'desc'
        } = req.query;
        
        const { dataInicio, dataFim } = calcularIntervaloDatas(periodo, dataInicioCustom, dataFimCustom);
        const queryBase = db('lancamentos') //
            .whereBetween('data', [dataInicio, dataFim]);
        
        if (role !== 'admin') { //
            queryBase.where({ user_id: userId });
        }
        // (Filtros de exportação permanecem iguais)
        if (categoria && categoria !== 'all' && categoriaMap[categoria]) {
            queryBase.where('categoria', categoriaMap[categoria]);
        }
        if (metodoPagamento && metodoPagamento !== 'all' && metodoMap[metodoPagamento]) {
            queryBase.where('metodo_pagamento', metodoMap[metodoPagamento]);
        }
        if (tipo && tipo !== 'all') {
            queryBase.where('tipo', tipo);
        }
        if (descricao) {
            queryBase.where('descricao', 'ilike', `%${descricao}%`);
        }
        if (valorMin) {
            queryBase.where('valor', '>=', parseFloat(valorMin));
        }
        if (valorMax) {
            queryBase.where('valor', '<=', parseFloat(valorMax));
        }
        const allowedSortBy = ['data', 'valor'];
        const allowedSortOrder = ['asc', 'desc'];
        const sortBy = allowedSortBy.includes(sortByClient) ? sortByClient : 'data';
        const sortOrder = allowedSortOrder.includes(sortOrderClient) ? sortOrderClient : 'desc';

        const dadosParaExportar = await queryBase.clone() //
            .select('id', 'data', 'tipo', 'descricao', 'categoria', 'metodo_pagamento', 'valor')
            .orderBy(sortBy, sortOrder); 

        // (CSV builder permanece igual)
        const headers = ['ID', 'Data', 'Tipo', 'Descricao', 'Categoria', 'Metodo', 'Valor'];
        const csvHeader = headers.join(';') + '\n';
        const csvRows = dadosParaExportar.map(row => {
            const dataFmt = new Date(row.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            const valorFmt = String(parseFloat(row.valor).toFixed(2)).replace('.', ',');
            return [
                row.id, dataFmt, escapeCSV(row.tipo), escapeCSV(row.descricao),
                escapeCSV(row.categoria), escapeCSV(row.metodo_pagamento), valorFmt 
            ].join(';');
        }).join('\n');
        const csvCompleto = '\ufeff' + csvHeader + csvRows;

        const nomeArquivo = `export_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
        res.status(200).send(csvCompleto);

    } catch (error) {
        console.error('Erro ao gerar exportação (GET):', error);
        res.status(500).json({ error: 'Erro interno ao gerar exportação' });
    }
});

/* * ========================================
 * ENDPOINTS DE LANÇAMENTO (CRUD)
 * ========================================
 */
app.post('/api/lancamento', authMiddleware, async (req, res) => { //
    try {
        const user_id = req.usuario.userId; //
        const { tipo, data, valor, descricao, categoria, metodo_pagamento } = req.body;
        if (!tipo || !data || !valor || !descricao || !categoria || !metodo_pagamento) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
        }
        const novoLancamento = {
            tipo: tipo, data: data, valor: parseFloat(valor), descricao: descricao,
            categoria: categoriaMap[categoria] || categoriaMap['other'],
            metodo_pagamento: metodoMap[metodo_pagamento] || metodoMap['other'],
            user_id: user_id //
        };
        const [lancamentoInserido] = await db('lancamentos').insert(novoLancamento).returning('*'); 
        res.status(201).json(lancamentoInserido);
    } catch (error) {
        console.error('Erro ao criar lançamento (POST):', error);
        res.status(500).json({ error: 'Erro interno ao salvar lançamento' });
    }
});

app.put('/api/lancamento/:id', authMiddleware, async (req, res) => { //
    try {
        const { id } = req.params;
        const { userId, role } = req.usuario; //
        const { tipo, data, valor, descricao, categoria, metodo_pagamento } = req.body;
        
        if (!tipo || !data || !valor || !descricao || !categoria || !metodo_pagamento) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
        }
        const lancamentoAtualizado = {
            tipo: tipo, data: data, valor: parseFloat(valor), descricao: descricao,
            categoria: categoriaMap[categoria] || categoriaMap['other'],
            metodo_pagamento: metodoMap[metodo_pagamento] || metodoMap['other']
       };
        
        const query = db('lancamentos').where({ id: id }); //

        if (role !== 'admin') { //
            query.where({ user_id: userId });
        }
        
        const [lancamentoEditado] = await query.update(lancamentoAtualizado).returning('*'); //

        if (lancamentoEditado) {
            res.status(200).json(lancamentoEditado);
        } else {
            res.status(404).json({ error: 'Lançamento não encontrado ou acesso negado' });
        }
    } catch (error) {
        console.error('Erro ao atualizar lançamento (PUT):', error);
        res.status(500).json({ error: 'Erro interno ao atualizar lançamento' });
    }
});

app.delete('/api/lancamento/:id', authMiddleware, async (req, res) => { //
    try {
        const { id } = req.params;
        const { userId, role } = req.usuario; //

        const query = db('lancamentos').where({ id: id }); //

        if (role !== 'admin') { //
            query.where({ user_id: userId });
        }
        
        const linhasApagadas = await query.del(); //

        if (linhasApagadas > 0) {
            res.status(204).send(); 
        } else {
            res.status(404).json({ error: 'Lançamento não encontrado ou acesso negado' });
        }
    } catch (error) {
        console.error('Erro ao apagar lançamento (DELETE):', error);
        res.status(500).json({ error: 'Erro interno ao apagar lançamento' });
    }
});

console.log('--- DEPLOY FORÇADO v3 (IPv4 fix) ---');

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend rodando em http://localhost:${PORT}`); //
});
