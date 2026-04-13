/**
 * JARVIS ERP V2 — financeiro.js
 * Lógica de Finanças, Parcelamento 24x, NFe XML e Comissões
 * Integrado à estrutura window.J
 */

'use strict';

// ============================================================
// 1. FATURAMENTO DE O.S. (PARCELAMENTO 1x A 24x)
// ============================================================
window.faturarOS = async function(osId) {
    const os = J.os.find(o => o.id === osId);
    if (!os) return toastErr("O.S. não encontrada.");

    const numParcelas = parseInt(prompt("Em quantas parcelas deseja faturar? (1 a 24)", "1")) || 1;
    if (numParcelas < 1 || numParcelas > 24) return toastErr("Número de parcelas inválido (1-24).");

    const valorTotal = parseFloat(os.total) || 0;
    const valorParcela = (valorTotal / numParcelas).toFixed(2);
    const dataBase = new Date();

    try {
        setLoading('btnFaturar', true);

        // Loop de geração de parcelas (Lógica Evolution)
        for (let i = 0; i < numParcelas; i++) {
            const vencimento = new Date(dataBase);
            vencimento.setMonth(vencimento.getMonth() + i);

            await J.db.collection('financeiro').add({
                tenantId: J.tid,
                osId: osId,
                clienteId: os.clientId,
                clienteNome: os.clientNome,
                descricao: `O.S. #${os.numero} - Parcela ${i + 1}/${numParcelas}`,
                valor: parseFloat(valorParcela),
                vencimento: vencimento.toISOString(),
                status: 'pendente',
                tipo: 'receita',
                categoria: 'Serviços Automotivos',
                metodo: os.pagamentoMetodo || 'Cartão/Boleto',
                criadoEm: dtISO()
            });
        }

        // Atualiza status da OS
        await J.db.collection('ordens_servico').doc(osId).update({
            status: 'Faturado',
            faturado: true,
            parcelas: numParcelas,
            dataFaturamento: dtISO()
        });

        // Registrar na Auditoria
        await audit('Financeiro', `Faturamento O.S. #${os.numero} em ${numParcelas}x`);
        
        toastOk(`O.S. faturada com sucesso em ${numParcelas}x!`);
        if (window.closeModal) closeModal('modalFaturar');
    } catch (e) {
        console.error(e);
        toastErr("Erro ao faturar O.S.");
    } finally {
        setLoading('btnFaturar', false);
    }
};

// ============================================================
// 2. IMPORTAÇÃO DE XML NFe (SUPRIMENTOS)
// ============================================================
window.importarXMLNFe = async function(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
            
            // Extração de dados básicos (Lógica Evolution)
            const nNF = xmlDoc.getElementsByTagName("nNF")[0]?.textContent;
            const xNomeEmit = xmlDoc.getElementsByTagName("xNome")[0]?.textContent;
            const vNF = xmlDoc.getElementsByTagName("vNF")[0]?.textContent;
            
            if (!nNF || !vNF) throw new Error("XML inválido ou NFe não reconhecida.");

            const confirmar = confirm(`Deseja importar a NFe #${nNF} de ${xNomeEmit} no valor de ${moeda(vNF)}?`);
            if (!confirmar) return;

            // 1. Gerar conta a pagar
            await J.db.collection('financeiro').add({
                tenantId: J.tid,
                descricao: `Compra NFe #${nNF} - Fornecedor: ${xNomeEmit}`,
                valor: parseFloat(vNF),
                vencimento: dtISO(),
                status: 'pendente',
                tipo: 'despesa',
                categoria: 'Compra de Peças/Estoque',
                criadoEm: dtISO()
            });

            // 2. Lógica de Itens (Loop de Produtos do XML)
            const itens = xmlDoc.getElementsByTagName("det");
            for (let i = 0; i < itens.length; i++) {
                const xProd = itens[i].getElementsByTagName("xProd")[0]?.textContent;
                const qCom = itens[i].getElementsByTagName("qCom")[0]?.textContent;
                const vUnCom = itens[i].getElementsByTagName("vUnCom")[0]?.textContent;

                // Adicionar ao estoque ou atualizar
                await J.db.collection('estoqueItems').add({
                    tenantId: J.tid,
                    nome: xProd,
                    quantidade: parseFloat(qCom),
                    precoCusto: parseFloat(vUnCom),
                    nfe: nNF,
                    dataEntrada: dtISO()
                });
            }

            toastOk("NFe importada: Financeiro e Estoque atualizados!");
            await audit('Estoque', `Importação NFe #${nNF} - ${xNomeEmit}`);
        } catch (err) {
            toastErr("Erro ao ler XML: " + err.message);
        }
    };
    reader.readAsText(file);
};

// ============================================================
// 3. CÁLCULO DE COMISSÕES (EQUIPE)
// ============================================================
window.calcComissoes = function() {
    if (!J.os || J.os.length === 0) return;

    const listaComissoes = [];
    
    J.os.filter(os => os.status === 'Faturado' || os.status === 'Finalizado').forEach(os => {
        if (os.servicos && Array.isArray(os.servicos)) {
            os.servicos.forEach(serv => {
                if (serv.mecanicoId) {
                    const mecanico = J.equipe.find(f => f.id === serv.mecanicoId);
                    const percentual = mecanico ? parseFloat(mecanico.comissao || 0) : 0;
                    const valorComissao = (parseFloat(serv.valor) * (percentual / 100));

                    listaComissoes.push({
                        osIn: os.numero,
                        mecanico: mecanico ? mecanico.nome : 'Desconhecido',
                        servico: serv.descricao,
                        valorServico: serv.valor,
                        porcentagem: percentual,
                        ganho: valorComissao,
                        data: os.dataFaturamento || os.updatedAt
                    });
                }
            });
        }
    });

    window.J.comissoesCalculadas = listaComissoes;
    if (window.renderComissoesUI) renderComissoesUI();
};

// ============================================================
// 4. RENDERIZAÇÃO DA TELA FINANCEIRA (DASHBOARD)
// ============================================================
window.renderFinanceiro = function() {
    const container = document.getElementById('listaFinanceiro');
    if (!container) return;

    let html = '';
    const docs = J.financeiro.sort((a, b) => new Date(b.vencimento) - new Date(a.vencimento));

    if (docs.length === 0) {
        html = '<div class="empty-state">Nenhuma transação encontrada.</div>';
    } else {
        docs.forEach(fin => {
            const isReceita = fin.tipo === 'receita';
            html += `
                <div class="fin-card ${fin.status}">
                    <div class="fin-info">
                        <span class="fin-desc">${fin.descricao}</span>
                        <span class="fin-meta">${dtBr(fin.vencimento)} • ${fin.categoria}</span>
                    </div>
                    <div class="fin-values">
                        <span class="fin-val ${isReceita ? 'text-success' : 'text-danger'}">
                            ${isReceita ? '+' : '-'} ${moeda(fin.valor)}
                        </span>
                        <span class="badge badge-${fin.status === 'pago' ? 'success' : 'warn'}">
                            ${fin.status.toUpperCase()}
                        </span>
                    </div>
                    <div class="fin-actions">
                        ${fin.status === 'pendente' ? `
                            <button class="btn btn-sm btn-success" onclick="baixarTitulo('${fin.id}')">Baixar</button>
                        ` : ''}
                        <button class="btn btn-sm btn-ghost" onclick="excluirTitulo('${fin.id}')">🗑️</button>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = html;
    _atualizarResumoFinanceiro();
};

function _atualizarResumoFinanceiro() {
    const receitas = J.financeiro.filter(f => f.tipo === 'receita' && f.status === 'pago').reduce((a, b) => a + b.valor, 0);
    const despesas = J.financeiro.filter(f => f.tipo === 'despesa' && f.status === 'pago').reduce((a, b) => a + b.valor, 0);
    const pendente = J.financeiro.filter(f => f.status === 'pendente').reduce((a, b) => a + b.valor, 0);

    _st('finResumoReceita', moeda(receitas));
    _st('finResumoDespesa', moeda(despesas));
    _st('finResumoSaldo', moeda(receitas - despesas));
    _st('finResumoPendente', moeda(pendente));
}

window.baixarTitulo = async function(id) {
    if (!confirm("Confirmar recebimento/pagamento deste título?")) return;
    try {
        await J.db.collection('financeiro').doc(id).update({
            status: 'pago',
            dataPagamento: dtISO()
        });
        toastOk("Título baixado com sucesso!");
    } catch (e) {
        toastErr("Erro ao baixar título.");
    }
};

window.excluirTitulo = async function(id) {
    if (!confirm("Deseja excluir este lançamento permanentemente?")) return;
    try {
        await J.db.collection('financeiro').doc(id).delete();
        toastOk("Lançamento excluído.");
    } catch (e) {
        toastErr("Erro ao excluir.");
    }
};
