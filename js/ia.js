/**
 * JARVIS ERP V2 — ia.js
 * Inteligência Artificial (Google Gemini) - RAG (Contexto Local)
 * Integrado à estrutura window.J
 */

'use strict';

window.iniciarConsultaJARVIS = async function() {
    // Verifica se existe a chave da API no cadastro da Oficina (Master)
    const apiKey = J.gemini;
    if (!apiKey) {
        return toastErr("Chave de API do Google Gemini não configurada no painel Master.");
    }

    const inputEl = document.getElementById('inputJARVIS');
    const boxIA = document.getElementById('boxRespostaJARVIS');
    if (!inputEl) return;

    const pergunta = inputEl.value.trim();
    if (!pergunta) return;

    // UI de carregamento
    inputEl.value = '';
    if (boxIA) {
        boxIA.style.display = 'block';
        boxIA.innerHTML = '<div class="spinner"></div><p style="margin-top:10px; color:var(--brand)">O JARVIS está a analisar os dados da oficina...</p>';
    } else {
        toastOk("A processar consulta com o JARVIS...");
    }

    try {
        // 1. CONSTRUÇÃO DO CONTEXTO RAG (O Segredo da IA)
        // Pega as últimas 30 O.S. para a IA saber o que está a acontecer no pátio
        const ultimasOS = J.os.slice(0, 30).map(o => ({
            numero: o.numero,
            cliente: o.clienteNome,
            veiculo: o.veiculoModelo,
            status: o.status,
            total: o.total,
            defeito: o.defeitoRelatado
        }));

        const contextoFinanceiro = {
            receitas: J.financeiro.filter(f => f.tipo === 'receita' && f.status === 'pago').reduce((acc, f) => acc + f.valor, 0),
            despesas: J.financeiro.filter(f => f.tipo === 'despesa' && f.status === 'pago').reduce((acc, f) => acc + f.valor, 0)
        };

        const systemInstruction = `
            Você é o JARVIS (Protocolo thIAguinho), o consultor especialista automotivo e gestor sênior desta oficina.
            Aja de forma direta, profissional e proativa.
            
            DADOS REAIS DA OFICINA NESTE EXATO MOMENTO:
            - Nome da Oficina: ${J.tnome}
            - Faturamento Atual: ${moeda(contextoFinanceiro.receitas)}
            - Despesas Atuais: ${moeda(contextoFinanceiro.despesas)}
            - Últimas O.S. ativas: ${JSON.stringify(ultimasOS)}
            
            Regras:
            1. Se perguntarem sobre carros no pátio, responda com base no JSON acima.
            2. Se pedirem diagnósticos técnicos, aja como um Engenheiro Mecânico Master.
            3. Se for sobre finanças, dê conselhos práticos de fluxo de caixa.
            NÃO INVENTE DADOS que não estejam no contexto.
        `;

        // 2. CHAMADA À API DO GEMINI PRO
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: [{ parts: [{ text: pergunta }] }]
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        const respostaTexto = data.candidates[0].content.parts[0].text;

        // 3. EXIBIR RESPOSTA
        if (boxIA) {
            // Converte quebras de linha e negritos para HTML simples
            boxIA.innerHTML = `<div style="text-align: left; line-height: 1.6;">
                <strong style="color:var(--brand)">JARVIS:</strong><br><br>
                ${respostaTexto.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
            </div>`;
        } else {
            alert("JARVIS: \n\n" + respostaTexto);
        }

        // Registo de auditoria
        await audit('JARVIS IA', `Consulta realizada: "${pergunta.substring(0, 30)}..."`);

    } catch (e) {
        console.error(e);
        if (boxIA) {
            boxIA.innerHTML = `<div style="color: #ef4444;">Erro ao contactar o servidor IA. Verifique a chave da API.</div>`;
        } else {
            toastErr("Erro na consulta IA.");
        }
    }
};

// ============================================================
// MODAL JARVIS (UI flutuante)
// ============================================================
window.abrirModalJARVIS = function() {
    let modal = document.getElementById('modalJARVIS');
    if (!modal) {
        // Cria a interface se não existir no HTML
        const html = `
        <div class="modal show" id="modalJARVIS" style="z-index: 9999;">
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>🧠 Consultor JARVIS</h3>
                    <button class="close-btn" onclick="document.getElementById('modalJARVIS').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="color:var(--text-muted); margin-bottom:15px; font-size:0.9rem;">
                        Pergunte sobre diagnósticos técnicos, gestão de estoque ou análise do faturamento atual.
                    </p>
                    <div id="boxRespostaJARVIS" style="display:none; background:var(--bg-body); padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid var(--border); max-height:300px; overflow-y:auto;"></div>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="inputJARVIS" class="input" placeholder="Ex: Quais O.S. estão atrasadas?" onkeydown="if(event.key === 'Enter') iniciarConsultaJARVIS()">
                        <button class="btn btn-brand" onclick="iniciarConsultaJARVIS()">Perguntar</button>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    }
    setTimeout(() => document.getElementById('inputJARVIS').focus(), 100);
};
