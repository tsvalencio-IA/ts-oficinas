/**
 * JARVIS ERP V2 — auth.js
 * Autenticação híbrida: Master (Admin) + Equipe (Funcionário) + PIN
 */

'use strict';

// ============================================================
// LOGIN HÍBRIDO (MASTER)
// ============================================================
window.autenticar = async function() {
  const usr = document.getElementById('usr')?.value.trim() || '';
  const pwd = document.getElementById('pwd')?.value.trim() || '';
  const err = document.getElementById('loginErr');
  const btn = document.getElementById('btnLogin');
  
  if (!err || !btn) return;
  
  err.style.display = 'none';
  if (!usr || !pwd) {
    err.textContent = 'Preencha usuário e senha.';
    err.style.display = 'block';
    return;
  }

  btn.innerHTML = '<span class="spinner"></span> Autenticando...';
  btn.disabled = true;

  try {
    const db = window.initFirebase();

    // CAMADA 1: Admin Master via Firebase Auth (E-mail e Senha)
    if (usr.includes('@')) {
      try {
        const cred = await firebase.auth().signInWithEmailAndPassword(usr, pwd);
        const doc = await db.collection('oficinas').doc(cred.user.uid).get();
        if (doc.exists) {
          const d = doc.data();
          if (d.status === 'Bloqueado') throw new Error('Licença bloqueada. Contate o suporte.');
          _salvarSessao(doc.id, d, 'admin', d.nomeFantasia || 'Gestor', null, d);
          window.location.href = 'jarvis.html';
          return;
        }
      } catch (authError) {
        console.warn("Auth Firebase falhou, tentando fallback direto no Firestore...");
      }
    }

    // CAMADA 1.1: Fallback Master direto no Firestore
    let snapOf = await db.collection('oficinas').where('usuario', '==', usr).get();
    if (snapOf.empty && usr.includes('@')) {
      snapOf = await db.collection('oficinas').where('email', '==', usr).get();
    }
    
    if (!snapOf.empty) {
      let adminDoc = null;
      snapOf.forEach(doc => { if (doc.data().senha === pwd) adminDoc = doc; });
      if (adminDoc) {
        const d = adminDoc.data();
        if (d.status === 'Bloqueado') throw new Error('Licença bloqueada. Contate o suporte.');
        _salvarSessao(adminDoc.id, d, 'admin', d.nomeFantasia || 'Gestor', null, d);
        window.location.href = 'jarvis.html';
        return;
      }
    }

    // CAMADA 2: Funcionário (Equipe) via collectionGroup
    let snapFn = await db.collectionGroup('funcionarios').where('login', '==', usr).get();
    if (snapFn.empty) {
      snapFn = await db.collectionGroup('funcionarios').where('usuario', '==', usr).get();
    }
    
    if (!snapFn.empty) {
      let funcDoc = null;
      snapFn.forEach(doc => { if (doc.data().senha === pwd) funcDoc = doc; });
      
      if (!funcDoc) throw new Error('Senha incorreta.');
      
      const dF = funcDoc.data();
      const mae = await db.collection('oficinas').doc(dF.tenantId).get();
      if (!mae.exists || mae.data().status === 'Bloqueado') throw new Error('Oficina bloqueada.');
      
      const maeData = mae.data();
      const role = dF.cargo === 'gerente' ? 'gerente' : (dF.cargo === 'atendente' ? 'atendente' : 'equipe');
      
      _salvarSessao(dF.tenantId, maeData, role, dF.nome, funcDoc.id, maeData, dF.comissao || 0);
      window.location.href = 'equipe.html';
      return;
    }

    throw new Error('Usuário não encontrado ou senha inválida.');
  } catch (e) {
    err.textContent = e.message || 'Erro ao autenticar';
    err.style.display = 'block';
    btn.innerHTML = 'Entrar no Sistema';
    btn.disabled = false;
  }
};

// ============================================================
// LOGIN EQUIPE (SEM PIN)
// ============================================================
window.autenticarEquipe = async function() {
  const usr = document.getElementById('usrEquipe')?.value.trim() || '';
  const pwd = document.getElementById('pwdEquipe')?.value.trim() || '';
  const err = document.getElementById('loginErrEquipe');
  const btn = document.getElementById('btnLoginEquipe');
  
  if (!err || !btn) return;
  
  err.style.display = 'none';
  if (!usr || !pwd) {
    err.textContent = 'Preencha usuário e senha.';
    err.style.display = 'block';
    return;
  }

  btn.innerHTML = '<span class="spinner"></span> Autenticando...';
  btn.disabled = true;

  try {
    const db = window.initFirebase();
    
    let snap = await db.collectionGroup('funcionarios').where('login', '==', usr).get();
    if (snap.empty) {
      snap = await db.collectionGroup('funcionarios').where('usuario', '==', usr).get();
    }

    if (snap.empty) throw new Error('Usuário não encontrado.');

    let funcDoc = null;
    snap.forEach(doc => { if (doc.data().senha === pwd) funcDoc = doc; });
    
    if (!funcDoc) throw new Error('Senha incorreta.');

    const data = funcDoc.data();
    const oficina = await db.collection('oficinas').doc(data.tenantId).get();
    if (!oficina.exists || oficina.data().status === 'Bloqueado') throw new Error('Oficina bloqueada.');

    const oficinData = oficina.data();
    const role = data.cargo === 'gerente' ? 'gerente' : (data.cargo === 'atendente' ? 'atendente' : 'equipe');

    _salvarSessao(data.tenantId, oficinData, role, data.nome, funcDoc.id, oficinData, data.comissao || 0);
    window.location.href = 'equipe.html';
  } catch (e) {
    err.textContent = e.message || 'Erro ao autenticar';
    err.style.display = 'block';
    btn.innerHTML = 'Entrar como Equipe';
    btn.disabled = false;
  }
};

// ============================================================
// LOGIN COM PIN
// ============================================================
window.autenticarComPIN = async function() {
  const usr = document.getElementById('usrPin')?.value.trim() || '';
  const pin = document.getElementById('pinInput')?.value.trim() || '';
  const err = document.getElementById('loginErrPin');
  const btn = document.getElementById('btnLoginPin');
  
  if (!err || !btn) return;
  
  err.style.display = 'none';
  if (!usr || !pin) {
    err.textContent = 'Preencha usuário e PIN.';
    err.style.display = 'block';
    return;
  }

  if (pin.length !== 4 || !/^\d+$/.test(pin)) {
    err.textContent = 'PIN deve conter 4 dígitos.';
    err.style.display = 'block';
    return;
  }

  btn.innerHTML = '<span class="spinner"></span> Autenticando...';
  btn.disabled = true;

  try {
    const db = window.initFirebase();

    let snap = await db.collectionGroup('funcionarios').where('login', '==', usr).where('pin', '==', pin).get();
    if (snap.empty) {
      snap = await db.collectionGroup('funcionarios').where('usuario', '==', usr).where('pin', '==', pin).get();
    }

    if (snap.empty) throw new Error('Usuário ou PIN incorreto.');

    const doc = snap.docs[0];
    const data = doc.data();

    const oficina = await db.collection('oficinas').doc(data.tenantId).get();
    if (!oficina.exists) throw new Error('Oficina não encontrada.');

    const oficinData = oficina.data();
    const role = data.cargo === 'gerente' ? 'gerente' : (data.cargo === 'atendente' ? 'atendente' : 'equipe');

    _salvarSessao(data.tenantId, oficinData, role, data.nome, doc.id, oficinData, data.comissao || 0);
    window.location.href = 'equipe.html';
  } catch (e) {
    err.textContent = e.message || 'Erro ao autenticar';
    err.style.display = 'block';
    btn.innerHTML = 'Entrar com PIN';
    btn.disabled = false;
  }
};

// ============================================================
// SALVAR SESSÃO
// ============================================================
function _salvarSessao(tid, d, role, nome, fid, maeData, comissao = 0) {
  sessionStorage.setItem('j_tid', tid);
  sessionStorage.setItem('j_tnome', maeData.nomeFantasia || 'Oficina');
  sessionStorage.setItem('j_role', role);
  sessionStorage.setItem('j_nome', nome);
  if (fid) sessionStorage.setItem('j_fid', fid);
  sessionStorage.setItem('j_comissao', comissao);
  sessionStorage.setItem('j_gemini', maeData.apiKeys?.gemini || '');
  sessionStorage.setItem('j_nicho', maeData.nicho || 'carros');
  sessionStorage.setItem('j_cloud_name', maeData.apiKeys?.cloudName || 'dmuvm1o6m');
  sessionStorage.setItem('j_cloud_preset', maeData.apiKeys?.cloudPreset || 'evolution');

  const brand = {
    name: maeData.brandName || maeData.nomeFantasia,
    tagline: maeData.brandTagline || 'Gestão Automotiva',
    logoLetter: maeData.brandLetter || (maeData.nomeFantasia || 'J').charAt(0).toUpperCase(),
    color: maeData.brandColor || '#3B82F6',
    footer: maeData.brandFooter || `${maeData.nomeFantasia} · Powered by JARVIS ERP`
  };

  const r = parseInt((brand.color || '#3B82F6').slice(1, 3), 16);
  const g = parseInt((brand.color || '#3B82F6').slice(3, 5), 16);
  const b = parseInt((brand.color || '#3B82F6').slice(5, 7), 16);
  brand.colorDim = `rgba(${r},${g},${b},.12)`;
  brand.colorGlow = `rgba(${r},${g},${b},.25)`;

  sessionStorage.setItem('j_brand', JSON.stringify(brand));
}

// ============================================================
// LOGOUT
// ============================================================
window.fazerLogout = function() {
  if (confirm('Deseja sair do sistema?')) {
    sessionStorage.clear();
    firebase.auth().signOut().catch(()=>{});
    window.location.href = 'index.html';
  }
};
