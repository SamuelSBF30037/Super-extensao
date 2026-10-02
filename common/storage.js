/**
 * Super DOPM - Camada de persistencia (v3.0)
 *
 * Usa chrome.storage.local (compartilhado entre o service worker e o painel).
 * Em caso de indisponibilidade, cai para localStorage.
 */

window.DOPM = window.DOPM || {};

(function (global) {
  'use strict';

  const temChromeStorage = !!(global.chrome && global.chrome.storage && global.chrome.storage.local);

  async function get(chave) {
    if (temChromeStorage) {
      const resultado = await global.chrome.storage.local.get(chave);
      return resultado ? resultado[chave] : undefined;
    }
    try {
      const bruto = global.localStorage.getItem(chave);
      return bruto === null ? undefined : JSON.parse(bruto);
    } catch (e) {
      return undefined;
    }
  }

  async function set(chave, valor) {
    if (temChromeStorage) {
      await global.chrome.storage.local.set({ [chave]: valor });
      return;
    }
    try {
      global.localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) {
      console.warn('Falha ao gravar em storage:', e);
    }
  }

  async function remove(chave) {
    if (temChromeStorage) {
      await global.chrome.storage.local.remove(chave);
      return;
    }
    try {
      global.localStorage.removeItem(chave);
    } catch (e) {
      /* ignora */
    }
  }

  /**
   * Le varias chaves de uma vez.
   * @param {string[]} chaves
   * @returns {Promise<Object>}
   */
  async function getMany(chaves) {
    if (temChromeStorage) {
      return await global.chrome.storage.local.get(chaves);
    }
    const saida = {};
    for (const chave of chaves) {
      const valor = await get(chave);
      if (valor !== undefined) saida[chave] = valor;
    }
    return saida;
  }

  global.DOPM.storage = { get: get, set: set, remove: remove, getMany: getMany };
})(window);
