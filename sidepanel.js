/**
 * Super DOPM - Shell do painel lateral (v3.0)
 *
 * Responsavel por:
 *  - carregar a configuracao (cache -> servidor -> padrao);
 *  - detectar o site da aba ativa e o tipo do documento;
 *  - injetar os scripts de pagina e despachar chamadas no contexto da aba;
 *  - montar/desmontar a view de cada modulo registrado.
 *
 * Os modulos se registram em DOPM.app.registrarModulo({ id, titulo, iniciar }).
 */

(function (global) {
  'use strict';

  const DOPM = (global.DOPM = global.DOPM || {});
  const STORAGE = DOPM.config.STORAGE_KEYS;

  const app = {
    modulos: [],
    moduloAtivo: null,
    config: DOPM.config.DEFAULT_CONFIG,
    origemConfig: 'padrao',
    site: 'desconhecido',
    aba: null,
    ocupado: false,
    _timerAviso: null
  };

  /* ======================================================================= */
  /* Avisos e estado global                                                   */
  /* ======================================================================= */

  app.aviso = function (mensagem, tipo) {
    const caixa = document.getElementById('sp-aviso');
    if (!caixa) return;
    caixa.textContent = mensagem;
    caixa.dataset.tipo = tipo || 'info';
    caixa.hidden = false;
    if (app._timerAviso) clearTimeout(app._timerAviso);
    app._timerAviso = setTimeout(function () {
      caixa.hidden = true;
    }, tipo === 'erro' ? 7000 : 3200);
  };

  app.ocupar = function (ativo, mensagem) {
    app.ocupado = !!ativo;
    document.body.classList.toggle('sp-ocupado', app.ocupado);
    const status = document.getElementById('sp-status');
    if (!status) return;
    if (mensagem) status.textContent = mensagem;
    status.hidden = !mensagem;
  };

  app.selecaoDeRGs = function () {
    const sel = (app.config && app.config.fieldSelectors) || {};
    return {
      texto: [sel.textoElogio, 'textarea[name="textoElogio"]', 'textarea[id="textoElogio"]'],
      autoridade: [sel.autoridade, 'input[name="autoridade"]', 'input[id="autoridade"]'],
      rg: [sel.rg, 'input[id="rg"]', 'input[name*="rg" i]'],
      adicionar: [sel.adicionarRg].concat(sel.adicionarRgAlternativas || []),
      adicionarTexto: ['adicionar', 'incluir', 'confirmar', 'ok']
    };
  };

  /* ======================================================================= */
  /* Aba ativa e execucao no contexto da pagina                               */
  /* ======================================================================= */

  app.abaAtiva = async function () {
    const abas = await chrome.tabs.query({ active: true, currentWindow: true });
    const aba = abas && abas[0];
    if (!aba || !aba.id) return null;
    let url = aba.url || '';
    if (!url && aba.pendingUrl) url = aba.pendingUrl;
    let tipo = 'desconhecido';
    if (url.indexOf('sei.go.gov.br') !== -1) tipo = 'sei';
    else if (url.indexOf('sisp.ssp.go.gov.br') !== -1) tipo = 'sicad';
    app.site = tipo;
    app.aba = { id: aba.id, url: url, tipo: tipo, titulo: aba.title || '' };
    return app.aba;
  };

  app.detectarPagina = async function () {
    const resposta = await app.injetar('detectSite');
    return resposta.ok ? resposta.dados : null;
  };

  /**
   * Injeta o arquivo de funcoes na aba e executa um dos metodos dele.
   * @param {string} metodo
   * @param {*} payload
   * @returns {Promise<{ok: boolean, dados?: *, erro?: string}>}
   */
  app.injetar = async function (metodo, payload) {
    const aba = app.aba || (await app.abaAtiva());
    if (!aba) return { ok: false, erro: 'aba ativa nao encontrada' };
    try {
      await chrome.scripting.executeScript({
        target: { tabId: aba.id },
        files: ['common/injected.js']
      });
    } catch (e) {
      return { ok: false, erro: 'sem acesso a pagina: ' + (e && e.message) };
    }
    try {
      const respostas = await chrome.scripting.executeScript({
        target: { tabId: aba.id },
        func: DOPM.injected.executarNoDocumento,
        args: [{ metodo: metodo, payload: payload }]
      });
      const resultado = respostas && respostas[0] && respostas[0].result;
      if (!resultado) return { ok: false, erro: 'pagina nao respondeu' };
      return resultado;
    } catch (e) {
      return { ok: false, erro: (e && e.message) || String(e) };
    }
  };

  /* ======================================================================= */
  /* Tema                                                                     */
  /* ======================================================================= */

  async function aplicarTema(tema) {
    document.documentElement.dataset.tema = tema === 'escuro' ? 'escuro' : 'claro';
    try {
      await DOPM.storage.set(STORAGE.tema, tema);
    } catch (e) {
      /* ignora */
    }
  }

  /* ======================================================================= */
  /* Modulos                                                                  */
  /* ======================================================================= */

  app.registrarModulo = function (modulo) {
    if (!modulo || !modulo.id) return;
    app.modulos.push(modulo);
  };

  async function abrirModulo(id) {
    const modulo = app.modulos.filter(function (m) {
      return m.id === id;
    })[0];
    if (!modulo) return;

    if (app.moduloAtivo && app.moduloAtivo.id !== id && app.moduloAtivo.destruir) {
      try {
        await app.moduloAtivo.destruir();
      } catch (e) {
        /* ignora */
      }
    }

    const main = document.getElementById('sp-main');
    main.innerHTML = '';
    app.moduloAtivo = modulo;

    document.querySelectorAll('.sp-aba-btn').forEach(function (botao) {
      botao.setAttribute('aria-selected', String(botao.dataset.modulo === id));
    });

    try {
      await modulo.iniciar({
        app: app,
        root: main,
        config: app.config,
        aviso: app.aviso,
        ocupar: app.ocupar,
        injetar: app.injetar,
        abaAtiva: app.abaAtiva
      });
    } catch (erro) {
      console.error('Falha ao abrir o modulo', id, erro);
      app.aviso('Falha ao carregar o modulo: ' + (erro && erro.message), 'erro');
    }
  }

  app.abrirModulo = abrirModulo;

  function montarAbas() {
    const main = document.getElementById('sp-main');
    const nav = document.createElement('nav');
    nav.className = 'sp-abas';
    nav.setAttribute('role', 'tablist');

    app.modulos.forEach(function (modulo, indice) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'sp-aba-btn';
      botao.dataset.modulo = modulo.id;
      botao.textContent = modulo.titulo || modulo.id;
      botao.setAttribute('role', 'tab');
      botao.setAttribute('aria-selected', String(indice === 0));
      botao.addEventListener('click', function () {
        abrirModulo(modulo.id);
      });
      nav.appendChild(botao);
    });

    document.body.insertBefore(nav, document.querySelector('.sp-header').nextSibling);
  }

  /* ======================================================================= */
  /* Boot                                                                     */
  /* ======================================================================= */

  async function iniciar() {
    const tema = await DOPM.storage.get(STORAGE.tema);
    await aplicarTema(tema === 'escuro' ? 'escuro' : 'claro');

    const carregamento = await DOPM.config.loadConfig();
    app.config = carregamento.config;
    app.origemConfig = carregamento.origem;
    const rotulo = document.getElementById('sp-config');
    if (rotulo) rotulo.textContent = 'configuracao: ' + app.origemConfig;

    const botaoTema = document.getElementById('sp-tema');
    if (botaoTema) {
      botaoTema.addEventListener('click', function () {
        aplicarTema(document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro');
      });
    }

    await app.abaAtiva();
    const rotuloSite = document.getElementById('sp-site');
    if (rotuloSite) {
      rotuloSite.textContent =
        app.aba && app.aba.tipo === 'sei'
          ? 'SEI - capturando itens de DOPM'
          : app.aba && app.aba.tipo === 'sicad'
            ? 'SICAD - cadastro de elogio'
            : 'site nao compativel';
    }

    if (carregamento.avisos && carregamento.avisos.length) {
      console.warn('Super DOPM:', carregamento.avisos.join(' | '));
    }

    if (!app.modulos.length) {
      document.getElementById('sp-main').innerHTML =
        '<p>Nenhum modulo registrado.</p>';
      return;
    }

    montarAbas();
    await abrirModulo(app.modulos[0].id);
  }

  DOPM.app = app;

  document.addEventListener('DOMContentLoaded', function () {
    iniciar().catch(function (erro) {
      console.error('Falha ao iniciar o painel', erro);
      const aviso = document.getElementById('sp-aviso');
      if (aviso) {
        aviso.dataset.tipo = 'erro';
        aviso.textContent = 'Erro ao iniciar: ' + (erro && erro.message);
        aviso.hidden = false;
      }
    });
  });
})(window);
