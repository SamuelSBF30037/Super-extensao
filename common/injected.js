/**
 * Super DOPM - Funcoes injetadas na pagina (v3.0)
 *
 * Todas as funcoes deste arquivo sao executadas no contexto da aba alvo via
 * chrome.scripting.executeScript. Por restricao da API, cada funcao e
 * serializada isoladamente: helpersUsed/devem ser declarados DENTRO da funcao.
 *
 * Nenhuma delas pode referenciar variaveis externas deste arquivo; use os
 * parametros recebidos.
 */

window.DOPM = window.DOPM || {};

(function (global) {
  'use strict';

  /**
   * Percorre documentos da mesma origem (iframes do SEI) e devolve o conteudo
   * textual + as tabelas encontradas.
   * @returns {{url: string, titulo: string, texto: string, tabelas: string[][][], origem: string}}
   */
  function collectDocument() {
    const visitados = new Set();
    let melhor = { texto: '', tabelas: [], origem: '', pontuacao: -1 };

    function tabelasDe(doc) {
      const resultado = [];
      let listas;
      try {
        listas = doc.querySelectorAll('table');
      } catch (e) {
        return resultado;
      }
      for (let i = 0; i < listas.length; i++) {
        const tabela = listas[i];
        const linhas = [];
        const trs = tabela.querySelectorAll('tr');
        for (let j = 0; j < trs.length; j++) {
          const celulas = [];
          const tds = trs[j].querySelectorAll('th,td');
          for (let k = 0; k < tds.length; k++) {
            celulas.push(String(tds[k].innerText || tds[k].textContent || '')
              .replace(/\u00a0/g, ' ')
              .replace(/[ \t]+/g, ' ')
              .trim());
          }
          if (celulas.length) linhas.push(celulas);
        }
        if (linhas.length >= 2) resultado.push(linhas);
      }
      return resultado;
    }

    function pontuar(texto) {
      let pontos = Math.min(texto.length / 50, 4000);
      if (/ITEM\s+(?:PARA\s+)?DOPM/i.test(texto)) pontos += 3000;
      if (/DADOS\s+DO\s+POLICIAL\s+MILITAR/i.test(texto)) pontos += 3000;
      if (/ELOGIO/i.test(texto)) pontos += 1500;
      if (/ART\.\s*50/i.test(texto)) pontos += 1000;
      return pontos;
    }

    function visitar(doc, origem, profundidade) {
      if (!doc || visitados.has(doc) || profundidade > 5) return;
      visitados.add(doc);
      let texto = '';
      try {
        texto = (doc.body && doc.body.innerText ? doc.body.innerText : '').trim();
      } catch (e) {
        texto = '';
      }
      const pontos = pontuar(texto);
      if (pontos > melhor.pontuacao && texto.length > 60) {
        melhor = {
          texto: texto,
          tabelas: tabelasDe(doc),
          origem: origem,
          pontuacao: pontos
        };
      }
      let iframes;
      try {
        iframes = doc.querySelectorAll('iframe');
      } catch (e) {
        return;
      }
      for (let i = 0; i < iframes.length; i++) {
        const frame = iframes[i];
        let interno = null;
        try {
          interno = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        } catch (e) {
          interno = null;
        }
        if (interno) {
          const nome = frame.id || frame.name || ('iframe[' + i + ']');
          visitar(interno, origem + '>' + nome, profundidade + 1);
        }
      }
    }

    try {
      // Caminho preferencial do SEI, depois varredura geral.
      const raiz = document.getElementById('ifrConteudoVisualizacao');
      if (raiz) {
        const doc1 = raiz.contentDocument || (raiz.contentWindow && raiz.contentWindow.document);
        if (doc1) {
          visitar(doc1, 'ifrConteudoVisualizacao', 1);
          const interno = doc1.getElementById('ifrVisualizacao');
          const doc2 = interno && (interno.contentDocument || (interno.contentWindow && interno.contentWindow.document));
          if (doc2) visitar(doc2, 'ifrConteudoVisualizacao>ifrVisualizacao', 2);
        }
      }
      visitar(document, 'documento', 0);
    } catch (e) {
      console.warn('Falha ao coletar documento:', e);
    }

    if (melhor.pontuacao < 0) {
      return {
        url: location.href,
        titulo: document.title,
        texto: document.body ? document.body.innerText : '',
        tabelas: [],
        origem: 'documento'
      };
    }

    return {
      url: location.href,
      titulo: document.title,
      texto: melhor.texto,
      tabelas: melhor.tabelas,
      origem: melhor.origem
    };
  }

  /**
   * Localiza um elemento no documento principal ou em iframes da mesma origem.
   * @param {string[]} seletores
   * @returns {{el: Element, doc: Document}|null}
   */
  function localizarPorSeletores(seletores) {
    const lista = Array.isArray(seletores) ? seletores : [seletores];
    const visitados = new Set();

    function buscar(doc) {
      if (!doc || visitados.has(doc)) return null;
      visitados.add(doc);
      for (let i = 0; i < lista.length; i++) {
        if (!lista[i]) continue;
        let achado = null;
        try {
          achado = doc.querySelector(lista[i]);
        } catch (e) {
          achado = null;
        }
        if (achado) return { el: achado, doc: doc };
      }
      let iframes;
      try {
        iframes = doc.querySelectorAll('iframe');
      } catch (e) {
        return null;
      }
      for (let i = 0; i < iframes.length; i++) {
        let interno = null;
        try {
          const frame = iframes[i];
          interno = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        } catch (e) {
          interno = null;
        }
        if (!interno) continue;
        const encontrado = buscar(interno);
        if (encontrado) return encontrado;
      }
      return null;
    }

    return buscar(document);
  }

  /**
   * Localiza um elemento cujo texto (trim) casa com um dos valores informados.
   * @param {string[]} textos
   * @returns {Element|null}
   */
  function localizarPorTexto(textos) {
    const alvos = (textos || []).map((t) => String(t).toLowerCase());
    const visitados = new Set();

    function norm(s) {
      return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function buscar(doc) {
      if (!doc || visitados.has(doc)) return null;
      visitados.add(doc);
      const candidatos = doc.querySelectorAll('input[type="submit"], input[type="button"], button, a');
      for (let i = 0; i < candidatos.length; i++) {
        const el = candidatos[i];
        const rotulo = norm(el.value || el.getAttribute('value') || el.innerText || el.textContent);
        if (!rotulo) continue;
        for (let j = 0; j < alvos.length; j++) {
          if (rotulo === alvos[j] || rotulo.indexOf(alvos[j]) === 0) return el;
        }
      }
      let iframes;
      try {
        iframes = doc.querySelectorAll('iframe');
      } catch (e) {
        return null;
      }
      for (let i = 0; i < iframes.length; i++) {
        let interno = null;
        try {
          const frame = iframes[i];
          interno = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        } catch (e) {
          interno = null;
        }
        if (!interno) continue;
        const encontrado = buscar(interno);
        if (encontrado) return encontrado;
      }
      return null;
    }

    return buscar(document);
  }

  /**
   * Escreve um valor disparando os eventos que os frameworks escutam.
   * @param {Element} el
   * @param {string} valor
   */
  function aplicarValor(el, valor) {
    const tag = el.tagName;
    const proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descritor = Object.getOwnPropertyDescriptor(proto, 'value');
    try {
      if (descritor && descritor.set) descritor.set.call(el, valor);
      else el.value = valor;
    } catch (e) {
      el.value = valor;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    try {
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    } catch (e) {
      /* alguns navegadores bloqueiam; irrelevante */
    }
  }

  /**
   * Preenche os campos de texto e autoridade do formulario de cadastro.
   * @param {{texto: string, autoridade: string, seletores: {texto: string|string[], autoridade: string|string[]}}} payload
   * @returns {{ok: boolean, texto: boolean, autoridade: boolean, detalhe: string}}
   */
  function aplicarCamposTexto(payload) {
    const sel = payload.seletores || {};
    const resultado = { ok: false, texto: false, autoridade: false, detalhe: '' };

    const alvoTexto = localizarPorSeletores(sel.texto);
    if (alvoTexto) {
      try {
        alvoTexto.el.focus();
        aplicarValor(alvoTexto.el, payload.texto || '');
        alvoTexto.el.style.transition = 'background-color .4s ease';
        alvoTexto.el.style.backgroundColor = '#e6f7ff';
        setTimeout(function () {
          alvoTexto.el.style.backgroundColor = '';
        }, 900);
        resultado.texto = true;
      } catch (e) {
        resultado.detalhe = 'texto: ' + e.message;
      }
    } else {
      resultado.detalhe = 'campo de texto do elogio nao encontrado';
    }

    const alvoAutoridade = localizarPorSeletores(sel.autoridade);
    if (alvoAutoridade) {
      try {
        alvoAutoridade.el.focus();
        aplicarValor(alvoAutoridade.el, payload.autoridade || '');
        alvoAutoridade.el.style.transition = 'background-color .4s ease';
        alvoAutoridade.el.style.backgroundColor = '#e6f7ff';
        setTimeout(function () {
          alvoAutoridade.el.style.backgroundColor = '';
        }, 900);
        resultado.autoridade = true;
      } catch (e) {
        resultado.detalhe = (resultado.detalhe ? resultado.detalhe + '; ' : '') + 'autoridade: ' + e.message;
      }
    } else {
      resultado.detalhe = (resultado.detalhe ? resultado.detalhe + '; ' : '') + 'campo de autoridade nao encontrado';
    }

    resultado.ok = resultado.texto || resultado.autoridade;
    return resultado;
  }

  /**
   * Inclui um unico RG no formulario: escreve no campo e aciona o botao.
   * @param {{rg: string, seletores: {rg: string|string[], adicionar: string|string[], adicionarTexto: string[]}}} payload
   * @returns {{ok: boolean, motivo: string}}
   */
  function adicionarRG(payload) {
    const sel = payload.seletores || {};
    const rg = String(payload.rg || '').replace(/\D/g, '');

    if (!/^\d{5}$/.test(rg)) {
      return { ok: false, motivo: 'RG invalido: ' + payload.rg };
    }

    const alvoCampo = localizarPorSeletores(sel.rg);
    if (!alvoCampo) {
      return { ok: false, motivo: 'campo de RG nao encontrado' };
    }

    let botao = null;
    let reserva = null;
    const listaBotoes = Array.isArray(sel.adicionar) ? sel.adicionar : [sel.adicionar];
    for (let i = 0; i < listaBotoes.length; i++) {
      const achado = localizarPorSeletores(listaBotoes[i]);
      if (!achado) continue;
      const tag = String(achado.el.tagName || '').toUpperCase();
      const tipo =
        tag === 'BUTTON'
          ? String(achado.el.getAttribute('type') || 'submit').toLowerCase()
          : String(achado.el.type || '').toLowerCase();
      // Um botao que submete o form recarrega a pagina e quebra a fila de RGs.
      if (tipo !== 'submit') {
        botao = achado;
        break;
      }
      if (!reserva) reserva = achado;
    }
    if (!botao) botao = reserva;

    if (!botao) {
      const porTexto = localizarPorTexto(sel.adicionarTexto || ['adicionar', 'incluir', 'ok', 'confirmar']);
      if (porTexto) botao = { el: porTexto, doc: porTexto.ownerDocument };
    }
    if (!botao) {
      return { ok: false, motivo: 'botao de inclusao de RG nao encontrado' };
    }

    try {
      alvoCampo.el.focus();
      aplicarValor(alvoCampo.el, '');
      aplicarValor(alvoCampo.el, rg);
      alvoCampo.el.style.transition = 'background-color .3s ease';
      alvoCampo.el.style.backgroundColor = '#e6f7ff';
      setTimeout(function () {
        alvoCampo.el.style.backgroundColor = '';
      }, 600);
    } catch (e) {
      return { ok: false, motivo: 'erro ao escrever o RG: ' + e.message };
    }

    try {
      botao.el.click();
    } catch (e) {
      return { ok: false, motivo: 'erro ao acionar o botao: ' + e.message };
    }

    return { ok: true, motivo: '' };
  }

  /**
   * Le o estado atual do formulario (usado para validar antes de gravar).
   * @param {{seletores: {rg: string|string[], texto: string|string[], autoridade: string|string[]}}} payload
   * @returns {{texto: string, autoridade: string, rg: string, temCampoRg: boolean}}
   */
  function lerEstadoFormulario(payload) {
    const sel = (payload && payload.seletores) || {};
    const saida = { texto: '', autoridade: '', rg: '', temCampoRg: false };
    const texto = localizarPorSeletores(sel.texto);
    if (texto) saida.texto = String(texto.el.value || '');
    const autoridade = localizarPorSeletores(sel.autoridade);
    if (autoridade) saida.autoridade = String(autoridade.el.value || '');
    const rg = localizarPorSeletores(sel.rg);
    if (rg) {
      saida.rg = String(rg.el.value || '');
      saida.temCampoRg = true;
    }
    return saida;
  }

  /**
   * Verifica se a aba pertence a um site suportado pela extensao.
   * @returns {{host: string, tipo: string}}
   */
  function detectarSite() {
    const host = String(location.hostname || '').toLowerCase();
    let tipo = 'desconhecido';
    if (host.indexOf('sei.go.gov.br') !== -1) tipo = 'sei';
    else if (host.indexOf('sisp.ssp.go.gov.br') !== -1) tipo = 'sicad';
    return { host: host, tipo: tipo };
  }

  /**
   * Despachante autocontido: e a unica funcao deste arquivo que pode ser
   * passada a chrome.scripting.executeScript, porque resolve os helpers
   * atraves de window.DOPM.injected (instalado pelo injetor de arquivo).
   * @param {{metodo: string, payload?: *}} pedido
   * @returns {{ok: boolean, dados?: *, erro?: string}}
   */
  function executarNoDocumento(pedido) {
    const alvo = pedido || {};
    const api = window.DOPM && window.DOPM.injected;
    if (!api) return { ok: false, erro: 'modulo injetado indisponivel' };
    const metodos = {
      collectDocument: api.collectDocument,
      applyTextFields: api.applyTextFields,
      addRg: api.addRg,
      readFormState: api.readFormState,
      detectSite: api.detectSite
    };
    const fn = metodos[alvo.metodo];
    if (typeof fn !== 'function') return { ok: false, erro: 'metodo desconhecido: ' + alvo.metodo };
    try {
      return { ok: true, dados: fn(alvo.payload) };
    } catch (e) {
      return { ok: false, erro: (e && e.message) || String(e) };
    }
  }

  global.DOPM.injected = {
    collectDocument: collectDocument,
    applyTextFields: aplicarCamposTexto,
    addRg: adicionarRG,
    readFormState: lerEstadoFormulario,
    detectSite: detectarSite,
    executarNoDocumento: executarNoDocumento
  };
})(window);
