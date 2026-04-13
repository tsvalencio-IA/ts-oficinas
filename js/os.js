/**
 * JARVIS ERP — os.js
 * Ordens de Serviço: CRUD, Kanban, Checklist, Pagamento, Baixa Estoque
 */

'use strict';

// ============================================================
// KANBAN
// ============================================================
window.renderKanban = function() {
  const busca       = (_v('searchOS') || '').toLowerCase();
  const filtroNicho = _v('filtroNichoKanban');
  const statuses    = ['Aguardando','Orcamento','Aprovado','Andamento','Concluido'];
  const cols = {}, cnts = {};
  statuses.forEach(s => { cols[s] = []; cnts[s] = 0; });

  J.os.filter(o => o.status !== 'Cancelado').forEach(o => {
    const v = J.veiculos.find(x => x.id === o.veiculoId);
    const c = J.clientes.find(x => x.id === o.clienteId);
    if (busca && !v?.placa?.toLowerCase().includes(busca) && !c?.nome?.toLowerCase().includes(busca)) return;
    if (filtroNicho && v?.tipo !== filtroNicho) return;
    if (cols[o.status]) { cols[o.status].push({ os: o, v, c }); cnts[o.status]++; }
  });

  const statusClasses = {
    Aguardando: 'card-triagem',
    Orcamento:  'card-orcamento',
    Aprovado:   'card-aprovado',
    Andamento:  'card-servico',
    Concluido:  'card-pronto'
  };

  statuses.forEach(s => {
    const cntEl = _$(`cnt-${s}`); if (cntEl) cntEl.textContent = cnts[s];
    const colEl = _$(`kb-${s}`);  if (!colEl) return;

    if (!cols[s].length) {
      colEl.innerHTML = `<div class="empty-state" style="padding:24px 12px">
        <div style="font-size:1.5rem;margin-bottom:6px">📭</div>
        <div style="font-size:0.72rem;color:var(--text-muted)">Nenhuma O.S.</div>
      </div>`;
      return;
    }

    colEl.innerHTML = cols[s]
      .sort((a, b) => new Date(b.os.updatedAt || 0) - new Date(a.os.updatedAt || 0))
      .map(({ os, v, c }) => {
        const cls = statusClasses[os.status] || '';
        const mec = J.equipe.find(f => f.id === os.mecId);
        return `
          <div class="kanban-card ${cls}" onclick="prepOS('edit','${os.id}');openModal('modalOS')">
            <div class="kanban-card-placa">${v?.placa || 'S/PLACA'}</div>
            <div class="kanban-card-cliente">${c?.nome || '—'}</div>
            <div class="kanban-card-desc">${os.desc || 'Sem descrição'}</div>
            <div class="kanban-card-footer">
              ${badgeTipo(v?.tipo || 'carro')}
              <span class="t-caption">${dtBr(os.data)}</span>
            </div>
            ${os.total ? `<div style="text-align:right;margin-top:7px;font-family:var(--ff-mono);font-size:0.75rem;color:var(--success);font-weight:600">${moeda(os.total)}</div>` : ''}
            ${mec ? `<div style="font-size:0.68rem;color:var(--text-muted);margin-top:3px">🔧 ${mec.nome}</div>` : ''}
          </div>
        `;
      }).join('');
  });
};

window.renderDashboard = function() {
  const agora = new Date();
  const mes = agora.getMonth(), ano = agora.getFullYear();

  // Faturamento do mês
  const fat = J.os
    .filter(o => o.status === 'Concluido' && o.updatedAt)
    .reduce((acc, o) => {
      const d = new Date(o.updatedAt);
      return (d.getMonth() === mes && d.getFullYear() === ano) ? acc + (o.total || 0) : acc;
    }, 0);

  _st('kFat',   moeda(fat));
  _st('kPatio', J.os.filter(o => o.status !== 'Cancelado' && o.status !== 'Concluido').length);
  _st('kStock', J.estoque.filter(p => (p.qtd || 0) <= (p.min || 0)).length);
  const vencidos = J.financeiro.filter(f => f.status === 'Pendente' && f.venc && new Date(f.venc) < agora).length;
  _st('kVenc', vencidos);

  // Últimas 6 OS
  const recent = [...J.os].sort((a, b) => (b.updatedAt || '') > (a.updatedAt || '') ? 1 : -1).slice(0, 6);
  _sh('dashRecentOS', recent.map(o => {
    const v = J.veiculos.find(x => x.id === o.veiculoId);
    const c = J.clientes.find(x => x.id === o.clienteId);
    return `<tr>
      <td><span class="placa">${v?.placa || '—'}</span></td>
      <td>${c?.nome || '—'}</td>
      <td>${badgeStatus(o.status)}</td>
      <td style="font-family:var(--ff-mono);font-weight:700;color:var(--success)">${moeda(o.total)}</td>
    </tr>`;
  }).join('') || tableEmpty(4, '📋', 'Nenhuma O.S. registrada'));

  // Estoque crítico
  const crit = J.estoque.filter(p => (p.qtd || 0) <= (p.min || 0)).slice(0, 5);
  _sh('dashAlertStock', crit.map(p => `<tr class="row-critical">
    <td>${p.desc || p.codigo}</td>
    <td style="font-family:var(--ff-mono);font-weight:700;color:var(--danger)">${p.qtd || 0}</td>
    <td style="font-family:var(--ff-mono);color:var(--text-muted)">${p.min || 0}</td>
    <td>${badgeStatus('Pendente')}</td>
  </tr>`).join('') || tableEmpty(4, '✅', 'Estoque em dia'));

  // Agenda do dia
  const hoje = new Date().toISOString().split('T')[0];
  const agendaHoje = J.agendamentos.filter(a => a.data === hoje && a.status !== 'Convertido');
  _st('kAgenda', agendaHoje.length);
};

// ============================================================
// O.S. — PREP MODAL
// ============================================================
window.prepOS = function(mode, id = null) {
  // Reset todos os campos
  ['osId','osKm','osDiagnostico','osDescricao','osNotasInternas','chkObs',
   'chkPneuDia','chkPneuTra','osMaoObra'].forEach(f => _sv(f, f === 'osMaoObra' ? '0' : ''));

  ['chkPainel','chkPressao','chkCarroceria','chkDocumentos'].forEach(f => _ck(f, false));

  _sv('osStatus', 'Aguardando');
  _sv('osTipoVeiculo', 'carro');
  _sv('osData', new Date().toISOString().split('T')[0]);
  _sv('chkComb', 'N/A');

  _st('osTotalVal', '0,00');
  _sv('osTotalHidden', '0');
  _sh('containerPecasOS', '');
  _sh('osMediaGrid', '');
  _sv('osMediaArray', '[]');
  _sh('osTimeline', '');
  _sv('osTimelineData', '[]');
  _st('osIdBadge', 'NOVA O.S.');

  const btnPDF = _$('btnGerarPDFOS');
  if (btnPDF) btnPDF.classList.add('hidden');
  const areaPgto = _$('areaPgtoOS');
  if (areaPgto) areaPgto.classList.add('hidden');

  popularSelects();

  if (mode === 'edit' && id) {
    const os = J.os.find(x => x.id === id);
    if (!os) return;

    _sv('osId', os.id);
    _st('osIdBadge', 'OS #' + os.id.slice(-6).toUpperCase());
    _sv('osTipoVeiculo', os.tipoVeiculo || 'carro');
    _sv('osStatus', os.status || 'Aguardando');
    _sv('osCliente', os.clienteId || '');

    filtrarVeiculosOS();
    setTimeout(() => _sv('osVeiculo', os.veiculoId || ''), 80);

    _sv('osMec',           os.mecId       || '');
    _sv('osData',          os.data        || '');
    _sv('osKm',            os.km          || '');
    _sv('osDescricao',     os.desc        || '');
    _sv('osDiagnostico',   os.diagnostico || '');
    _sv('osMaoObra',       os.maoObra     || 0);
    _sv('chkComb',         os.chkComb     || 'N/A');
    _sv('chkPneuDia',      os.chkPneuDia  || '');
    _sv('chkPneuTra',      os.chkPneuTra  || '');
    _sv('chkObs',          os.chkObs      || '');

    _ck('chkPainel',    os.chkPainel);
    _ck('chkPressao',   os.chkPressao);
    _ck('chkCarroceria',os.chkCarroceria);
    _ck('chkDocumentos',os.chkDocumentos);

    // Mídia
    _sv('osMediaArray', JSON.stringify(os.media || []));
    renderMediaOS();

    // Timeline
    _sv('osTimelineData', JSON.stringify(os.timeline || []));
    renderTimelineOS();

    // Peças
    if (os.pecas?.length) os.pecas.forEach(p => _renderPecaRow(p));
    calcOS();

    verificarStatusOS();

    if (btnPDF) btnPDF.classList.remove('hidden');

    // Preenche campos de pagamento se já concluída
    if (os.status === 'Concluido' && os.pgtoForma) {
      _sv('osPgtoForma', os.pgtoForma || 'Dinheiro');
      _sv('osPgtoData',  os.pgtoData  || '');
      checkPgtoOS();
    }
  }
};

// ============================================================
// PEÇAS
// ============================================================
window.adicionarPecaOS = function() {
  const div = document.createElement('div');
  div.className = 'peca-row';
  const opts = '<option value="">Selecionar peça...</option>' +
    J.estoque.filter(p => (p.qtd || 0) > 0).map(p =>
      `<option value="${p.id}" data-venda="${p.venda || 0}" data-custo="${p.custo || 0}" data-desc="${_esc(p.desc)}">[${p.qtd}un] ${p.desc} — ${moeda(p.venda)}</option>`
    ).join('');

  div.innerHTML = `
    <select class="select peca-sel" onchange="_selecionarPeca(this)">${opts}</select>
    <input type="number" class="input peca-qtd"   value="1"   min="1"    oninput="calcOS()">
    <input type="number" class="input peca-custo" value="0"   step="0.01" oninput="calcOS()" placeholder="Custo">
    <input type="number" class="input peca-venda" value="0"   step="0.01" oninput="calcOS()" placeholder="Venda">
    <button type="button" class="btn btn-danger btn-icon" onclick="this.closest('.peca-row').remove();calcOS()" title="Remover">✕</button>
  `;
  _$('containerPecasOS').appendChild(div);
  calcOS();
};

function _renderPecaRow(p) {
  const div = document.createElement('div');
  div.className = 'peca-row';
  const opts = `<option value="${p.estoqueId || ''}">${_esc(p.desc || '')}</option>` +
    J.estoque.filter(x => ((x.qtd || 0) > 0 || x.id === p.estoqueId)).map(x =>
      `<option value="${x.id}" data-venda="${x.venda || 0}" data-custo="${x.custo || 0}" data-desc="${_esc(x.desc)}" ${x.id === p.estoqueId ? 'selected' : ''}>[${x.qtd}un] ${x.desc}</option>`
    ).join('');

  div.innerHTML = `
    <select class="select peca-sel" onchange="_selecionarPeca(this)">${opts}</select>
    <input type="number" class="input peca-qtd"   value="${p.qtd   || 1}" min="1"    oninput="calcOS()">
    <input type="number" class="input peca-custo" value="${p.custo || 0}" step="0.01" oninput="calcOS()">
    <input type="number" class="input peca-venda" value="${p.venda || 0}" step="0.01" oninput="calcOS()">
    <button type="button" class="btn btn-danger btn-icon" onclick="this.closest('.peca-row').remove();calcOS()" title="Remover">✕</button>
  `;
  _$('containerPecasOS').appendChild(div);
}

window._selecionarPeca = function(sel) {
  const opt = sel.options[sel.selectedIndex];
  const row = sel.closest('.peca-row');
  if (!row) return;
  const vendaEl = row.querySelector('.peca-venda');
  const custoEl = row.querySelector('.peca-custo');
  if (vendaEl) vendaEl.value = opt.dataset.venda || 0;
  if (custoEl) custoEl.value = opt.dataset.custo || 0;
  calcOS();
};

window.calcOS = function() {
  let total = parseFloat(_v('osMaoObra')) || 0;
  document.querySelectorAll('#containerPecasOS .peca-row').forEach(row => {
    const qtd   = parseFloat(row.querySelector('.peca-qtd')?.value   || 0);
    const venda = parseFloat(row.querySelector('.peca-venda')?.value || 0);
    total += qtd * venda;
  });
  _st('osTotalVal', total.toFixed(2).replace('.', ','));
  _sv('osTotalHidden', total);
};

window.verificarStatusOS = function() {
  const s = _v('osStatus');
  const area = _$('areaPgtoOS');
  if (area) area.classList.toggle('hidden', s !== 'Concluido');
};

window.checkPgtoOS = function() {
  const f = _v('osPgtoForma');
  const parDiv = _$('divParcelasOS');
  if (parDiv) parDiv.classList.toggle('hidden', !['Crédito Parcelado', 'Boleto'].includes(f));
};

// ============================================================
// CLOUDINARY MÍDIA
// ============================================================
window.uploadOsMedia = async function() {
  const file = _$('osFileInput')?.files[0];
  if (!file) { toastWarn('Selecione um arquivo'); return; }

  const btn = _$('btnUploadMedia');
  setLoading('btnUploadMedia', true, 'Enviando...');

  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', J.cloudPreset);

    const res  = await fetch(`https://api.cloudinary.com/v1_1/${J.cloudName}/auto/upload`, { method: 'POST', body: fd });
    const data = await res.json();

    if (!data.secure_url) throw new Error(data.error?.message || 'Falha no upload');

    const media = JSON.parse(_v('osMediaArray') || '[]');
    media.push({ url: data.secure_url, type: data.resource_type, name: file.name });
    _sv('osMediaArray', JSON.stringify(media));
    renderMediaOS();
    toastOk('Arquivo enviado com sucesso!');
  } catch (e) {
    toastErr('Upload falhou: ' + e.message);
  } finally {
    setLoading('btnUploadMedia', false, 'UPLOAD');
    const fileEl = _$('osFileInput');
    if (fileEl) fileEl.value = '';
  }
};

window.renderMediaOS = function() {
  const media = JSON.parse(_v('osMediaArray') || '[]');
  if (!media.length) {
    _sh('osMediaGrid', `<div style="color:var(--text-muted);font-size:0.78rem;padding:16px 0">Nenhum arquivo anexado</div>`);
    return;
  }
  _sh('osMediaGrid', media.map((m, i) => `
    <div class="media-item" title="${m.name || ''}">
      ${m.type === 'video'
        ? `<video src="${m.url}" controls></video>`
        : `<img src="${m.url}" alt="foto" onclick="window.open('${m.url}','_blank')" style="cursor:zoom-in">`
      }
      <button class="media-del" onclick="_rmMedia(${i})" title="Remover">✕</button>
    </div>
  `).join(''));
};

window._rmMedia = function(idx) {
  const media = JSON.parse(_v('osMediaArray') || '[]');
  media.splice(idx, 1);
  _sv('osMediaArray', JSON.stringify(media));
  renderMediaOS();
};

window.renderTimelineOS = function() {
  const tl = JSON.parse(_v('osTimelineData') || '[]');
  if (!tl.length) {
    _sh('osTimeline', `<div style="color:var(--text-muted);font-size:0.78rem;padding:8px 0">Sem registros ainda</div>`);
    return;
  }
  _sh('osTimeline', [...tl].reverse().map(e => `
    <div class="tl-item">
      <div class="tl-date">${dtHrBr(e.dt)}</div>
      <div class="tl-user">${e.user}</div>
      <div class="tl-action">${e.acao}</div>
    </div>
  `).join(''));
};

// ============================================================
// SALVAR O.S.
// ============================================================
window.salvarOS = async function() {
  const osId = _v('osId');
  if (!_v('osCliente') || !_v('osVeiculo')) {
    toastWarn('Selecione cliente e veículo');
    return;
  }

  setLoading('btnSalvarOS', true);

  // Coletar peças
  const pecas = [];
  document.querySelectorAll('#containerPecasOS .peca-row').forEach(row => {
    const sel = row.querySelector('.peca-sel');
    const opt = sel?.options[sel.selectedIndex];
    const qtd   = parseFloat(row.querySelector('.peca-qtd')?.value   || 0);
    const custo = parseFloat(row.querySelector('.peca-custo')?.value || 0);
    const venda = parseFloat(row.querySelector('.peca-venda')?.value || 0);
    if (qtd > 0) {
      pecas.push({
        estoqueId: sel?.value || null,
        desc:  opt?.dataset.desc || opt?.text || '',
        qtd, custo, venda
      });
    }
  });

  // Timeline entry
  const tl = JSON.parse(_v('osTimelineData') || '[]');
  tl.push({
    dt:   new Date().toISOString(),
    user: J.nome,
    acao: `${osId ? 'Editou' : 'Abriu'} O.S. — Status: ${_v('osStatus')}`
  });

  const payload = {
    tenantId:    J.tid,
    tipoVeiculo: _v('osTipoVeiculo'),
    clienteId:   _v('osCliente'),
    veiculoId:   _v('osVeiculo'),
    mecId:       _v('osMec') || null,
    mecNome:     J.equipe.find(f => f.id === _v('osMec'))?.nome || null,
    data:        _v('osData'),
    km:          _v('osKm'),
    desc:        _v('osDescricao'),
    diagnostico: _v('osDiagnostico'),
    status:      _v('osStatus'),
    maoObra:     parseFloat(_v('osMaoObra') || 0),
    total:       parseFloat(_v('osTotalHidden') || 0),
    pecas,
    media:       JSON.parse(_v('osMediaArray') || '[]'),
    chkComb:     _v('chkComb'),
    chkPneuDia:  _v('chkPneuDia'),
    chkPneuTra:  _v('chkPneuTra'),
    chkObs:      _v('chkObs'),
    chkPainel:    _chk('chkPainel'),
    chkPressao:   _chk('chkPressao'),
    chkCarroceria:_chk('chkCarroceria'),
    chkDocumentos:_chk('chkDocumentos'),
    timeline:    tl,
    updatedAt:   new Date().toISOString()
  };

  try {
    // Ações ao concluir
    if (_v('osStatus') === 'Concluido' && _v('osPgtoForma')) {
      await _processarConclusao(payload, osId);
    }

    // Agendar revisão
    if (_v('osProxRev') || _v('osProxKm')) {
      await J.db.collection('agendamentos').add({
        tenantId:  J.tid,
        clienteId: payload.clienteId,
        veiculoId: payload.veiculoId,
        data:      _v('osProxRev') || '',
        km:        _v('osProxKm')  || '',
        servico:   'Revisão Programada',
        status:    'Agendado',
        createdAt: new Date().toISOString()
      });
    }

    if (osId) {
      await J.db.collection('ordens_servico').doc(osId).update(payload);
      toastOk('O.S. atualizada com sucesso!');
      audit('OS', 'Editou O.S. ' + osId.slice(-6).toUpperCase());
    } else {
      payload.createdAt = new Date().toISOString();
      const ref = await J.db.collection('ordens_servico').add(payload);
      toastOk('O.S. criada — #' + ref.id.slice(-6).toUpperCase());
      audit('OS', 'Criou O.S. para ' + (J.clientes.find(c => c.id === payload.clienteId)?.nome || '?'));
    }

    closeModal('modalOS');
  } catch (e) {
    toastErr('Erro ao salvar O.S.: ' + e.message);
  } finally {
    setLoading('btnSalvarOS', false, 'SALVAR O.S.');
  }
};

async function _processarConclusao(payload, osId) {
  const formasPagas = ['Dinheiro', 'PIX', 'Débito', 'Crédito à Vista', 'Transferência'];
  payload.pgtoForma = _v('osPgtoForma');
  payload.pgtoData  = _v('osPgtoData') || new Date().toISOString().split('T')[0];
  const statusFin   = formasPagas.includes(payload.pgtoForma) ? 'Pago' : 'Pendente';
  const parcelas    = parseInt(_v('osPgtoParcelas') || 1);
  const valorParc   = payload.total / parcelas;

  const veiculo = J.veiculos.find(v => v.id === payload.veiculoId);
  const cliente = J.clientes.find(c => c.id === payload.clienteId);

  const batch = J.db.batch();

  // Gera títulos financeiros
  for (let i = 0; i < parcelas; i++) {
    const d = new Date(payload.pgtoData);
    d.setMonth(d.getMonth() + i);
    batch.set(J.db.collection('financeiro').doc(), {
      tenantId:  J.tid,
      tipo:      'Entrada',
      status:    statusFin,
      desc:      `O.S. ${veiculo?.placa || ''} — ${cliente?.nome || ''} ${parcelas > 1 ? `(${i+1}/${parcelas})` : ''}`,
      valor:     valorParc,
      pgto:      payload.pgtoForma,
      venc:      d.toISOString().split('T')[0],
      osId:      osId || null,
      createdAt: new Date().toISOString()
    });
  }

  // Baixa estoque
  for (const p of payload.pecas) {
    if (p.estoqueId) {
      const item = J.estoque.find(x => x.id === p.estoqueId);
      if (item) {
        batch.update(J.db.collection('estoqueItems').doc(p.estoqueId), {
          qtd: Math.max(0, (item.qtd || 0) - p.qtd),
          updatedAt: new Date().toISOString()
        });
      }
    }
  }

  // Comissão do mecânico
  if (payload.mecId) {
    const mec = J.equipe.find(f => f.id === payload.mecId);
    if (mec && mec.comissao > 0) {
      const valCom = payload.total * (mec.comissao / 100);
      batch.set(J.db.collection('financeiro').doc(), {
        tenantId:  J.tid,
        tipo:      'Saída',
        status:    'Pendente',
        desc:      `Comissão ${mec.nome} — O.S. ${veiculo?.placa || ''}`,
        valor:     valCom,
        pgto:      'A Combinar',
        venc:      payload.pgtoData,
        isComissao: true,
        mecId:     payload.mecId,
        createdAt: new Date().toISOString()
      });
    }
  }

  await batch.commit();

  // Notificação WhatsApp ao cliente
  if (cliente?.wpp && window.JARVIS_CONST) {
    const msg = JARVIS_CONST.WPP_MSGS.pronto(cliente.nome, veiculo?.modelo || veiculo?.placa || 'veículo', J.tnome);
    // Abre WhatsApp (não-blocking)
    setTimeout(() => {
      if (confirm(`Enviar notificação WhatsApp para ${cliente.nome}?\n\n"${msg.substring(0,100)}..."`)) {
        abrirWpp(cliente.wpp, msg);
      }
    }, 500);
  }
}

// ============================================================
// AGENDA
// ============================================================
window.renderAgenda = function() {
  const lista = [...J.agendamentos].sort((a, b) => a.data > b.data ? 1 : -1);
  const hoje  = new Date().toISOString().split('T')[0];

  _sh('tbAgenda', lista.map(a => {
    const c   = J.clientes.find(x => x.id === a.clienteId);
    const v   = J.veiculos.find(x => x.id === a.veiculoId);
    const mec = J.equipe.find(x => x.id === a.mecId);
    const atrasado = a.data < hoje && a.status === 'Agendado';
    const convertido = a.status === 'Convertido';
    return `<tr style="${atrasado ? 'background:rgba(244,63,94,0.03)' : ''}">
      <td style="font-family:var(--ff-mono);font-size:0.8rem">${dtBr(a.data)} ${a.hora || ''}</td>
      <td>${c?.nome || '—'}</td>
      <td>${v ? `<span class="placa">${v.placa}</span> ${v.modelo}` : '—'}</td>
      <td>${a.servico || '—'}</td>
      <td>${mec?.nome || '—'}</td>
      <td>${atrasado ? badgeStatus('Cancelado') : convertido ? badgeStatus('Concluido') : badgeStatus('Aguardando')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="prepAgenda('edit','${a.id}');openModal('modalAgenda')">✏</button>
        ${!convertido ? `<button class="btn btn-brand btn-sm" onclick="converterAgendaOS('${a.id}')" style="margin-left:4px">→ O.S.</button>` : ''}
      </td>
    </tr>`;
  }).join('') || tableEmpty(7, '📅', 'Nenhum agendamento'));
};

window.prepAgenda = function(mode, id = null) {
  ['agdId','agdServico'].forEach(f => _sv(f, ''));
  _sv('agdData', new Date().toISOString().split('T')[0]);
  _sv('agdHora', '09:00');
  popularSelects();

  if (mode === 'edit' && id) {
    const a = J.agendamentos.find(x => x.id === id);
    if (!a) return;
    _sv('agdId',      a.id);
    _sv('agdCliente', a.clienteId || '');
    filtrarVeicsAgenda();
    setTimeout(() => _sv('agdVeiculo', a.veiculoId || ''), 80);
    _sv('agdData',    a.data    || '');
    _sv('agdHora',    a.hora    || '');
    _sv('agdServico', a.servico || '');
    _sv('agdMec',     a.mecId   || '');
  }
};

window.salvarAgenda = async function() {
  if (!_v('agdCliente') || !_v('agdData')) {
    toastWarn('Cliente e data são obrigatórios');
    return;
  }
  const p = {
    tenantId:  J.tid,
    clienteId: _v('agdCliente'),
    veiculoId: _v('agdVeiculo'),
    data:      _v('agdData'),
    hora:      _v('agdHora'),
    servico:   _v('agdServico'),
    mecId:     _v('agdMec') || null,
    status:    'Agendado',
    updatedAt: new Date().toISOString()
  };
  const id = _v('agdId');
  if (id) await J.db.collection('agendamentos').doc(id).update(p);
  else { p.createdAt = new Date().toISOString(); await J.db.collection('agendamentos').add(p); }

  toastOk('Agendamento salvo!');
  closeModal('modalAgenda');
  audit('AGENDA', `Agendou "${p.servico}" para ${dtBr(p.data)}`);
};

window.converterAgendaOS = async function(agdId) {
  const a = J.agendamentos.find(x => x.id === agdId);
  if (!a) return;
  await J.db.collection('agendamentos').doc(agdId).update({ status: 'Convertido', updatedAt: new Date().toISOString() });
  prepOS('add');
  setTimeout(() => {
    _sv('osCliente', a.clienteId || '');
    filtrarVeiculosOS();
    setTimeout(() => _sv('osVeiculo', a.veiculoId || ''), 80);
    _sv('osDescricao', a.servico || '');
    _sv('osData', a.data || new Date().toISOString().split('T')[0]);
    openModal('modalOS');
  }, 80);
};

// ============================================================
// AUDITORIA
// ============================================================
window.renderAuditoria = function() {
  _sh('tbAuditoria', J.auditoria.slice(0, 150).map(a => `
    <tr>
      <td style="font-family:var(--ff-mono);font-size:0.72rem;color:var(--text-muted)">${dtHrBr(a.ts)}</td>
      <td><span class="badge badge-brand">${a.modulo || '—'}</span></td>
      <td style="font-family:var(--ff-mono);color:var(--brand);font-size:0.75rem">${a.usuario || '—'}</td>
      <td>${a.acao || '—'}</td>
    </tr>
  `).join('') || tableEmpty(4, '🔒', 'Sem registros de auditoria'));
};

// ============================================================
// HELPER ESCAPING
// ============================================================
function _esc(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}