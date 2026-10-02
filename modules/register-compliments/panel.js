/**
 * Super DOPM - Modulo ELOGIOS no painel lateral (v3.0)
 *
 * Fluxo:
 *  1. "Capturar" injeta common/injected.js no SEI, coleta texto + tabelas e
 *     alimenta o extrator, que devolve N elogios ja normalizados;
 *  2. a lista permite escolher qual elogio usar (texto, autoridade e RGs);
 *  3. "Preencher" escreve no SICAD e inclui os RGs um a um.
 */

(function (global) {
  'use strict';

  const DOPM = global.DOPM;
  const STORAGE = DOPM.config.STORAGE_KEYS;

  const estado = {
    documento: null,
    elogioId: null,
    texto: '',
    rgs: '',
    autoridade: '',
    linhaRg: null
  };

  let ctx = null;
  let els = {};

  /* ======================================================================= */
  /* Persistencia                                                            */
  /* ======================================================================= */

  async function salvar() {
    if (!estado.documento) return;
    try {
      await DOPM.storage.set(STORAGE.documento, {
        formato: estado.documento.formato,
        titulo: estado.documento.titulo,
        numero: estado.documento.numero,
        unidade: estado.documento.unidade,
        processo: estado.documento.processo,
        url: estado.documento.url,
        capturadoEm: estado.documento.capturadoEm,
        elogios: estado.documento.elogios
      });
      await DOPM.storage.set(STORAGE.dados, {
        elogioId: estado.elogioId,
        texto: estado.texto,
        rgs: estado.rgs,
        autoridade: estado.autoridade
      });
    } catch (e) {
      console.warn('Falha ao salvar dados do elogio:', e);
    }
  }

  async function restaurar() {
    const documento = await DOPM.storage.get(STORAGE.documento);
    if (documento && documento.elogios && documento.elogios.length) {
      estado.documento = documento;
    }
    const dados = await DOPM.storage.get(STORAGE.dados);
    if (dados) {
      estado.elogioId = dados.elogioId || null;
      estado.texto = dados.texto || '';
      estado.rgs = dados.rgs || '';
      estado.autoridade = dados.autoridade || '';
    }
    const iniciais = await DOPM.storage.get(STORAGE.iniciais);
    if (typeof iniciais === 'string' && iniciais.trim()) {
      els.iniciais.value = iniciais;
    }
  }

  /* ======================================================================= */
  /* Texto final e lista                                                     */
  /* ======================================================================= */

  function configElogio() {
    return (ctx && ctx.config && ctx.config.elogio) || {};
  }

  function textoFinal() {
    const cfg = configElogio();
    return DOPM.extractor.aplicarIniciais(estado.texto, els.iniciais.value, cfg.separadorIniciais);
  }

  function elogioAtual() {
    if (!estado.documento) return null;
    return estado.documento.elogios.filter(function (e) {
      return e.id === estado.elogioId;
    })[0] || null;
  }

  function selecionarElogio(id) {
    const elogio = (estado.documento.elogios || []).filter(function (e) {
      return e.id === id;
    })[0];
    if (!elogio) return;
    estado.elogioId = id;
    estado.texto = elogio.texto || '';
    estado.rgs = (elogio.rgs || []).join(', ');
    // O SICAD recebe nome + posto + cargo da autoridade que prestou o elogio.
    estado.autoridade = elogio.autoridadeBloco || elogio.autoridade || '';
    els.texto.value = textoFinal();
    els.rgs.value = estado.rgs;
    els.autoridade.value = estado.autoridade;
    els.progresso.dataset.visivel = 'false';
    salvar();
    renderLista();
  }

  function renderLista() {
    els.lista.innerHTML = '';
    const elogios = (estado.documento && estado.documento.elogios) || [];

    elogios.forEach(function (elogio, indice) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'sp-item';
      botao.setAttribute('aria-pressed', String(elogio.id === estado.elogioId));

      const numero = document.createElement('span');
      numero.className = 'sp-indice';
      numero.textContent = String(indice + 1);

      const titulo = document.createElement('span');
      titulo.className = 'sp-item-titulo';
      titulo.textContent = elogio.rotulo || 'Elogio #' + (indice + 1);

      const meta = document.createElement('span');
      meta.className = 'sp-item-meta';
      meta.textContent = (elogio.rgs ? elogio.rgs.length + ' RG' : 'sem RG');

      botao.appendChild(numero);
      botao.appendChild(titulo);
      botao.appendChild(meta);
      botao.addEventListener('click', function () {
        selecionarElogio(elogio.id);
      });

      els.lista.appendChild(botao);
    });

    els.metaDoc.textContent = estado.documento
      ? [
          estado.documento.formato,
          estado.documento.numero ? 'nº ' + estado.documento.numero : '',
          estado.documento.unidade,
          estado.documento.processo ? 'proc. ' + estado.documento.processo : '',
          elogios.length + (elogios.length === 1 ? ' elogio' : ' elogios')
        ]
          .filter(Boolean)
          .join(' · ')
      : 'nenhum documento capturado';
  }

  function progresso(visivel, atual, total) {
    els.progresso.dataset.visivel = String(!!visivel);
    if (!visivel) return;
    const pct = total > 0 ? Math.round((atual / total) * 100) : 0;
    els.progressoBarra.style.width = pct + '%';
    els.progressoTexto.textContent = 'incluindo RGs: ' + atual + '/' + total;
  }

  /* ======================================================================= */
  /* Captura (SEI)                                                           */
  /* ======================================================================= */

  async function capturar() {
    const aba = await ctx.abaAtiva();
    if (!aba || aba.tipo !== 'sei') {
      ctx.aviso('Abra um documento do SEI antes de capturar.', 'erro');
      return;
    }

    ctx.ocupar(true, 'capturando documento do SEI...');
    try {
      const resposta = await ctx.injetar('collectDocument');
      if (!resposta.ok) {
        ctx.aviso('Falha ao acessar o SEI: ' + (resposta.erro || 'erro desconhecido'), 'erro');
        return;
      }
      const dados = resposta.dados || {};
      if (!dados.texto || String(dados.texto).length < 60) {
        ctx.aviso('Nenhum texto de item de DOPM encontrado na pagina.', 'erro');
        return;
      }

      const documento = DOPM.extractor.analisar(dados, ctx.config);
      if (!documento.elogios.length) {
        ctx.aviso('Nao foi possivel identificar elogios neste documento.', 'erro');
        return;
      }

      estado.documento = documento;
      selecionarElogio(documento.elogios[0].id);

      const totalRg = documento.elogios.reduce(function (soma, e) {
        return soma + (e.rgs ? e.rgs.length : 0);
      }, 0);
      ctx.aviso(
        documento.elogios.length +
          (documento.elogios.length === 1 ? ' elogio capturado' : ' elogios capturados') +
          ' · ' + totalRg + ' RGs na tabela restrita',
        'ok'
      );
    } finally {
      ctx.ocupar(false);
    }
  }

  /* ======================================================================= */
  /* Preenchimento (SICAD)                                                    */
  /* ======================================================================= */

  function atualizarLinhaRg() {
    const lista = DOPM.utils.normalizarListaRG(estado.rgs);
    if (!lista.length) {
      els.rgs.classList.remove('sp-destacado');
      els.rgs.style.borderColor = '';
      return;
    }
    const alvo = lista[0];
    els.rgs.classList.toggle('sp-destacado', String(estado.linhaRg) === alvo);
  }

  async function preencher() {
    const aba = await ctx.abaAtiva();
    if (!aba || aba.tipo !== 'sicad') {
      ctx.aviso('Abra o formulario de cadastro no SICAD.', 'erro');
      return;
    }

    const texto = textoFinal().trim();
    const listaRg = DOPM.utils.normalizarListaRG(estado.rgs);
    if (!texto && !listaRg.length) {
      ctx.aviso('Nada para preencher: capture ou digite um elogio.', 'erro');
      return;
    }

    const cfgT = (ctx.config && ctx.config.timings) || {};
    const espera = DOPM.utils.esperar;
    const seletores = ctx.app.selecaoDeRGs();

    ctx.ocupar(true, 'preenchendo formulario do SICAD...');
    estado.linhaRg = null;
    try {
      const campos = await ctx.injetar('applyTextFields', {
        texto: texto,
        autoridade: estado.autoridade.trim(),
        seletores: seletores
      });
      if (!campos.ok) {
        ctx.aviso('Falha ao preencher o formulario: ' + (campos.erro || campos.dados.detalhe), 'erro');
        return;
      }
      if (!campos.dados.texto) {
        ctx.aviso('Campo de texto do elogio nao encontrado no SICAD.', 'erro');
        return;
      }

      if (!listaRg.length) {
        ctx.aviso('Texto e autoridade preenchidos (sem RGs).', 'ok');
        return;
      }

      progresso(true, 0, listaRg.length);
      const falhas = [];

      for (let i = 0; i < listaRg.length; i++) {
        estado.linhaRg = listaRg[i];
        atualizarLinhaRg();

        let inclusao = await ctx.injetar('addRg', { rg: listaRg[i], seletores: seletores });
        if (!inclusao.ok) {
          await espera(cfgT.probeDelay || 400);
          inclusao = await ctx.injetar('addRg', { rg: listaRg[i], seletores: seletores });
        }

        if (!inclusao.ok) {
          const motivo = inclusao.erro || (inclusao.dados && inclusao.dados.motivo) || 'falhou';
          falhas.push(listaRg[i] + ' (' + motivo + ')');
        }

        progresso(true, i + 1, listaRg.length);
        if (i < listaRg.length - 1) {
          // O SICAD precisa processar a inclusao antes do proximo RG.
          await espera(cfgT.rgProcessingDelay || 2000);
        }
      }

      estado.linhaRg = null;
      atualizarLinhaRg();
      setTimeout(function () {
        progresso(false);
      }, 2500);

      if (falhas.length) {
        ctx.aviso(
          listaRg.length - falhas.length + ' de ' + listaRg.length + ' RGs incluidos. Falharam: ' + falhas.join('; '),
          'erro'
        );
      } else {
        ctx.aviso('Elogio preenchido com ' + listaRg.length + ' RG(s).', 'ok');
      }
    } finally {
      ctx.ocupar(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoFinal());
      ctx.aviso('Texto copiado.', 'ok');
    } catch (e) {
      els.texto.select();
      ctx.aviso('Use Ctrl+C para copiar o texto selecionado.', 'info');
    }
  }

  function limpar() {
    estado.documento = null;
    estado.elogioId = null;
    estado.texto = '';
    estado.rgs = '';
    estado.autoridade = '';
    estado.linhaRg = null;
    els.texto.value = '';
    els.rgs.value = '';
    els.autoridade.value = '';
    progresso(false);
    renderLista();
    DOPM.storage.remove(STORAGE.documento);
    DOPM.storage.remove(STORAGE.dados);
    ctx.aviso('Dados limpos.', 'info');
  }

  /* ======================================================================= */
  /* View                                                                     */
  /* ======================================================================= */

  function montar(root) {
    root.innerHTML = [
      '<section class="sp-bloco">',
      '  <header>Documento<button type="button" class="sp-icone" id="sp-limpar" title="Limpar" aria-label="Limpar">',
      '    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7zm3-3h6l1 2H8l1-2z"/></svg>',
      '  </button></header>',
      '  <div class="sp-corpo">',
      '    <div class="sp-acoes">',
      '      <button type="button" class="sp-primario" id="sp-capturar">Capturar no SEI</button>',
      '      <button type="button" id="sp-preencher">Preencher no SICAD</button>',
      '      <button type="button" id="sp-copiar">Copiar texto</button>',
      '    </div>',
      '    <p class="sp-meta-doc" id="sp-meta-doc">nenhum documento capturado</p>',
      '  </div>',
      '</section>',
      '<section class="sp-bloco">',
      '  <header>Elogios</header>',
      '  <div class="sp-corpo"><div class="sp-lista" id="sp-lista"></div></div>',
      '</section>',
      '<section class="sp-bloco">',
      '  <header>Cadastro</header>',
      '  <div class="sp-corpo">',
      '    <div class="sp-campo">',
      '      <label for="sp-texto">Texto do elogio</label>',
      '      <textarea id="sp-texto" placeholder="Selecione um elogio ou capture um documento do SEI."></textarea>',
      '      <div class="sp-dica">As iniciais sao anexadas automaticamente ao final.</div>',
      '    </div>',
      '    <div class="sp-campo">',
      '      <label for="sp-iniciais">Iniciais</label>',
      '      <input type="text" id="sp-iniciais" value="RNMM." autocomplete="off" />',
      '    </div>',
      '    <div class="sp-campo">',
      '      <label for="sp-autoridade">Autoridade</label>',
      '      <input type="text" id="sp-autoridade" placeholder="Nome de quem prestou o elogio" autocomplete="off" />',
      '      <div class="sp-dica">Informacao de acesso restrito.</div>',
      '    </div>',
      '    <div class="sp-campo">',
      '      <label for="sp-rgs">RGs</label>',
      '      <textarea id="sp-rgs" placeholder="33640, 36934, 37030" spellcheck="false"></textarea>',
      '      <div class="sp-dica">Separe por virgula. O SICAD recebe um RG por vez.</div>',
      '    </div>',
      '    <div class="sp-progresso" id="sp-progresso" data-visivel="false">',
      '      <div class="sp-barra"><i id="sp-progresso-barra"></i></div>',
      '      <div class="sp-progresso-texto" id="sp-progresso-texto"></div>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n');

    const porId = function (id) {
      return root.querySelector('#' + id);
    };

    els = {
      metaDoc: porId('sp-meta-doc'),
      lista: porId('sp-lista'),
      texto: porId('sp-texto'),
      rgs: porId('sp-rgs'),
      autoridade: porId('sp-autoridade'),
      iniciais: porId('sp-iniciais'),
      progresso: porId('sp-progresso'),
      progressoBarra: porId('sp-progresso-barra'),
      progressoTexto: porId('sp-progresso-texto')
    };

    porId('sp-capturar').addEventListener('click', capturar);
    porId('sp-preencher').addEventListener('click', preencher);
    porId('sp-copiar').addEventListener('click', copiar);
    porId('sp-limpar').addEventListener('click', limpar);

    els.texto.addEventListener('input', function () {
      estado.texto = els.texto.value;
      salvar();
    });
    els.rgs.addEventListener('input', function () {
      estado.rgs = els.rgs.value;
      salvar();
    });
    els.autoridade.addEventListener('input', function () {
      estado.autoridade = els.autoridade.value;
      salvar();
    });
    els.iniciais.addEventListener('change', function () {
      DOPM.storage.set(STORAGE.iniciais, els.iniciais.value);
      els.texto.value = textoFinal();
    });
  }

  DOPM.app.registrarModulo({
    id: 'elogios',
    titulo: 'Elogios',
    iniciar: async function (contexto) {
      ctx = contexto;
      montar(ctx.root);
      await restaurar();
      renderLista();
      if (elogioAtual()) {
        els.texto.value = textoFinal();
        els.rgs.value = estado.rgs;
        els.autoridade.value = estado.autoridade;
      }
    },
    destruir: function () {
      els = {};
    }
  });
})(window);
