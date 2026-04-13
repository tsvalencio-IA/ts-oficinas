/**
 * JARVIS ERP V2 — os.js
 * Gestão de Ordens de Serviço, Kanban, Cloudinary e Auditoria (Timeline)
 * Integrado à estrutura window.J
 */

'use strict';

// ============================================================
// 1. RENDERIZAÇÃO DO KANBAN (PÁTIO)
// ============================================================
window.renderKanban = function() {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;

    // Definição das colunas do fluxo Evolution
    const colunas = [
        { id: 'Agendado', nome: '📅 Agendado' },
        { id: 'Em Pátio', nome: '🚗 Em Pátio' },
        { id: 'Diagnóstico', nome: '🔍 Diagnóstico' },
        { id: 'Aguardando Aprovação', nome: '⏳ Aguardando Aprovação' },
        { id: 'Aprovado', nome: '✅ Aprovado' },
        { id: 'Em Execução', nome: '⚙️ Em Execução' },
        { id: 'Pronto', nome: '🏁 Pronto' },
        { id: 'Faturado', nome: '💰 Faturado' },
        { id: 'Finalizado', nome: '📦 Finalizado / Entregue' }
    ];

    let html = '';
    colunas.forEach(col => {
        const ordens = J.os.filter(o => o.status === col.id).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        
        html += `
            <div class="kanban-col" data-status="${col.id}" ondragover="allowDrop(event)" ondrop="drop(event, '${col.id}')">
                <div class="kanban-header">
                    <strong>${col.nome}</strong>
                    <span class="badge">${ordens.length}</span>
                </div>
                <div class="kanban-list">
                    ${ordens.map(os => _gerarCardOS(os)).join('')}
                </div>
            </div>
        `;
    });

    board.innerHTML = html;
};

function _gerarCardOS(os) {
    // Alerta de LED se estiver atrasada ou muito tempo no mesmo status
    const dias = Math.floor((new Date() - new Date(os.updatedAt || os.createdAt)) / (1000 * 60 * 60 * 24));
    const isAtrasado = (os.status === 'Aguardando Aprovação' || os.status === 'Em Execução') && dias > 2;

    return `
        <div class="os-card" draggable="true" ondragstart="drag(event, '${os.id}')" onclick="abrirModalOS('${os.id}')">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="os-number">#${os.numero || os.id.substring(0,6).toUpperCase()}</span>
                ${isAtrasado ? '<div class="led-alert" title="Atenção: OS parada há mais de 2 dias!"></div>' : ''}
            </div>
            <div class="os-client">👤 ${os.clienteNome || 'Cliente não informado'}</div>
            <div class="os-vehicle">🚗 ${os.veiculoModelo || 'Veículo genérico'} (${os.veiculoPlaca || 'S/ Placa'})</div>
            <div class="os-total">${moeda(os.total || 0)}</div>
        </div>
    `;
}

// ============================================================
// 2. DRAG & DROP (MOVER CARTÕES)
// ============================================================
window.allowDrop = function(ev) { ev.preventDefault(); };

window.drag = function(ev, id) { ev.dataTransfer.setData("text", id); };

window.drop = async function(ev, novoStatus) {
    ev.preventDefault();
    const osId = ev.dataTransfer.getData("text");
    const os = J.os.find(o => o.id === osId);
    
    if (!os || os.status === novoStatus) return;

    try {
        await J.db.collection('ordens_servico').doc(osId).update({
            status: novoStatus,
            updatedAt: dtISO(),
            auditoria: firebase.firestore.FieldValue.arrayUnion({
                data: dtISO(),
                usuario: J.nome,
                acao: `Status alterado de "${os.status}" para "${novoStatus}"`
            })
        });
        toastOk(`O.S. #${os.numero} movida para ${novoStatus}`);
    } catch (e) {
        toastErr("Erro ao mover O.S.");
        console.error(e);
    }
};

// ============================================================
// 3. CLOUDINARY: UPLOAD DE FOTOS (LAUDO)
// ============================================================
window.uploadImagemCloudinary = async function(file, osId) {
    if (!file) return;
    
    const cloudName = J.cloudName || 'dmuvm1o6m'; // Fallback
    const uploadPreset = J.cloudPreset || 'evolution'; // Fallback
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    try {
        setLoading('btnUploadFoto', true, 'A enviar...');
        
        const res = await fetch(url, { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.secure_url) {
            // Salvar link da imagem na OS no Firebase
            await J.db.collection('ordens_servico').doc(osId).update({
                fotos: firebase.firestore.FieldValue.arrayUnion({
                    url: data.secure_url,
                    data: dtISO(),
                    adicionadoPor: J.nome
                }),
                auditoria: firebase.firestore.FieldValue.arrayUnion({
                    data: dtISO(),
                    usuario: J.nome,
                    acao: "Adicionou uma nova foto ao laudo."
                })
            });
            toastOk("Foto anexada com sucesso!");
            if (window.renderGaleriaOS) window.renderGaleriaOS(osId);
        } else {
            throw new Error('Falha no Cloudinary');
        }
    } catch (e) {
        toastErr("Erro ao enviar foto para o servidor.");
        console.error(e);
    } finally {
        setLoading('btnUploadFoto', false, '📷 Anexar Foto');
    }
};

// ============================================================
// 4. MENSAGENS E CHAT (COMUNICAÇÃO COM CLIENTE)
// ============================================================
window.enviarMensagemChat = async function(osId, mensagem) {
    if (!mensagem || mensagem.trim() === '') return;

    try {
        await J.db.collection('mensagens').add({
            tenantId: J.tid,
            osId: osId,
            sender: 'oficina',
            remetenteNome: J.nome,
            texto: mensagem,
            ts: Date.now(),
            dataISO: dtISO(),
            lidaCliente: false
        });

        // Registrar na timeline da OS
        await J.db.collection('ordens_servico').doc(osId).update({
            updatedAt: dtISO()
        });

    } catch (e) {
        toastErr("Erro ao enviar mensagem.");
    }
};

// ============================================================
// 5. SALVAR E CRIAR O.S.
// ============================================================
window.salvarOS = async function(dadosOS) {
    try {
        const isNew = !dadosOS.id;
        const osRef = isNew ? J.db.collection('ordens_servico').doc() : J.db.collection('ordens_servico').doc(dadosOS.id);
        
        const payload = {
            ...dadosOS,
            tenantId: J.tid,
            updatedAt: dtISO()
        };

        if (isNew) {
            payload.createdAt = dtISO();
            // Gerar número curto
            payload.numero = Math.floor(100000 + Math.random() * 900000).toString();
            payload.auditoria = [{
                data: dtISO(),
                usuario: J.nome,
                acao: "O.S. criada no sistema."
            }];
            await osRef.set(payload);
            toastOk("O.S. criada com sucesso!");
        } else {
            payload.auditoria = firebase.firestore.FieldValue.arrayUnion({
                data: dtISO(),
                usuario: J.nome,
                acao: "O.S. atualizada pelo painel."
            });
            await osRef.update(payload);
            toastOk("O.S. atualizada!");
        }
        
        if(window.closeModal) closeModal('modalOS');
    } catch (e) {
        toastErr("Erro ao gravar O.S.");
        console.error(e);
    }
};

// ============================================================
// 6. ABRIR MODAL O.S. (VISUALIZAÇÃO)
// ============================================================
window.abrirModalOS = function(osId = null) {
    // Se não tiver ID, é uma O.S. nova (Limpa os campos)
    if (!osId) {
        _sv('osCliente', '');
        _sv('osVeiculo', '');
        _sv('osDefeito', '');
        if(window.openModal) openModal('modalOS');
        return;
    }

    const os = J.os.find(o => o.id === osId);
    if (!os) return;

    // Preencher dados (Este modal deve existir no seu HTML UI)
    _sv('osCliente', os.clienteId || '');
    _sv('osDefeito', os.defeitoRelatado || '');
    _st('modalOSTitle', `Ordem de Serviço #${os.numero}`);
    
    // Configura o ID no botão de salvar/faturar/foto
    const btnFoto = document.getElementById('btnUploadFotoInput');
    if(btnFoto) {
        btnFoto.onchange = (e) => uploadImagemCloudinary(e.target.files[0], os.id);
    }

    if(window.openModal) openModal('modalOS');
};
