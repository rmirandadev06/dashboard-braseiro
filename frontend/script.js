/* * ========================================
 * AUTH GUARD (VERIFICAÇÃO DE LOGIN)
 * ========================================
 */
(function() {
    const token = localStorage.getItem('authToken');
    const usuario = localStorage.getItem('usuario');
    
    if (!token || !usuario) {
        alert('Acesso negado. Por favor, faça o login.');
        window.location.href = 'login.html';
        return;
    }
    
    try {
        JSON.parse(usuario);
    } catch (e) {
        console.error('Dados do usuário corrompidos:', e);
        localStorage.removeItem('authToken');
        localStorage.removeItem('usuario');
        window.location.href = 'login.html';
    }
})();

/* * ========================================
 * VARIÁVEIS GLOBAIS
 * ========================================
 */
const API_URL = 'https://dashboard-braseiro-api.onrender.com/api';
let cashFlowChart;
let expensesChart;
let currentEditingId = null;
let currentSortBy = 'data';
let currentSortOrder = 'desc';

// Variáveis do DOM
let modal, btnAbrirModal, btnFecharModal, btnCancelar, form, inputData, modalTitulo, btnSalvar;
let editUserModal, editUserForm, editUserSaveBtn, editUserCancelBtn, 
    editUserCloseModalBtn, editUserId, editUserMessageEl;

window.usuariosGlobais = {};
window.lancamentosGlobais = {};

// --- FUNÇÃO AUXILIAR DE AUTENTICAÇÃO ---
function getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        handleLogout();
        throw new Error('Token de autenticação não encontrado');
    }
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// --- FUNÇÃO DE FETCH COM AUTENTICAÇÃO ---
async function fetchWithAuth(url, options = {}) {
    const headers = getAuthHeaders();
    const config = {
        ...options,
        headers: { ...headers, ...options.headers }
    };
    
    const response = await fetch(url, config);
    
    if (response.status === 401 || response.status === 403) {
        handleLogout();
        throw new Error('Sessão expirada. Faça login novamente.');
    }
    
    return response;
}

/* * ========================================
 * FUNÇÕES DE ATUALIZAÇÃO E FORMATAÇÃO
 * ========================================
 */

function formatarMoeda(valor) {
    const valorNum = Number(valor) || 0;
    return valorNum.toLocaleString('pt-BR', { 
        style: 'currency', 
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatarDataParaInput(data) {
    if (!(data instanceof Date)) {
        data = new Date(data);
    }
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function atualizarKPIs(dadosKPI) {
    if (!dadosKPI) return;
    
    const elements = {
        'saldoAnterior': '.card.saldo-anterior .value',
        'saldoAtual': '.card.saldo-atual .value',
        'totalEntradas': '.card.entradas .value',
        'totalSaidas': '.card.saidas .value',
        'saldoPeriodo': '.card.saldo .value'
    };
    
    Object.entries(elements).forEach(([key, selector]) => {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = formatarMoeda(dadosKPI[key] || 0);
        }
    });
    
    // Calcular margem
    const margemLucroEl = document.querySelector('.card.margem .value');
    const totalEntradas = Number(dadosKPI.totalEntradas) || 0;
    const saldoPeriodo = Number(dadosKPI.saldoPeriodo) || 0;
    const margem = totalEntradas !== 0 ? (saldoPeriodo / totalEntradas) * 100 : 0;
    
    if (margemLucroEl) {
        margemLucroEl.textContent = margem.toFixed(1) + '%';
        margemLucroEl.style.color = margem >= 0 ? 'var(--success)' : 'var(--danger)';
    }
}

function atualizarGraficoFluxo(dadosGrafico) {
    if (!cashFlowChart || !dadosGrafico) return;
    
    cashFlowChart.data.labels = dadosGrafico.labels || [];
    cashFlowChart.data.datasets[0].data = dadosGrafico.valoresEntradas || [];
    cashFlowChart.data.datasets[1].data = dadosGrafico.valoresSaidas || [];
    cashFlowChart.data.datasets[2].data = dadosGrafico.valoresSaldoAcumulado || [];
    cashFlowChart.update('none');
}

function atualizarGraficoDespesas(dadosDespesas) {
    if (!expensesChart || !dadosDespesas) return;
    
    expensesChart.data.labels = dadosDespesas.labels || [];
    expensesChart.data.datasets[0].data = dadosDespesas.valores || [];
    
    // Atualizar cores dinamicamente baseado no número de categorias
    const cores = [
        'rgba(231, 76, 60, 0.7)',   // danger
        'rgba(52, 152, 219, 0.7)',  // secondary
        'rgba(243, 156, 18, 0.7)',  // warning
        'rgba(155, 89, 182, 0.7)',  // roxo
        'rgba(46, 204, 113, 0.7)',  // success
        'rgba(241, 196, 15, 0.7)',  // amarelo
        'rgba(26, 188, 156, 0.7)',  // turquesa
        'rgba(149, 165, 166, 0.7)', // cinza
        'rgba(52, 73, 94, 0.7)',    // dark
        'rgba(189, 195, 199, 0.7)'  // light gray
    ];
    
    expensesChart.data.datasets[0].backgroundColor = 
        dadosDespesas.labels?.map((_, index) => cores[index % cores.length]) || [];
    
    expensesChart.update('none');
}

function atualizarTabelas(dadosTabelas) {
    if (!dadosTabelas) return;
    
    const tabelaEntradas = document.querySelector('.tables .table-container:nth-child(1) tbody');
    const tabelaSaidas = document.querySelector('.tables .table-container:nth-child(2) tbody');
    
    if (!tabelaEntradas || !tabelaSaidas) return;
    
    tabelaEntradas.innerHTML = '';
    tabelaSaidas.innerHTML = '';
    
    const trashIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
    const editIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    
    window.lancamentosGlobais = {};

    // Entradas
    if (dadosTabelas.ultimasEntradas && dadosTabelas.ultimasEntradas.length > 0) {
        dadosTabelas.ultimasEntradas.forEach(lancamento => {
            const tr = document.createElement('tr');
            const lancamentoKey = `lancamento_${lancamento.id}`;
            window.lancamentosGlobais[lancamentoKey] = lancamento;
            
            tr.innerHTML = `
                <td>${lancamento.data_tabela || 'N/A'}</td>
                <td>${lancamento.descricao || 'Sem descrição'}</td>
                <td>${lancamento.categoria || 'Outros'}</td>
                <td class="positive">${formatarMoeda(lancamento.valor)}</td>
                <td>
                    <button class="btn-edit" onclick='abrirModalParaEditar(window.lancamentosGlobais["${lancamentoKey}"])' title="Editar este lançamento">${editIconSvg}</button>
                    <button class="btn-delete" onclick="apagarLancamento(${lancamento.id}, '${(lancamento.descricao || '').replace(/'/g, "\\'")}')" title="Apagar este lançamento">${trashIconSvg}</button>
                </td>
            `;
            tabelaEntradas.appendChild(tr);
        });
    } else {
        tabelaEntradas.innerHTML = '<tr><td colspan="5">Nenhuma entrada encontrada</td></tr>';
    }

    // Saídas
    if (dadosTabelas.ultimasSaidas && dadosTabelas.ultimasSaidas.length > 0) {
        dadosTabelas.ultimasSaidas.forEach(lancamento => {
            const tr = document.createElement('tr');
            const lancamentoKey = `lancamento_${lancamento.id}`;
            window.lancamentosGlobais[lancamentoKey] = lancamento;
            
            tr.innerHTML = `
                <td>${lancamento.data_tabela || 'N/A'}</td>
                <td>${lancamento.descricao || 'Sem descrição'}</td>
                <td>${lancamento.categoria || 'Outros'}</td>
                <td class="negative">${formatarMoeda(lancamento.valor)}</td>
                <td>
                    <button class="btn-edit" onclick='abrirModalParaEditar(window.lancamentosGlobais["${lancamentoKey}"])' title="Editar este lançamento">${editIconSvg}</button>
                    <button class="btn-delete" onclick="apagarLancamento(${lancamento.id}, '${(lancamento.descricao || '').replace(/'/g, "\\'")}')" title="Apagar este lançamento">${trashIconSvg}</button>
                </td>
            `;
            tabelaSaidas.appendChild(tr);
        });
    } else {
        tabelaSaidas.innerHTML = '<tr><td colspan="5">Nenhuma saída encontrada</td></tr>';
    }
}

/* * ========================================
 * FUNÇÃO PRINCIPAL DA API (GET /dados-dashboard)
 * ========================================
 */
async function atualizarDashboard() {
    const periodoSelecionado = document.getElementById('date-range').value;
    const categoriaSelecionada = document.getElementById('category').value;
    const metodoPagamento = document.getElementById('payment-method').value;
    const dataInicioCustom = document.getElementById('start-date').value;
    const dataFimCustom = document.getElementById('end-date').value;
    const tipo = document.getElementById('filter-tipo').value;
    const descricao = document.getElementById('filter-descricao').value;
    const valorMin = document.getElementById('filter-valor-min').value;
    const valorMax = document.getElementById('filter-valor-max').value;
    
    const params = new URLSearchParams();
    params.append('periodo', periodoSelecionado);
    params.append('categoria', categoriaSelecionada);
    params.append('metodoPagamento', metodoPagamento);
    
    if (periodoSelecionado === 'custom') {
        if (dataInicioCustom) params.append('dataInicio', dataInicioCustom);
        if (dataFimCustom) params.append('dataFim', dataFimCustom);
    }
    
    if (tipo && tipo !== 'all') {
        params.append('tipo', tipo);
    }
    if (descricao) {
        params.append('descricao', descricao);
    }
    if (valorMin) {
        params.append('valorMin', valorMin);
    }
    if (valorMax) {
        params.append('valorMax', valorMax);
    }
    params.append('sortBy', currentSortBy);
    params.append('sortOrder', currentSortOrder);
    
    const queryString = params.toString();
    const url = `${API_URL}/dados-dashboard?${queryString}`;
    
    document.body.style.cursor = 'wait';
    
    try {
        const response = await fetchWithAuth(url, {
            method: 'GET'
        });
        
        if (!response.ok) {
            const erroApi = await response.json();
            throw new Error(`Erro na API: ${erroApi.error || response.statusText}`);
        }
        
        const dados = await response.json();
        
        atualizarKPIs(dados.kpis);
        atualizarGraficoFluxo(dados.graficoFluxoCaixa);
        atualizarGraficoDespesas(dados.despesas);
        atualizarTabelas(dados.tabelas);
        
        updateSortVisuals();
        
    } catch (error) {
        console.error('Erro ao buscar dados do dashboard:', error);
        if (!error.message.includes('Sessão expirada')) {
            alert('Não foi possível carregar os dados do dashboard.\n\n' + error.message);
        }
    } finally {
        document.body.style.cursor = 'default';
    }
}

/* * ========================================
 * VALIDAÇÃO DE FORMULÁRIOS
 * ========================================
 */
function validarLancamento(lancamento) {
    const errors = [];
    
    if (!lancamento.data) errors.push('Data é obrigatória');
    if (!lancamento.valor || lancamento.valor <= 0) errors.push('Valor deve ser maior que zero');
    if (!lancamento.descricao?.trim()) errors.push('Descrição é obrigatória');
    if (!lancamento.categoria) errors.push('Categoria é obrigatória');
    if (!lancamento.metodo_pagamento) errors.push('Método de pagamento é obrigatório');
    
    return errors;
}

function validarSenha(senha) {
    if (senha.length < 6) {
        return 'A senha deve ter pelo menos 6 caracteres';
    }
    return null;
}

/* * ========================================
 * LÓGICA DO MODAL (Abrir/Fechar/Salvar)
 * ========================================
 */
function abrirModal() {
    if (!modalTitulo || !btnSalvar || !form || !inputData || !modal) {
        console.error('Elementos do modal não foram encontrados.');
        return;
    }
    
    currentEditingId = null;
    modalTitulo.textContent = 'Adicionar Novo Lançamento';
    btnSalvar.textContent = 'Salvar Lançamento';
    form.reset();
    inputData.value = formatarDataParaInput(new Date());
    document.getElementById('tipo-entrada').checked = true;
    
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function abrirModalParaEditar(lancamento) {
    if (!lancamento) {
        console.error('Falha ao tentar editar: objeto de lançamento não encontrado.');
        return;
    }
    
    if (!modalTitulo || !btnSalvar || !form || !inputData || !modal) {
        console.error('Elementos do modal não foram encontrados.');
        return;
    }
    
    currentEditingId = lancamento.id;
    modalTitulo.textContent = 'Editar Lançamento';
    btnSalvar.textContent = 'Atualizar Lançamento';
    
    const categoriaMapInverso = {
        'Vendas (Salão)': 'sales', 'Recebíveis Extras': 'extra',
        'Mercado': 'market', 'Compras': 'purchases', 'Pessoal': 'staff',
        'Utilidades': 'utilities', 'Manutenção': 'maintenance', 'Impostos': 'taxes',
        'Investimentos': 'investments', 'Açougue': 'butchery', 'Contas/Boletos': 'bills',
        'Outros': 'other'
    };
    
    const metodoMapInverso = {
        'Dinheiro': 'cash', 'Cartão': 'card', 'Pix': 'pix', 'Transferência': 'transfer', 
        'Boleto': 'bill', 'Cartão + Pix': 'card-pix', 'Outro': 'other'
    };
    
    // Preencher formulário
    form.elements['tipo'].value = lancamento.tipo === 'Entrada' ? 'Entrada' : 'Saída';
    inputData.value = lancamento.data_input || formatarDataParaInput(new Date(lancamento.data));
    form.elements['form-valor'].value = lancamento.valor || '';
    form.elements['form-descricao'].value = lancamento.descricao || '';
    form.elements['form-categoria'].value = categoriaMapInverso[lancamento.categoria] || 'other';
    form.elements['form-metodo'].value = metodoMapInverso[lancamento.metodo_pagamento] || 'other';
    
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function fecharModal() {
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
    if (editUserModal) {
        editUserModal.classList.remove('show');
    }
}

async function salvarLancamento(event) {
    event.preventDefault();
    
    const lancamento = {
        tipo: form.elements['tipo'].value,
        data: inputData.value,
        valor: parseFloat(form.elements['form-valor'].value),
        descricao: form.elements['form-descricao'].value.trim(),
        categoria: form.elements['form-categoria'].value,
        metodo_pagamento: form.elements['form-metodo'].value
    };
    
    // Validação
    const errors = validarLancamento(lancamento);
    if (errors.length > 0) {
        alert('Por favor, corrija os seguintes erros:\n\n• ' + errors.join('\n• '));
        return;
    }
    
    let url, method;
    if (currentEditingId) {
        url = `${API_URL}/lancamento/${currentEditingId}`;
        method = 'PUT';
    } else {
        url = `${API_URL}/lancamento`;
        method = 'POST';
    }
    
    document.body.style.cursor = 'wait';
    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando...';
    
    try {
        const response = await fetchWithAuth(url, {
            method: method,
            body: JSON.stringify(lancamento)
        });
        
        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Falha ao salvar');
        }
        
        fecharModal();
        await atualizarDashboard(); // Atualizar dados
        
    } catch (error) {
        console.error('Erro ao salvar lançamento:', error);
        alert('Erro ao salvar lançamento: ' + error.message);
    } finally {
        document.body.style.cursor = 'default';
        btnSalvar.disabled = false;
        btnSalvar.textContent = currentEditingId ? 'Atualizar Lançamento' : 'Salvar Lançamento';
    }
}

/* * ========================================
 * LÓGICA DE APAGAR (DELETE)
 * ========================================
 */
async function apagarLancamento(id, descricao) {
    const confirmado = confirm(`Tem certeza que deseja apagar o lançamento:\n"${descricao}"?\n\nEsta ação não pode ser desfeita.`);
    if (!confirmado) {
        return;
    }
    
    document.body.style.cursor = 'wait';
    
    try {
        const response = await fetchWithAuth(`${API_URL}/lancamento/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok && response.status !== 204) {
            const erro = await response.json();
            throw new Error(erro.error || 'Falha ao apagar');
        }
        
        await atualizarDashboard(); // Atualizar dados após exclusão
        
    } catch (error) {
        console.error('Erro ao apagar lançamento:', error);
        alert('Erro ao apagar: ' + error.message);
    } finally {
        document.body.style.cursor = 'default';
    }
}

/* * ========================================
 * LÓGICA DE EXPORTAÇÃO (CSV)
 * ========================================
 */
async function exportarDados() {
    const periodoSelecionado = document.getElementById('date-range').value;
    const categoriaSelecionada = document.getElementById('category').value;
    const metodoPagamento = document.getElementById('payment-method').value;
    const dataInicioCustom = document.getElementById('start-date').value;
    const dataFimCustom = document.getElementById('end-date').value;
    const tipo = document.getElementById('filter-tipo').value;
    const descricao = document.getElementById('filter-descricao').value;
    const valorMin = document.getElementById('filter-valor-min').value;
    const valorMax = document.getElementById('filter-valor-max').value;
    
    const params = new URLSearchParams();
    params.append('periodo', periodoSelecionado);
    params.append('categoria', categoriaSelecionada);
    params.append('metodoPagamento', metodoPagamento);
    
    if (periodoSelecionado === 'custom') {
        if (dataInicioCustom) params.append('dataInicio', dataInicioCustom);
        if (dataFimCustom) params.append('dataFim', dataFimCustom);
    }
    
    if (tipo && tipo !== 'all') {
        params.append('tipo', tipo);
    }
    if (descricao) {
        params.append('descricao', descricao);
    }
    if (valorMin) {
        params.append('valorMin', valorMin);
    }
    if (valorMax) {
        params.append('valorMax', valorMax);
    }
    params.append('sortBy', currentSortBy);
    params.append('sortOrder', currentSortOrder);
    
    const queryString = params.toString();
    const url = `${API_URL}/exportar?${queryString}`;
    
    document.body.style.cursor = 'wait';
    
    try {
        const response = await fetchWithAuth(url, {
            method: 'GET'
        });
        
        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Falha ao gerar exportação');
        }
        
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition');
        let nomeArquivo = 'exportacao-financeira.csv';
        
        if (disposition && disposition.includes('filename=')) {
            const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
            if (matches != null && matches[1]) {
                nomeArquivo = matches[1].replace(/['"]/g, '');
            }
        }
        
        const a = document.createElement('a');
        const objectUrl = window.URL.createObjectURL(blob);
        a.href = objectUrl;
        a.download = nomeArquivo;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(objectUrl);
        
    } catch (error) {
        console.error('Erro ao tentar iniciar a exportação:', error);
        alert('Não foi possível iniciar a exportação: ' + error.message);
    } finally {
        document.body.style.cursor = 'default';
    }
}

/* * ========================================
 * LÓGICA DE ORDENAÇÃO
 * ========================================
 */
function handleSortHeaderClick(event) {
    const newSortBy = event.currentTarget.dataset.sort;
    if (newSortBy === currentSortBy) {
        currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc';
    } else {
        currentSortBy = newSortBy;
        currentSortOrder = 'desc';
    }
    atualizarDashboard();
}

function updateSortVisuals() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.classList.remove('sort-active', 'sort-asc', 'sort-desc');
        if (th.dataset.sort === currentSortBy) {
            th.classList.add('sort-active');
            th.classList.add(currentSortOrder === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

/* * ========================================
 * LÓGICA DE LOGOUT
 * ========================================
 */
function handleLogout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
}

/* * ========================================
 * FUNÇÕES DA PÁGINA "MEU PERFIL"
 * ========================================
 */
function carregarInfoPerfil() {
    try {
        const usuarioString = localStorage.getItem('usuario');
        if (usuarioString) {
            const usuario = JSON.parse(usuarioString);
            document.getElementById('perfil-info-nome').value = usuario.nome || '';
            document.getElementById('perfil-info-email').value = usuario.email || '';
            document.getElementById('perfil-info-role').value = usuario.role === 'admin' ? 'Administrador' : 'Usuário Simples';
        }
    } catch (e) {
        console.error("Erro ao carregar informações do perfil:", e);
    }
}

async function handleAlterarSenha(event) {
    event.preventDefault();
    
    const senhaAtual = document.getElementById('perfil-senha-atual').value;
    const novaSenha = document.getElementById('perfil-nova-senha').value;
    const confirmaSenha = document.getElementById('perfil-confirma-senha').value;
    
    const btn = document.getElementById('perfil-save-btn');
    const messageEl = document.getElementById('perfil-message');
    
    messageEl.textContent = '';
    messageEl.className = 'admin-message';

    // Validação
    if (novaSenha !== confirmaSenha) {
        messageEl.textContent = 'A "Nova Senha" e a "Confirmação" não conferem.';
        messageEl.classList.add('error');
        return;
    }
    
    const erroSenha = validarSenha(novaSenha);
    if (erroSenha) {
        messageEl.textContent = erroSenha;
        messageEl.classList.add('error');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Alterando...';

    try {
        const response = await fetchWithAuth(`${API_URL}/perfil/alterar-senha`, {
            method: 'POST',
            body: JSON.stringify({ senhaAtual, novaSenha })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Falha ao alterar a senha.');
        }
        
        // Sucesso
        messageEl.textContent = 'Senha alterada com sucesso! Você será desconectado.';
        messageEl.classList.add('success');
        
        // Força o logout por segurança
        setTimeout(() => {
            handleLogout();
        }, 2500);

    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        messageEl.textContent = error.message;
        messageEl.classList.add('error');
        btn.disabled = false;
        btn.textContent = 'Alterar Senha';
    }
}

/* * ========================================
 * FUNÇÕES DA PÁGINA DE ADMIN
 * ========================================
 */
async function carregarUsuarios() {
    const tbody = document.getElementById('admin-user-list-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
    window.usuariosGlobais = {};
    
    const editIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    const resetIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L20.49 2M3.51 22a9 9 0 0 1-2.85-13.35"></path></svg>`;
    const trashIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
    
    try {
        const response = await fetchWithAuth(`${API_URL}/usuarios`, {
            method: 'GET'
        });
        
        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Falha ao carregar usuários');
        }
        
        const usuarios = await response.json();
        tbody.innerHTML = '';
        
        if (!usuarios || usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">Nenhum usuário encontrado.</td></tr>';
            return;
        }
        
        usuarios.forEach(user => {
            const userKey = `user_${user.id}`;
            window.usuariosGlobais[userKey] = user;
            
            const tr = document.createElement('tr');
            const dataFormatada = user.created_at ? 
                new Date(user.created_at).toLocaleDateString('pt-BR') : 'N/A';
            
            tr.innerHTML = `
                <td>${user.nome || 'N/A'}</td>
                <td>${user.email || 'N/A'}</td>
                <td>${user.role === 'admin' ? 'Administrador' : 'Usuário Simples'}</td>
                <td>${dataFormatada}</td>
                <td style="white-space: nowrap;">
                    <button class="btn-edit" onclick="abrirModalEditarUsuario(window.usuariosGlobais['${userKey}'])" title="Editar Usuário">${editIconSvg}</button>
                    <button class="btn-edit" style="color: var(--warning);" onclick="handleResetSenha('${user.id}', '${(user.nome || '').replace(/'/g, "\\'")}')" title="Resetar Senha do Usuário">${resetIconSvg}</button>
                    <button class="btn-delete" onclick="handleDeleteUsuario('${user.id}', '${(user.nome || '').replace(/'/g, "\\'")}')" title="DELETAR Usuário">${trashIconSvg}</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        tbody.innerHTML = `<tr><td colspan="5" style="color: var(--danger);">${error.message}</td></tr>`;
    }
}

function abrirModalEditarUsuario(usuario) {
    if (!usuario) {
        console.error('Dados do usuário não encontrados para edição.');
        return;
    }
    
    editUserId.value = usuario.id;
    document.getElementById('edit-user-nome').value = usuario.nome || '';
    document.getElementById('edit-user-email').value = usuario.email || '';
    document.getElementById('edit-user-role').value = usuario.role || 'simples';
    
    editUserMessageEl.textContent = '';
    editUserMessageEl.className = 'admin-message';
    editUserModal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

async function handleSalvarEdicaoUsuario(event) {
    event.preventDefault();
    
    const id = editUserId.value;
    const nome = document.getElementById('edit-user-nome').value.trim();
    const email = document.getElementById('edit-user-email').value.trim();
    const role = document.getElementById('edit-user-role').value;
    
    if (!nome || !email) {
        editUserMessageEl.textContent = 'Nome e email são obrigatórios.';
        editUserMessageEl.classList.add('error');
        return;
    }
    
    editUserSaveBtn.disabled = true;
    editUserSaveBtn.textContent = 'Salvando...';
    editUserMessageEl.textContent = '';
    editUserMessageEl.className = 'admin-message';
    
    try {
        const response = await fetchWithAuth(`${API_URL}/usuarios/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ nome, email, role })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Falha ao salvar as alterações.');
        }
        
        editUserMessageEl.textContent = 'Usuário atualizado com sucesso!';
        editUserMessageEl.classList.add('success');
        
        await carregarUsuarios();
        
        setTimeout(() => {
            editUserModal.classList.remove('show');
            document.body.style.overflow = 'auto';
        }, 1500);
        
    } catch (error) {
        console.error('Erro ao salvar usuário:', error);
        editUserMessageEl.textContent = error.message;
        editUserMessageEl.classList.add('error');
    } finally {
        editUserSaveBtn.disabled = false;
        editUserSaveBtn.textContent = 'Salvar Alterações';
    }
}

async function handleResetSenha(userId, userName) {
    const novaSenha = prompt(`Digite a NOVA senha provisória para o usuário "${userName}":`);
    if (!novaSenha || novaSenha.trim() === '') {
        alert('Reset de senha cancelado.');
        return;
    }
    
    const erroSenha = validarSenha(novaSenha);
    if (erroSenha) {
        alert(erroSenha);
        return;
    }
    
    const confirmacao = prompt(`Confirme a NOVA senha provisória:`);
    if (novaSenha !== confirmacao) {
        alert('As senhas não conferem. Operação cancelada.');
        return;
    }
    
    document.body.style.cursor = 'wait';
    
    try {
        const response = await fetchWithAuth(`${API_URL}/usuarios/admin-reset-senha`, {
            method: 'POST',
            body: JSON.stringify({ userId, novaSenha })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Falha ao resetar a senha.');
        }
        
        alert(`Sucesso! A senha do usuário "${userName}" foi resetada.`);
        
    } catch (error) {
        console.error('Erro ao resetar senha:', error);
        alert('Erro: ' + error.message);
    } finally {
        document.body.style.cursor = 'default';
    }
}

async function handleDeleteUsuario(userId, userName) {
    const confirmacao = prompt(`ATENÇÃO: Esta ação é irreversível.\n\nPara confirmar a exclusão do usuário "${userName}", digite "DELETAR" abaixo:`);
    if (confirmacao !== "DELETAR") {
        alert('Exclusão cancelada.');
        return;
    }
    
    document.body.style.cursor = 'wait';
    
    try {
        const response = await fetchWithAuth(`${API_URL}/usuarios/${userId}`, {
            method: 'DELETE'
        });
        
        if (response.status === 204) {
            alert('Usuário deletado com sucesso.');
            await carregarUsuarios();
        } else {
            const data = await response.json();
            throw new Error(data.error || 'Falha ao deletar usuário.');
        }
        
    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        alert('Erro: ' + error.message);
    } finally {
        document.body.style.cursor = 'default';
    }
}

async function handleRegistroAdmin(event) {
    event.preventDefault();
    
    const nome = document.getElementById('admin-nome').value.trim();
    const email = document.getElementById('admin-email').value.trim();
    const senha = document.getElementById('admin-senha').value;
    
    const btn = document.getElementById('admin-register-btn');
    const messageEl = document.getElementById('admin-register-message');
    
    btn.disabled = true;
    btn.textContent = 'Registrando...';
    messageEl.textContent = '';
    messageEl.className = 'admin-message';
    
    // Validação
    if (!nome || !email || !senha) {
        messageEl.textContent = 'Todos os campos são obrigatórios.';
        messageEl.classList.add('error');
        btn.disabled = false;
        btn.textContent = 'Registrar Usuário';
        return;
    }
    
    const erroSenha = validarSenha(senha);
    if (erroSenha) {
        messageEl.textContent = erroSenha;
        messageEl.classList.add('error');
        btn.disabled = false;
        btn.textContent = 'Registrar Usuário';
        return;
    }
    
    try {
        const response = await fetchWithAuth(`${API_URL}/registrar`, {
            method: 'POST',
            body: JSON.stringify({ nome, email, senha })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Falha ao registrar usuário');
        }
        
        messageEl.textContent = 'Usuário registrado com sucesso!';
        messageEl.classList.add('success');
        document.getElementById('admin-register-form').reset();
        
        await carregarUsuarios();
        
    } catch (error) {
        console.error('Erro no registro de admin:', error);
        messageEl.textContent = error.message;
        messageEl.classList.add('error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Registrar Usuário';
    }
}

/* * ========================================
 * INICIALIZAÇÃO E EVENT LISTENERS
 * ========================================
 */
document.addEventListener('DOMContentLoaded', () => {
    // Verificar permissões de admin
    try {
        const usuarioString = localStorage.getItem('usuario');
        if (usuarioString) {
            const usuario = JSON.parse(usuarioString);
            if (usuario && usuario.role === 'admin') {
                const adminLink = document.getElementById('nav-link-admin-li');
                if (adminLink) {
                    adminLink.style.display = 'block';
                }
            }
        }
    } catch (e) {
        console.error("Erro ao verificar permissões de admin:", e);
    }

    // Definir variáveis do DOM
    modal = document.getElementById('entry-modal');
    btnAbrirModal = document.getElementById('add-entry-btn');
    btnFecharModal = document.getElementById('close-modal-btn');
    btnCancelar = document.getElementById('cancel-btn');
    form = document.getElementById('entry-form');
    inputData = document.getElementById('form-data');
    modalTitulo = document.getElementById('modal-title');
    btnSalvar = document.getElementById('save-btn');
    
    editUserModal = document.getElementById('edit-user-modal');
    editUserForm = document.getElementById('edit-user-form');
    editUserSaveBtn = document.getElementById('edit-user-save-btn');
    editUserCancelBtn = document.getElementById('edit-user-cancel-btn');
    editUserCloseModalBtn = document.getElementById('edit-user-close-modal-btn');
    editUserId = document.getElementById('edit-user-id');
    editUserMessageEl = document.getElementById('edit-user-message');
    
    const perfilPage = document.getElementById('perfil-page-content');
    const perfilForm = document.getElementById('perfil-change-password-form');
    const navLinkPerfil = document.getElementById('nav-link-perfil');
    const navLinkPerfilLi = document.getElementById('nav-link-perfil-li');
    
    const dashboardPage = document.getElementById('dashboard-page-content');
    const adminPage = document.getElementById('admin-page-content');
    const navLinkDashboard = document.getElementById('nav-link-dashboard');
    const navLinkAdmin = document.getElementById('nav-link-admin');
    const navLinkAdminLi = document.getElementById('nav-link-admin-li');
    const navLinkDashboardLi = document.getElementById('nav-link-dashboard-li');
    
    const adminRegisterForm = document.getElementById('admin-register-form');

    // Atualizar data atual
    const dateElement = document.getElementById('current-date');
    if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString('pt-BR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Event Listeners para filtros
    document.getElementById('date-range').addEventListener('change', function() {
        const customDates = document.querySelectorAll('.custom-dates');
        if (this.value === 'custom') {
            customDates.forEach(el => el.style.display = 'flex');
            
            // Preencher datas padrão para o período personalizado
            const hoje = new Date();
            const umaSemanaAtras = new Date(hoje);
            umaSemanaAtras.setDate(hoje.getDate() - 7);
            
            document.getElementById('start-date').value = formatarDataParaInput(umaSemanaAtras);
            document.getElementById('end-date').value = formatarDataParaInput(hoje);
        } else {
            customDates.forEach(el => el.style.display = 'none');
        }
    });

    document.getElementById('apply-filters').addEventListener('click', function() {
        atualizarDashboard();
    });

    // Event Listeners para exportação
    const btnExportar = document.getElementById('export-btn');
    if (btnExportar) {
        btnExportar.addEventListener('click', exportarDados);
    }

    // Event Listeners para modal de lançamentos
    if (btnAbrirModal) btnAbrirModal.addEventListener('click', abrirModal);
    if (btnFecharModal) btnFecharModal.addEventListener('click', fecharModal);
    if (btnCancelar) btnCancelar.addEventListener('click', fecharModal);
    
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            fecharModal();
        }
        if (event.target === editUserModal) {
            editUserModal.classList.remove('show');
            document.body.style.overflow = 'auto';
        }
    });

    if (form) form.addEventListener('submit', salvarLancamento);

    // Event Listeners para modal de usuários
    if (editUserForm) {
        editUserForm.addEventListener('submit', handleSalvarEdicaoUsuario);
    }
    if (editUserCloseModalBtn) {
        editUserCloseModalBtn.addEventListener('click', () => {
            editUserModal.classList.remove('show');
            document.body.style.overflow = 'auto';
        });
    }
    if (editUserCancelBtn) {
        editUserCancelBtn.addEventListener('click', () => {
            editUserModal.classList.remove('show');
            document.body.style.overflow = 'auto';
        });
    }

    // Event Listeners para navegação
    if (navLinkDashboard) {
        navLinkDashboard.addEventListener('click', (e) => {
            e.preventDefault();
            adminPage.classList.add('page-hidden');
            perfilPage.classList.add('page-hidden');
            dashboardPage.classList.remove('page-hidden');

            navLinkAdminLi.classList.remove('active');
            navLinkPerfilLi.classList.remove('active');
            navLinkDashboardLi.classList.add('active');
        });
    }

    if (navLinkAdmin) {
        navLinkAdmin.addEventListener('click', (e) => {
            e.preventDefault();
            dashboardPage.classList.add('page-hidden');
            perfilPage.classList.add('page-hidden');
            adminPage.classList.remove('page-hidden');

            navLinkDashboardLi.classList.remove('active');
            navLinkPerfilLi.classList.remove('active');
            navLinkAdminLi.classList.add('active');

            carregarUsuarios();
        });
    }

    if (navLinkPerfil) {
        navLinkPerfil.addEventListener('click', (e) => {
            e.preventDefault();
            dashboardPage.classList.add('page-hidden');
            adminPage.classList.add('page-hidden');
            perfilPage.classList.remove('page-hidden');

            navLinkDashboardLi.classList.remove('active');
            navLinkAdminLi.classList.remove('active');
            navLinkPerfilLi.classList.add('active');

            carregarInfoPerfil();
        });
    }

    // Event Listeners para formulários
    if (perfilForm) {
        perfilForm.addEventListener('submit', handleAlterarSenha);
    }

    if (adminRegisterForm) {
        adminRegisterForm.addEventListener('submit', handleRegistroAdmin);
    }

    // Event Listeners para ordenação
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', handleSortHeaderClick);
    });

    // Event Listener para logout
    const btnLogout = document.getElementById('logout-btn');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Tem certeza que deseja sair?')) {
                handleLogout();
            }
        });
    }

    // Inicialização dos gráficos
    const cashFlowCtx = document.getElementById('cashFlowChart');
    const expensesCtx = document.getElementById('expensesChart');
    
    if (cashFlowCtx) {
        cashFlowChart = new Chart(cashFlowCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Entradas',
                        data: [],
                        borderColor: 'rgba(46, 204, 113, 1)',
                        backgroundColor: 'rgba(46, 204, 113, 0.1)',
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'Saídas',
                        data: [],
                        borderColor: 'rgba(231, 76, 60, 1)',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'Saldo em Caixa',
                        data: [],
                        borderColor: 'rgba(52, 152, 219, 1)',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        tension: 0.3,
                        fill: false,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${formatarMoeda(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return formatarMoeda(value);
                            }
                        }
                    }
                }
            }
        });
    }

    if (expensesCtx) {
        expensesChart = new Chart(expensesCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Despesas',
                    data: [],
                    backgroundColor: []
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const valor = context.raw || 0;
                                return `${label}: ${formatarMoeda(valor)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatarMoeda(value);
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Carga inicial dos dados
    atualizarDashboard();
});