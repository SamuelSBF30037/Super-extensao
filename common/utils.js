/**
 * Super DOPM - Utilitarios (v3.0)
 */

window.DOPM = window.DOPM || {};

(function (global) {
  'use strict';

  /**
   * Normaliza texto para comparacao: sem acentos, maiusculo, espacos unicos.
   * @param {string} texto
   * @returns {string}
   */
  function normalizar(texto) {
    if (!texto) return '';
    return String(texto)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[º°ª]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Colapsa espacos (inclusive os gerados por quebra de linha do SEI) e
   * remove espacos antes de pontuacao.
   * @param {string} texto
   * @returns {string}
   */
  function colapsarEspacos(texto) {
    if (!texto) return '';
    return String(texto)
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?\)])/g, '$1')
      .replace(/\(\s+/g, '(')
      .trim();
  }

  /**
   * Remove quebras de hifen de fim de linha ("EVADIR-\nSE" -> "EVADIRSE"),
   * comuns no texto do SEI quando a palavra e hifenizada.
   * @param {string} texto
   * @returns {string}
   */
  function juntarHifenizados(texto) {
    if (!texto) return '';
    return String(texto).replace(/([A-Za-z\u00c0-\u00ff])-\s*\n\s*([A-Za-z\u00c0-\u00ff])/g, '$1$2');
  }

  /**
   * Sanitiza o texto do elogio: joins, normalizacao e limpeza de ruido.
   * @param {string} texto
   * @param {{normalizarEspacos?: boolean, forcarMaiusculas?: boolean}} opcoes
   * @returns {string}
   */
  function limparTexto(texto, opcoes) {
    const cfg = opcoes || {};
    let saida = String(texto || '');
    saida = juntarHifenizados(saida);
    if (cfg.normalizarEspacos !== false) saida = colapsarEspacos(saida);
    if (cfg.forcarMaiusculas) saida = saida.toLocaleUpperCase('pt-BR');
    return saida.trim();
  }

  /**
   * Compila uma lista de padroes em uma unica regex alternada.
   * @param {string[]} padroes
   * @param {string} flags
   * @returns {RegExp}
   */
  function alternar(padroes, flags) {
    const lista = (padroes || []).map((p) => '(?:' + p + ')');
    return new RegExp(lista.length ? lista.join('|') : '(?!x)x', flags || 'gi');
  }

  /**
   * Escapa metacaracteres de regex.
   * @param {string} texto
   * @returns {string}
   */
  function escaparRegex(texto) {
    return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Valida um RG PMGO (5 digitos, com ou sem separador).
   * @param {string} rg
   * @returns {string|null} RG normalizado ou null
   */
  function normalizarRG(rg) {
    if (!rg) return null;
    const digitos = String(rg).replace(/\D/g, '');
    return /^\d{5}$/.test(digitos) ? digitos : null;
  }

  /**
   * Normaliza uma lista de RGs informados manualmente (separados por
   * virgula, ponto e virgula, espaco ou quebra de linha).
   * @param {string} entrada
   * @returns {string[]}
   */
  function normalizarListaRG(entrada) {
    if (!entrada) return [];
    const brutos = String(entrada).split(/[;,\n]+|\s{2,}/);
    const saida = [];
    brutos.forEach((bruto) => {
      const candidatos = bruto.trim().split(/\s+/);
      candidatos.forEach((candidato) => {
        const rg = normalizarRG(candidato);
        if (rg && saida.indexOf(rg) === -1) saida.push(rg);
      });
    });
    return saida;
  }

  /**
   * Remove acentos de um texto (mantendo caixa).
   * @param {string} texto
   * @returns {string}
   */
  function removerAcentos(texto) {
    if (!texto) return '';
    return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Cria um id curto e unico.
   * @returns {string}
   */
  function gerarUID() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /**
   * Aplica um limite de execucao a uma funcao assincrona.
   * @param {Function} fn
   * @param {number} ms
   * @returns {Promise<*>}
   */
  function comTimeout(fn, ms) {
    return new Promise((resolve, reject) => {
      let concluir = false;
      const timer = setTimeout(() => {
        if (!concluir) reject(new Error('tempo limite de ' + ms + 'ms excedido'));
      }, ms);
      Promise.resolve()
        .then(fn)
        .then((valor) => {
          concluir = true;
          clearTimeout(timer);
          resolve(valor);
        })
        .catch((erro) => {
          concluir = true;
          clearTimeout(timer);
          reject(erro);
        });
    });
  }

  /**
   * Espera um numero de milissegundos.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  global.DOPM.utils = {
    normalizar: normalizar,
    colapsarEspacos: colapsarEspacos,
    juntarHifenizados: juntarHifenizados,
    limparTexto: limparTexto,
    alternar: alternar,
    escaparRegex: escaparRegex,
    normalizarRG: normalizarRG,
    normalizarListaRG: normalizarListaRG,
    removerAcentos: removerAcentos,
    gerarUID: gerarUID,
    comTimeout: comTimeout,
    esperar: esperar
  };
})(window);
