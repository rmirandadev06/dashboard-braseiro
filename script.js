// CONFIGURAÇÃO AUTOMÁTICA DE URL
// Se estiver no seu PC, usa localhost. Se estiver na nuvem, usa o endereço relativo.
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal ? 'http://localhost:3001/api' : '/api';

// --- AUTH & INIT ---
const token = localStorage.getItem('authToken');
let user = null;
try { user = JSON.parse(localStorage.getItem('usuario')); } catch (e) { console.error(e); }

if (!token || !user) {
    if(!window.location.href.includes('login.html')) window.location.href = 'login.html';
} else {
    startApp();
}

// VARIÁVEIS GLOBAIS
let currentEditingId = null;
let lancamentosCache = {}; 
let categoriasCache = [];
let currentPage = 1;
let currentLimit = 50;
let totalPagesEntrada = 1;
let totalPagesSaida = 1;
let chart1 = null;
let chart2 = null;

// --- NOTIFICAÇÕES GIGANTES (TOASTIFY) ---
function notify(msg, type = 'success') {
    const isError = type === 'error';
    Toastify({
        text: msg,
        duration: 4000, 
        gravity: "top", 
        position: "right", 
        stopOnFocus: true,
        style: {
            background: isError ? "#e74c3c" : "#2ecc71", 
            borderRadius: "12px",       // Mais arredondado
            fontWeight: "bold",
            fontSize: "20px",           // Fonte grande
            padding: "30px 40px",       // Caixa gorda
            boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
            minWidth: "300px",
            textAlign: "center"
        },
        onClick: function(){} 
    }).showToast();
}

// --- MODAL DE CONFIRMAÇÃO GIGANTE ---
function showConfirm(title, message, isDanger, callback) {
    const modal = document.getElementById('modal-confirm');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-msg');
    const btnYes = document.getElementById('btn-confirm-yes');
    const btnNo = document.getElementById('btn-confirm-no');

    titleEl.innerText = title;
    msgEl.innerText = message;
    
    btnYes.style.backgroundColor = isDanger ? '#e74c3c' : '#2ecc71';
    btnYes.innerText = isDanger ? 'Confirmar' : 'Confirmar'; 

    modal.classList.add('show');
    modal.style.display = 'flex';

    btnYes.onclick = null;
    btnNo.onclick = null;

    btnYes.onclick = () => {
        modal.classList.remove('show');
        modal.style.display = 'none';
        callback();
    };

    btnNo.onclick = () => {
        modal.classList.remove('show');
        modal.style.display = 'none';
    };
}

function startApp() {
    if (user.role === 'admin') {
        const adminLi = document.getElementById('nav-link-admin-li');
        const logsLi = document.getElementById('nav-link-logs-li');
        if(adminLi) adminLi.style.display = 'block';
        if(logsLi) logsLi.style.display = 'block';
    }

    setupNav('nav-link-dashboard-li', 'page-dashboard', loadDashboard);
    setupNav('nav-link-perfil-li', 'page-perfil', loadPerfil);
    setupNav('nav-link-admin-li', 'page-admin', loadUsers);
    setupNav('nav-link-logs-li', 'page-logs', loadLogs);

    const btnLogout = document.getElementById('btn-logout');
    if(btnLogout) btnLogout.onclick = () => { localStorage.clear(); window.location.href='login.html'; };
    
    // Modal Lançamento
    const modal = document.getElementById('modal-lanc');
    const btnNovo = document.getElementById('btn-novo-lanc');
    if(btnNovo && modal) {
        btnNovo.onclick = () => {
            currentEditingId = null; 
            document.getElementById('modal-title').innerText = "Adicionar Novo Lançamento";
            document.getElementById('form-lanc').reset();
            document.querySelectorAll('input[name="tipo"]').forEach(r => r.checked = false);
            document.getElementById('m-data').value = new Date().toISOString().split('T')[0];
            filterCatModal(null);
            const container = document.getElementById('payment-rows-container');
            if(container) { container.innerHTML = ''; addPaymentRow(); updateTotalDisplay(); }
            modal.classList.add('show'); modal.style.display = 'flex';
        };
        document.getElementById('btn-close-modal').onclick = () => { modal.classList.remove('show'); modal.style.display = 'none'; };
        document.getElementById('btn-cancel-modal').onclick = () => { modal.classList.remove('show'); modal.style.display = 'none'; };
        document.getElementById('form-lanc').onsubmit = saveLancamento;
        document.getElementsByName('tipo').forEach(r => r.onchange = () => filterCatModal(r.value));
        const btnAddRow = document.getElementById('btn-add-payment-row');
        if(btnAddRow) btnAddRow.onclick = () => addPaymentRow();
    }

    // Modal Categorias
    const catModal = document.getElementById('modal-new-cat');
    const btnAddCat = document.getElementById('btn-add-cat');
    if(btnAddCat && catModal) {
        btnAddCat.onclick = () => { catModal.classList.add('show'); catModal.style.display = 'flex'; renderCatListInModal(); };
        document.getElementById('btn-close-cat').onclick = () => { catModal.classList.remove('show'); catModal.style.display = 'none'; };
        document.getElementById('form-new-cat').onsubmit = saveCategoria;
    }

    // Dashboard
    const btnAtualizar = document.getElementById('btn-atualizar');
    if(btnAtualizar) btnAtualizar.onclick = () => { currentPage = 1; loadDashboard(); };
    
    // ATENÇÃO: Aqui conectamos a nova função de exportar
    const btnExportar = document.getElementById('btn-exportar');
    if(btnExportar) btnExportar.onclick = exportCSV;
    
    const btnPdf = document.getElementById('btn-pdf');
    if(btnPdf) btnPdf.onclick = exportPDF;
    
    const selectLimit = document.getElementById('items-per-page');
    if(selectLimit) {
        selectLimit.onchange = (e) => { currentLimit = parseInt(e.target.value); currentPage = 1; loadDashboard(); };
    }
    const btnPrev = document.getElementById('btn-prev-page');
    if(btnPrev) btnPrev.onclick = () => { if(currentPage > 1) { currentPage--; loadDashboard(); } };
    const btnNext = document.getElementById('btn-next-page');
    if(btnNext) btnNext.onclick = () => { const maxPages = Math.max(totalPagesEntrada, totalPagesSaida); if(currentPage < maxPages) { currentPage++; loadDashboard(); } };

    const filtroPeriodo = document.getElementById('filtro-periodo');
    if(filtroPeriodo) {
        filtroPeriodo.onchange = (e) => {
            const displayMode = e.target.value === 'custom' ? 'flex' : 'none';
            document.querySelectorAll('.custom-dates').forEach(el => el.style.display = displayMode);
        };
    }

    // Forms
    const formSenha = document.getElementById('form-senha'); if(formSenha) formSenha.onsubmit = changePass;
    const formUser = document.getElementById('form-user'); if(formUser) formUser.onsubmit = registerUser;
    const btnFilterLogs = document.getElementById('btn-filter-logs'); if(btnFilterLogs) btnFilterLogs.onclick = loadLogs;

    const editModal = document.getElementById('edit-user-modal');
    if(editModal) {
        document.getElementById('edit-user-close-modal-btn').onclick = () => { editModal.classList.remove('show'); editModal.style.display = 'none'; };
        document.getElementById('edit-user-cancel-btn').onclick = () => { editModal.classList.remove('show'); editModal.style.display = 'none'; };
        document.getElementById('edit-user-save-btn').onclick = saveEditUser;
    }

    setTimeout(() => { initCharts(); carregarCategorias(); loadDashboard(); }, 100);
}

// --- API ---
async function fetchAPI(url, opts = {}) {
    try {
        const res = await fetch(API_URL + url, {
            ...opts,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401 || res.status === 403) { localStorage.clear(); window.location.href = 'login.html'; return null; }
        return res;
    } catch (e) { console.error('Erro Rede:', e); notify('Erro de conexão', 'error'); return null; }
}

// --- EXPORT PDF ---
async function exportPDF() {
    const { jsPDF } = window.jspdf; const doc = new jsPDF(); 
    const primaryColor = [44, 62, 80]; const greenColor = [46, 204, 113]; const redColor = [231, 76, 60];      
    const logoImg = document.getElementById('footer-logo');
    let startY = 15;
    if (logoImg && logoImg.complete) {
        try {
            const canvas = document.createElement("canvas"); canvas.width = logoImg.naturalWidth; canvas.height = logoImg.naturalHeight;
            const ctx = canvas.getContext("2d"); ctx.drawImage(logoImg, 0, 0); const logoData = canvas.toDataURL("image/png");
            doc.addImage(logoData, 'PNG', 14, 10, 30, (logoImg.naturalHeight * 30) / logoImg.naturalWidth);
            doc.setFontSize(22); doc.setTextColor(...primaryColor); doc.text("Relatório Financeiro", 50, 20);
            doc.setFontSize(14); doc.text("Braseiro Grill", 50, 28);
            doc.setFontSize(10); doc.setTextColor(100); doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 50, 35);
            startY = 45;
        } catch (e) { doc.setFontSize(22); doc.text("Relatório", 14, 20); startY = 40; }
    } else { doc.setFontSize(22); doc.setTextColor(...primaryColor); doc.text("Relatório", 14, 20); startY = 40; }

    let finalY = startY;
    const totalEnt = document.getElementById('kpi-entradas')?.innerText || "0";
    const totalSai = document.getElementById('kpi-saidas')?.innerText || "0";
    const saldo = document.getElementById('kpi-saldo-periodo')?.innerText || "0";

    doc.setFontSize(12); doc.setTextColor(0); doc.text(`Resumo do Período:`, 14, finalY);
    doc.setFontSize(10); doc.setTextColor(...greenColor); doc.text(`Entradas: ${totalEnt}`, 14, finalY + 6);
    doc.setTextColor(...redColor); doc.text(`Saídas: ${totalSai}`, 70, finalY + 6);
    doc.setTextColor(...primaryColor); doc.text(`Saldo: ${saldo}`, 130, finalY + 6);
    finalY += 15;

    const getSharpImage = (chartInstance) => {
        if (!chartInstance) return null;
        const canvas = chartInstance.canvas; const w = canvas.width; const h = canvas.height;
        canvas.width = w * 4; canvas.height = h * 4;
        const anim = chartInstance.options.animation; chartInstance.options.animation = false; chartInstance.resize(); 
        const imgData = canvas.toDataURL('image/png', 1.0);
        canvas.width = w; canvas.height = h; chartInstance.options.animation = anim; chartInstance.resize(); 
        return imgData;
    };

    if (chart1 && chart2) {
        const imgFluxo = getSharpImage(chart1); const imgDesp = getSharpImage(chart2);
        if(imgFluxo) { doc.setFontSize(12); doc.setTextColor(0); doc.text("Fluxo de Caixa", 14, finalY); doc.addImage(imgFluxo, 'PNG', 14, finalY + 2, 180, 70); finalY += 80; }
        if (finalY > 180) { doc.addPage(); finalY = 20; }
        if(imgDesp) { doc.text("Despesas por Categoria", 14, finalY); doc.addImage(imgDesp, 'PNG', 14, finalY + 2, 180, 70); finalY += 80; }
    }

    const getTableData = (tableId) => {
        const table = document.getElementById(tableId); if(!table) return []; const rows = [];
        table.querySelectorAll('tr').forEach(tr => { const rowData = []; tr.querySelectorAll('td').forEach((td, index) => { if (index < 4) rowData.push(td.innerText); }); if (rowData.length > 0) rows.push(rowData); });
        return rows;
    };

    if (finalY > 220) { doc.addPage(); finalY = 20; } else finalY += 10;
    const entradasData = getTableData('tb-entradas');
    if (entradasData.length > 0) { doc.setFontSize(14); doc.setTextColor(...greenColor); doc.text("Entradas", 14, finalY); doc.autoTable({ startY: finalY + 5, head: [['Data', 'Descrição', 'Categoria', 'Valor']], body: entradasData, theme: 'grid', headStyles: { fillColor: greenColor }, styles: { fontSize: 9 }, columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } } }); finalY = doc.lastAutoTable.finalY + 15; }
    
    const saidasData = getTableData('tb-saidas');
    if (saidasData.length > 0) { if (finalY > 250) { doc.addPage(); finalY = 20; } doc.setFontSize(14); doc.setTextColor(...redColor); doc.text("Saídas", 14, finalY); doc.autoTable({ startY: finalY + 5, head: [['Data', 'Descrição', 'Categoria', 'Valor']], body: saidasData, theme: 'grid', headStyles: { fillColor: redColor }, styles: { fontSize: 9 }, columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } } }); }

    doc.save(`relatorio_braseiro_${new Date().toISOString().split('T')[0]}.pdf`);
}

// --- MULTI-PAGAMENTO ---
window.addPaymentRow = function(val = '', method = '') {
    const container = document.getElementById('payment-rows-container');
    if(!container) return;
    const div = document.createElement('div');
    div.className = 'payment-row';
    div.innerHTML = `<input type="number" step="0.01" class="row-val" placeholder="Valor R$" value="${val}" required oninput="updateTotalDisplay()"><select class="row-method" required><option value="cash" ${method==='cash'?'selected':''}>Dinheiro</option><option value="card" ${method==='card'?'selected':''}>Cartão</option><option value="pix" ${method==='pix'?'selected':''}>Pix</option><option value="transfer" ${method==='transfer'?'selected':''}>Transferência</option><option value="bill" ${method==='bill'?'selected':''}>Boleto</option><option value="card-pix" ${method==='card-pix'?'selected':''}>Cartão + Pix</option><option value="other" ${method==='other'?'selected':''}>Outro</option></select><button type="button" class="btn-remove-row" onclick="removePaymentRow(this)" title="Remover">X</button>`;
    container.appendChild(div);
}

window.removePaymentRow = function(btn) {
    const container = document.getElementById('payment-rows-container');
    if(container && container.children.length > 1) { btn.parentElement.remove(); updateTotalDisplay(); } else { notify('Necessário pelo menos um pagamento.', 'error'); }
}

window.updateTotalDisplay = function() {
    let total = 0;
    document.querySelectorAll('.row-val').forEach(inp => { total += parseFloat(inp.value || 0); });
    const display = document.getElementById('m-total-display');
    if(display) display.innerText = total.toLocaleString('pt-BR', {minimumFractionDigits: 2});
}

// --- DASHBOARD ---
async function loadDashboard() {
    const elPeriodo = document.getElementById('filtro-periodo');
    if(!elPeriodo) return; 

    const params = new URLSearchParams({
        periodo: elPeriodo.value,
        tipo: document.getElementById('filter-tipo').value,
        categoria: document.getElementById('category').value,
        metodoPagamento: document.getElementById('payment-method').value,
        descricao: document.getElementById('filter-descricao').value,
        valorMin: document.getElementById('filter-valor-min').value,
        valorMax: document.getElementById('filter-valor-max').value,
        page: currentPage,
        limit: currentLimit
    });

    if(params.get('periodo') === 'custom') {
        params.append('dataInicio', document.getElementById('start-date').value);
        params.append('dataFim', document.getElementById('end-date').value);
    }

    const res = await fetchAPI(`/dados-dashboard?${params}`);
    if (!res) return;
    const data = await res.json();

    const fmt = v => Number(v).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

    const setTxt = (id, val) => { if(document.getElementById(id)) document.getElementById(id).innerText = val; };
    setTxt('kpi-saldo-anterior', fmt(data.kpis?.saldoAnterior || 0));
    setTxt('kpi-saldo-atual', fmt(data.kpis?.saldoAtual || 0));
    setTxt('kpi-entradas', fmt(data.kpis?.totalEntradas || 0));
    setTxt('kpi-saidas', fmt(data.kpis?.totalSaidas || 0));
    setTxt('kpi-saldo-periodo', fmt(data.kpis?.saldoPeriodo || 0));
    
    const mEl = document.getElementById('kpi-margem');
    if(mEl && data.kpis.totalEntradas) {
        const margem = (data.kpis.saldoPeriodo / data.kpis.totalEntradas * 100);
        mEl.innerText = margem.toFixed(1) + '%';
        mEl.style.color = margem >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    lancamentosCache = {}; 
    const row = (l, cls) => {
        lancamentosCache[l.id] = l; 
        return `<tr><td>${l.data_tabela}</td><td>${l.descricao}</td><td>${l.categoria}</td><td class="${cls}">${fmt(l.valor)}</td><td style="white-space:nowrap; text-align:center;"><button class="btn-edit" onclick="editLanc(${l.id})" title="Editar">✏️</button><button class="btn-delete" onclick="delLanc(${l.id})" title="Excluir">❌</button></td></tr>`;
    };

    const tbEnt = document.getElementById('tb-entradas'); const tbSai = document.getElementById('tb-saidas');
    if(tbEnt) tbEnt.innerHTML = data.tabelas?.ultimasEntradas?.map(l => row(l, 'positive')).join('') || '';
    if(tbSai) tbSai.innerHTML = data.tabelas?.ultimasSaidas?.map(l => row(l, 'negative')).join('') || '';

    if (data.tabelas?.pagination) {
        const p = data.tabelas.pagination;
        totalPagesEntrada = Math.ceil(p.totalEntradas / p.perPage) || 1;
        totalPagesSaida = Math.ceil(p.totalSaidas / p.perPage) || 1;
        const maxPages = Math.max(totalPagesEntrada, totalPagesSaida);
        const pageInfo = document.getElementById('page-info');
        if(pageInfo) pageInfo.innerText = `Pág ${currentPage} de ${maxPages}`;
    }

    if(data.graficoFluxoCaixa && data.despesas) updateCharts(data);
}

function updateCharts(data) {
    if (chart1) chart1.destroy();
    if (chart2) chart2.destroy();
    
    const ctx1 = document.getElementById('chart-fluxo');
    if (ctx1) {
        chart1 = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: data.graficoFluxoCaixa.labels,
                datasets: [
                    { label: 'Entradas', data: data.graficoFluxoCaixa.valoresEntradas, borderColor: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.1)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 2.5, pointHoverRadius: 6 },
                    { label: 'Saídas', data: data.graficoFluxoCaixa.valoresSaidas, borderColor: '#e74c3c', backgroundColor: 'rgba(231, 76, 60, 0.1)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 2.5, pointHoverRadius: 6 },
                    { label: 'Saldo em Caixa', data: data.graficoFluxoCaixa.valoresSaldoAcumulado, borderColor: '#3498db', backgroundColor: 'rgba(52, 152, 219, 0.05)', borderWidth: 2, borderDash: [5, 5], tension: 0.4, fill: false, pointRadius: 2.5, pointHoverRadius: 6 }
                ]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'top', labels: { usePointStyle: false, boxWidth: 20, boxHeight: 2 } } },
                scales: { y: { beginAtZero: true, grid: { color: '#f0f0f0' } }, x: { grid: { display: false } } }
            }
        });
    }

    const ctx2 = document.getElementById('chart-desp');
    if (ctx2) {
        const cores = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71', '#e67e22', '#1abc9c', '#34495e', '#7f8c8d', '#c0392b'];
        const bgColors = data.despesas.labels.map((_, i) => cores[i % cores.length]);
        chart2 = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: data.despesas.labels,
                datasets: [{ label: 'Total', data: data.despesas.valores, backgroundColor: bgColors, borderRadius: 4, barThickness: 'flex', maxBarThickness: 30 }]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#f0f0f0' } }, y: { grid: { display: false } } } }
        });
    }
}

// --- CRUD & HELPERS ---
window.editLanc = function(id) {
    const l = lancamentosCache[id];
    if(!l) return;
    currentEditingId = id; 
    const modal = document.getElementById('modal-lanc');
    const title = document.getElementById('modal-title');
    if(title) title.innerText = "Editar Lançamento";
    
    const radios = document.getElementsByName('tipo');
    radios.forEach(r => r.checked = (r.value === l.tipo));
    filterCatModal(l.tipo);
    
    const setVal = (id, v) => { const el = document.getElementById(id); if(el) el.value = v; };
    setVal('m-data', l.data_input);
    setVal('m-desc', l.descricao);
    setVal('m-cat', l.categoria);
    
    const container = document.getElementById('payment-rows-container');
    if(container) { container.innerHTML = ''; addPaymentRow(l.valor, l.metodo_pagamento); updateTotalDisplay(); }
    
    if(modal) { modal.classList.add('show'); modal.style.display = 'flex'; }
};

async function saveLancamento(e) {
    e.preventDefault();
    const tipoEl = document.querySelector('input[name="tipo"]:checked');
    if(!tipoEl) { notify('Selecione Entrada ou Saída', 'error'); return; }

    const commonData = {
        tipo: tipoEl.value,
        data: document.getElementById('m-data').value,
        descricao: document.getElementById('m-desc').value,
        categoria: document.getElementById('m-cat').value
    };

    const rows = document.querySelectorAll('.payment-row');
    const payments = [];
    rows.forEach(r => {
        const val = r.querySelector('.row-val').value;
        const met = r.querySelector('.row-method').value;
        if(val && met) payments.push({ valor: val, metodo_pagamento: met });
    });

    if (payments.length === 0) { notify('Insira pelo menos um valor.', 'error'); return; }

    const isSaida = commonData.tipo === 'Saída';
    const confirmTitle = isSaida ? 'Confirmar SAÍDA?' : 'Confirmar ENTRADA?';
    const confirmMsg = `Deseja salvar ${payments.length} registro(s) no total?`;

    // CHAMA O MODAL PERSONALIZADO
    showConfirm(confirmTitle, confirmMsg, isSaida, async () => {
        if (currentEditingId) {
            const body = { ...commonData, valor: payments[0].valor, metodo_pagamento: payments[0].metodo_pagamento };
            const res = await fetchAPI(`/lancamento/${currentEditingId}`, { method: 'PUT', body: JSON.stringify(body) });
            if(res && res.ok) { closeModalAndRefresh(); notify('Editado com sucesso!'); }
            else notify('Erro ao editar', 'error');
            return;
        }

        let successCount = 0;
        for (let p of payments) {
            const body = { ...commonData, valor: p.valor, metodo_pagamento: p.metodo_pagamento };
            const res = await fetchAPI('/lancamento', { method: 'POST', body: JSON.stringify(body) });
            if (res && res.ok) successCount++;
        }

        if(successCount > 0) { closeModalAndRefresh(); notify(`${successCount} lançamentos salvos!`); }
        else notify('Erro ao salvar.', 'error');
    });
}

function closeModalAndRefresh() {
    const m = document.getElementById('modal-lanc');
    if(m) { m.classList.remove('show'); m.style.display = 'none'; }
    loadDashboard();
}

function filterCatModal(tipo) {
    const sel = document.getElementById('m-cat');
    if(!sel) return;
    if(!tipo) { sel.innerHTML = '<option value="">Selecione o tipo primeiro</option>'; return; }
    const opts = categoriasCache.filter(c => c.tipo === tipo).map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
    sel.innerHTML = opts;
    if (!currentEditingId) sel.value = "";
}

function setupNav(btnId, pageId, cb) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.onclick = (e) => {
        e.preventDefault();
        document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
        document.getElementById(pageId).style.display = 'block';
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        btn.parentElement.classList.add('active');
        if(cb) cb();
    };
}

window.delLanc = async (id) => { 
    showConfirm('Excluir Lançamento', 'Tem certeza que deseja apagar este item?', true, async () => { 
        await fetchAPI(`/lancamento/${id}`, {method:'DELETE'}); 
        notify('Item excluído!', 'error'); 
        loadDashboard(); 
    }); 
};

window.delUser = async (id) => { 
    showConfirm('Excluir Usuário', 'Isso removerá o acesso do usuário. Continuar?', true, async () => { 
        await fetchAPI(`/usuarios/${id}`, {method:'DELETE'}); 
        notify('Usuário removido', 'error'); 
        loadUsers(); 
    }); 
};

window.prepEdit = (id, n, e, r) => {
    const idField = document.getElementById('edit-user-id'); if(idField) idField.value = id;
    const nomeField = document.getElementById('edit-user-nome'); if(nomeField) nomeField.value = n;
    const emailField = document.getElementById('edit-user-email'); if(emailField) emailField.value = e;
    const roleField = document.getElementById('edit-user-role'); if(roleField) roleField.value = r;
    const m = document.getElementById('edit-user-modal'); if(m) { m.classList.add('show'); m.style.display = 'flex'; }
};
async function saveEditUser(e) {
    e.preventDefault();
    const id = document.getElementById('edit-user-id').value;
    const body = { nome: document.getElementById('edit-user-nome').value, email: document.getElementById('edit-user-email').value, role: document.getElementById('edit-user-role').value };
    await fetchAPI(`/usuarios/${id}`, { method:'PUT', body:JSON.stringify(body) });
    const m = document.getElementById('edit-user-modal'); if(m) { m.classList.remove('show'); m.style.display = 'none'; }
    notify('Usuário atualizado'); loadUsers();
}

// --- FUNÇÃO EXPORTAR CSV (ATUALIZADA) ---
function exportCSV() {
    const dataToExport = Object.values(lancamentosCache);
    if (dataToExport.length === 0) { notify("Nenhum dado na tela para exportar.", "error"); return; }

    const headers = ["ID", "Data", "Tipo", "Descrição", "Categoria", "Forma de Pagamento", "Valor (R$)"];
    const rows = dataToExport.map(t => {
        const valorFormatado = parseFloat(t.valor).toFixed(2).replace('.', ',');
        return [
            t.id,
            t.data_tabela, 
            t.tipo,
            `"${t.descricao}"`, 
            t.categoria,
            t.metodo_pagamento || '-',
            valorFormatado
        ].join(';'); 
    });

    const csvContent = "\uFEFF" + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    link.setAttribute("href", url);
    link.setAttribute("download", `Relatorio_Braseiro_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function initCharts() { if(typeof Chart === 'undefined') console.error('Chart.js missing'); }
function loadPerfil() { 
    const elNome = document.getElementById('perf-nome'); if(elNome) elNome.value=user.nome;
    const elEmail = document.getElementById('perf-email'); if(elEmail) elEmail.value=user.email;
    const elRole = document.getElementById('perf-role'); if(elRole) elRole.value=user.role;
}
async function changePass(e) { e.preventDefault(); const res = await fetchAPI('/perfil/alterar-senha', {method:'POST', body:JSON.stringify({senhaAtual:document.getElementById('senha-atual').value, novaSenha:document.getElementById('senha-nova').value})}); if(res&&res.ok){notify('Senha alterada'); document.getElementById('form-senha').reset();} }
async function loadUsers() { const res=await fetchAPI('/usuarios'); if(res){ const l=await res.json(); document.getElementById('tb-users').innerHTML=l.map(u=>`<tr><td>${u.nome}</td><td>${u.email}</td><td>${u.role}</td><td><button class="btn-edit" onclick="prepEdit('${u.id}','${u.nome}','${u.email}','${u.role}')">✏️</button> <button class="btn-delete" onclick="delUser(${u.id})">❌</button></td></tr>`).join(''); }}
async function registerUser(e) { e.preventDefault(); const res=await fetchAPI('/registrar', {method:'POST', body:JSON.stringify({nome:document.getElementById('new-nome').value, email:document.getElementById('new-email').value, senha:document.getElementById('new-senha').value})}); if(res&&res.ok){notify('Usuário criado'); document.getElementById('form-user').reset(); loadUsers();} }
async function loadLogs() { 
    const start = document.getElementById('log-start')?.value; const end = document.getElementById('log-end')?.value; const user = document.getElementById('log-user')?.value;
    const params = new URLSearchParams(); if(start) params.append('startDate', start); if(end) params.append('endDate', end); if(user) params.append('user', user);
    const res = await fetchAPI(`/logs?${params}`); if(!res) return;
    const list = await res.json(); const tbody = document.getElementById('tb-logs'); if(tbody) tbody.innerHTML = list.map(l => `<tr><td>${new Date(l.data).toLocaleString()}</td><td>${l.usuario_nome}</td><td>${l.acao}</td><td>${l.detalhes}</td></tr>`).join('');
}
async function carregarCategorias() { const res = await fetchAPI('/categorias'); if (!res) return; categoriasCache = await res.json(); popularSelects(categoriasCache); }
function popularSelects(cats) { 
    const createOpts = (tipo) => cats.filter(c => c.tipo === tipo).map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
    const htmlEnt = `<optgroup label="Entradas">${createOpts('Entrada')}</optgroup>`; const htmlSai = `<optgroup label="Saídas">${createOpts('Saída')}</optgroup>`;
    const catFilter = document.getElementById('category'); if(catFilter) catFilter.innerHTML = `<option value="all">Todas as Categorias</option>` + htmlEnt + htmlSai;
}
function renderCatListInModal() { 
    const tbody = document.getElementById('cat-list-tbody'); 
    if(tbody) tbody.innerHTML = categoriasCache.map(c => `<tr><td>${c.nome}</td><td>${c.tipo}</td><td style="text-align:center;"><button class="btn-delete" type="button" onclick="deleteCat(${c.id})">❌</button></td></tr>`).join(''); 
}
async function saveCategoria(e) {
    e.preventDefault(); const nome = document.getElementById('new-cat-nome').value; const tipo = document.getElementById('new-cat-tipo').value;
    const res = await fetchAPI('/categorias', { method: 'POST', body: JSON.stringify({ nome, tipo }) });
    if (res && res.ok) { notify('Categoria criada!'); document.getElementById('new-cat-nome').value = ''; await carregarCategorias(); renderCatListInModal(); } else { notify('Erro ao criar.', 'error'); }
}
window.deleteCat = async (id) => { 
    showConfirm('Excluir Categoria', 'Tem certeza? Isso pode afetar lançamentos.', true, async () => { 
        const res = await fetchAPI(`/categorias/${id}`, { method: 'DELETE' }); 
        if (res && res.status === 204) { await carregarCategorias(); renderCatListInModal(); notify('Categoria excluída', 'error'); } 
        else if (res && res.status === 409) { notify('Categoria em uso.', 'error'); } 
        else { notify('Erro ao excluir.', 'error'); } 
    }); 
};