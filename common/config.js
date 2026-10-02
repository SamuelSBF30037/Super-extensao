/**
 * Super DOPM - Configuracao central (v3.0)
 *
 * Uma unica fonte de verdade para:
 *  - padroes de reconhecimento dos documentos do SEI (itens de DOPM);
 *  - seletores dos campos do formulario de cadastro (SICAD);
 *  - tempos de automatizacao do navegador;
 *  - timings e chaves de armazenamento.
 *
 * A configuracao pode ser sobrescrita remotamente (stive.com.br). O resultado
 * e sempre mesclado sobre o DEFAULT_CONFIG, de modo que chaves novas nunca
 * quebrem o modulo.
 */

window.DOPM = window.DOPM || {};

(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    config: 'dopm.config',
    iniciais: 'dopm.iniciais',
    tema: 'dopm.tema',
    documento: 'dopm.documento',
    dados: 'dopm.dados'
  };

  /**
   * Padroes de texto. Strings sao compiladas como regex case-insensitive.
   */
  const PATTERNS = {
    /* ---------- Identificacao do documento ---------- */

    // Titulos que indicam o tipo de documento no SEI.
    itemPatterns: [
      'ITEM\\s+DOPM',
      'ITEM\\s+PARA\\s+DOPM',
      'ITEM\\s+DOEPM'
    ],

    // "DADOS DO POLICIAL MILITAR PARA CADASTRO EM BOLETIM" (tabela restrita).
    tabelaRestritaHeaders: [
      'DADOS\\s+DO\\s+POLICIAL\\s+MILITAR\\s+PARA\\s+CADASTRO',
      'POSTO\\s*/?\\s*GRADUA[CÇ][ÃA]O',
      'POSTO\\s*/?\\s*GRADUA[CÇ][ÃA]O,\\s*RG\\s+E\\s+NOME\\s+COMPLETO'
    ],

    // Linhas de inicio de um elogio, por ordem de preferencia.
    elogioStartPatterns: [
      'DE\\s+ACORDO\\s+COM\\s+O\\s+QUE\\s+ME\\s+FACULTA',
      'OS\\s+POLICIAIS\\s+MILITARES\\s+FORAM\\s+ELOGIADOS',
      'POR\\s+TEREM',
      'POR\\s+TER\\b',
      'PELO\\s+TER\\b',
      'PELO\\s+SEU',
      'PELA\\s+CONTRIBUI[CÇ][ÃA]O',
      'PELA\\s+POSTURA',
      'QUE\\s+SEMPRE'
    ],

    // Encerramento padrao dos itens do formato "Item para DOPM" (4a PARTE).
    elogioClosePatterns: [
      'CONSTE-?SE\\s+EM\\s+SEUS\\s+ASSENTAMENTOS',
      'CONSTE\\s+EM\\s+SEUS\\s+ASSENTAMENTOS'
    ],

    // Fecho do item: "I - Individual."
    elogioCloseAuxPatterns: [
      'I\\s*[-\u2013\u2014]\\s*INDIVIDUAL'
    ],

    // Marcadores de tabela dos itens do formato "Item para DOPM".
    elogioSectionPatterns: [
      'ELOGIO\\s+(?:A|O)\\s+POLICIAIS\\s+MILITARES',
      'JUSTI[CÇ][ÃA]E\\s+E\\s+DISCIPLINA'
    ],

    // Assinatura da autoridade no fim do elogio:
    // "IPORA-GO, AOS 16 DE SETEMBRO DE 2026." / "Anapolis-GO, 29/06/2026." /
    // "CERES - GO, aos 03 dias mes de Agosto de 2026."
    // O local nao aceita pontuacao nem verbos, senao o padrao "gruda" no
    // paragrafo anterior ("te-se em seus assentamentos. Anapolis-GO").
    assinaturaPatterns: [
      '[A-Z\u00c0-\u00de][A-Za-z\u00c0-\u00ff]{0,28}(?:\\s+[A-Z\u00c0-\u00de][A-Za-z\u00c0-\u00ff]{0,28}){0,2}\\s*-\\s?GO\\s*,\\s*(?:AOS?\\s+)?(?:\\d{1,2}\\s+DE\\s+[A-Za-z\u00c0-\u00ff]+\\s+DE\\s*|\\d{1,2}\\s+DIA[S]?\\s+M[EÊ]S\\s+DE\\s+[A-Za-z\u00c0-\u00ff]+\\s+DE\\s*|\\d{1,2}\\/\\d{1,2}\\/)\\d{4}'
    ],

    // Cargos que precedem o nome da autoridade.
    authorityTitles: [
      'COMANDANTE', 'SUB-COMANDANTE', 'SUBCOMANDANTE', 'CHEFE', 'DIRETOR',
      'ASSISTENTE', 'RESP', 'PRESIDENTE', 'PRIMEIRO-TENENTE', 'TENENTE'
    ],

    // Postos/graduacoes usados na tabela restrita e no corpo dos textos.
    postoPatterns: [
      'SUB\\s?-?\\s?TENENTE', 'SUBTENENTE',
      'TENENTE-?\\s?CORONEL', 'CORONEL', 'TENENTE', 'CAPIT[AÃ]O', 'MAJOR',
      'PRIMEIRO\\s?-?\\s?SARGENTO', '1[ºo°]?\\s?-?\\s?SARGENTO', 'SARGENTO', 'SGT',
      'SEGUNDO\\s?-?\\s?SARGENTO', '2[ºo°]?\\s?-?\\s?SARGENTO',
      'TERCEIRO\\s?-?\\s?SARGENTO', '3[ºo°]?\\s?-?\\s?SARGENTO',
      'CABO', 'CB', 'SOLDADO', 'SD'
    ],

    // Tokens que nunca fazem parte de um nome na tabela.
    postoTokens: [
      'PM', 'QPPM', 'QOEPOM', 'PMGO', 'SGT', 'CABO', 'CB', 'SD', 'SOLDADO',
      'SARGENTO', 'TENENTE', 'CAPITAO', 'CAPITÃO', 'MAJOR', 'CORONEL',
      'PRIMEIRO', 'SEGUNDO', 'TERCEIRO', 'SUB', 'SUBTENENTE', 'CORONEL',
      'ALUNO', 'CADETE'
    ],

    // Ruido do SEI (rodape/cabecalho repetido, assinatura digital, endereco).
    noisePatterns: [
      'SEI\\s+\\d{4,}\\s*\\/\\s*PG\\.?\\s*\\d+',
      '\\(?OBS\\s*:?[^\\n]{0,200}?boletim[^\\n]{0,20}?\\)?',
      'Item\\s+(?:para\\s+)?DOPM\\s*[-–—]\\s*Elogio\\s+\\d+(?!\\s*(?:N|º|N°))[^\\n]*',
      'Item\\s+para\\s+DOPM\\s+N[^\\n]*?\\(\\d{6,}\\)[^\\n]*',
      'Criado\\s+por\\s+\\d{5,}[^\\n]{0,160}?\\d{2}:\\d{2}(?::\\d{2})?\\.?',
      'Verifique\\s+se\\s+este\\s+documento\\s+foi\\s+assinado\\s+digitalmente[^\\n]*',
      'Documento\\s+assinado\\s+eletronicamente\\s+por[\\s\\S]*?8\\.808/2016\\.?',
      'A\\s+autenticidade\\s+do\\s+documento[\\s\\S]*?CRC\\s+[0-9A-Fa-f]{4,}\\.?',
      'Refer[eê]ncia:\\s*Processo\\s+n?[ºo°]?[^\\n]*',
      'c[oó]digo\\s+verificador[^\\n]*',
      '\\d{1,2}º\\s+BATALH[AÃ]O\\s+DE\\s+POL[IÍ]CIA\\s+MILITAR[\\s\\S]{0,400}?\\(\\d{2}\\)\\d{4}-\\d{4}',
      '\\d{1,2}º\\s+BATALH[AÃ]O\\s+DE\\s+POL[IÍ]CIA\\s+MILITAR\\s+DO\\s+ESTADO\\s+DE\\s+GOI[AÁ]S',
      '\\d{1,2}[^\\S\\n]+[ºo°ª]?[^\\S\\n]*BPM[^\\S\\n]+P/\\d[^\\S\\n]+ADMINISTRATIVA',
      'P/\\d[^\\S\\n]+ADMINISTRATIVA[^\\S\\n]+DO[^\\S\\n]+\\d{1,2}[^\\S\\n]*[ºo°ª]?[^\\S\\n]*BPM',
      'AVENIDA[\\s\\S]{0,300}?\\(?\\d{2}\\)?\\s*\\d{4}-\\d{4}',
      'ESTADO\\s+DE\\s+GOI[AÁ]S\\s*\\n?\\s*POL[IÍ]CIA\\s+MILITAR',
      'ESTADO\\s+DE\\s+GOI[AÁ]S',
      'DESPACHO:',
      'Processo\\s+SEI\\s+n?[ºo°]?[^\\n]*',
      'PROCESSO\\s+SEI\\s+N[ºO°]?\\s*\\d+'
    ],

    // Marcadores de fim de documento: tudo a partir daqui nao entra no texto.
    fimPatterns: [
      'DESPACHO',
      'Documento\\s+assinado',
      'Refer[eê]ncia:',
      'Item\\s+(?:para\\s+)?DOPM',
      'ITEM\\s+DOPM',
      'ITEM\\s+PARA',
      'Processo\\s+SEI',
      'PROCESSO\\s+SEI',
      'ESTADO\\s+DE\\s+GOI',
      'UNIDADE\\s+POLICIAL\\s+MILITAR',
      'Publique-?se',
      '\\d{1,2}\\s*[ºo°]?\\s*BPM\\s+P/\\d',
      'AVENIDA\\s',
      'ADMINISTRATIVA\\s+DO\\s+\\d{1,2}\\s*[ºo°]?\\s*BPM',
      '\\d{1,2}\\s*[ºo°]?\\s*BATALH[AÃ]O'
    ]
  };

  const FIELD_SELECTORS = {
    // Campo de texto do elogio no formulario de cadastro.
    textoElogio: '#textoElogio',
    // Campo de nome da autoridade.
    autoridade: '#autoridade',
    // Campo de digitacao do RG.
    rg: "input[name='rg']",
    // Botao que confirma a inclusao do RG.
    adicionarRg: "input[value='Adicionar']",
    // Alternativas para o botao de inclusao do RG (tentadas em ordem).
    adicionarRgAlternativas: [
      "input[type='submit'][value^='Adicionar' i]",
      "input[type='button'][value^='Adicionar' i]",
      "input[type='submit'][value^='Incluir' i]",
      "button[id*='adicionar' i]",
      "a[id*='adicionar' i]",
      "input[name='Adicionar']"
    ],
    // Lista onde os RGs incluidos aparecem (usado apenas para validacao visual).
    rgLista: "input[name='rg'], table"
  };

  const TIMINGS = {
    // Intervalo entre inclusoes de RG: escreve, clica em "Adicionar" e espera
    // o SICAD processar antes do proximo (ms).
    rgProcessingDelay: 2000,
    // Espera entre foco e escrita em um campo (ms).
    fieldFocusDelay: 120,
    // Espera entre a escrita e o clique no botao (ms).
    buttonClickDelay: 150,
    // Intervalo de sondagem enquanto procura os campos (ms).
    probeDelay: 400,
    // Numero maximo de sondagens antes de desistir (0 = sem limite).
    maxProbes: 25
  };

  const DEFAULT_CONFIG = {
    version: '3.0',
    lastUpdate: '2026-09-30',
    patterns: PATTERNS,
    fieldSelectors: FIELD_SELECTORS,
    timings: TIMINGS,
    elogio: {
      // Iniciais do usuario anexadas ao final do texto.
      iniciaisPadrao: 'RNMM.',
      // Caracter usado para unir o texto as iniciais.
      separadorIniciais: ' ',
      // Manter o texto em caixa alta (padrao do modelo de cadastro).
      forcarMaiusculas: true,
      // Colapsar espacos extras gerados pela quebra de linha do SEI.
      normalizarEspacos: true
    }
  };

  const CONFIG_URL = 'https://stive.com.br/BAPM2/adm/config.json';

  /**
   * Mescla duas configuracoes preservando arrays vindos da remota.
   * @param {Object} base
   * @param {Object} over
   * @returns {Object}
   */
  function deepMerge(base, over) {
    if (Array.isArray(over)) return over.slice();
    if (over === null || typeof over !== 'object') return over;
    const out = Object.assign({}, base);
    for (const key of Object.keys(over)) {
      out[key] = key in base ? deepMerge(base[key], over[key]) : over[key];
    }
    return out;
  }

  /**
   * Valida a estrutura minima da configuracao.
   * @param {Object} config
   * @returns {{ok: boolean, erros: string[]}}
   */
  function validateConfig(config) {
    const erros = [];
    if (!config || typeof config !== 'object') {
      return { ok: false, erros: ['configuracao invalida'] };
    }

    ['patterns', 'fieldSelectors', 'timings'].forEach((secao) => {
      if (!config[secao] || typeof config[secao] !== 'object') {
        erros.push('secao ausente: ' + secao);
      }
    });

    if (config.patterns) {
      [
        'itemPatterns', 'elogioStartPatterns', 'authorityTitles',
        'postoPatterns', 'noisePatterns', 'assinaturaPatterns'
      ].forEach((campo) => {
        if (!Array.isArray(config.patterns[campo]) || !config.patterns[campo].length) {
          erros.push('patterns.' + campo + ' deve ser array nao vazio');
        }
      });
    }

    if (config.fieldSelectors) {
      ['textoElogio', 'autoridade', 'rg', 'adicionarRg'].forEach((campo) => {
        if (typeof config.fieldSelectors[campo] !== 'string' || !config.fieldSelectors[campo]) {
          erros.push('fieldSelectors.' + campo + ' invalido');
        }
      });
    }

    if (config.timings) {
      Object.keys(config.timings).forEach((campo) => {
        const valor = config.timings[campo];
        if (typeof valor !== 'number' || valor < 0) {
          erros.push('timings.' + campo + ' invalido');
        }
      });
    }

    return { ok: erros.length === 0, erros: erros };
  }

  /**
   * Carrega a configuracao na ordem: cache local -> servidor -> padrao.
   * @returns {Promise<{config: Object, origem: string, avisos: string[]}>}
   */
  async function loadConfig() {
    const avisos = [];
    let base = DEFAULT_CONFIG;

    // 1) Cache local (ultima configuracao remota valida).
    const cache = await global.DOPM.storage.get(STORAGE_KEYS.config);
    if (cache && cache.value) {
      const validacao = validateConfig(cache.value);
      if (validacao.ok) {
        base = cache.value;
      } else {
        avisos.push('cache local invalido: ' + validacao.erros.join(', '));
      }
    }

    // 2) Servidor (opcional; a extensao funciona 100% offline).
    try {
      const resposta = await fetch(CONFIG_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-cache'
      });
      if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
      const remota = await resposta.json();
      const validacao = validateConfig(remota);
      if (validacao.ok) {
        const merged = deepMerge(base, remota);
        await global.DOPM.storage.set(STORAGE_KEYS.config, merged);
        return { config: merged, origem: 'servidor', avisos: avisos };
      }
      avisos.push('configuracao remota invalida: ' + validacao.erros.join(', '));
    } catch (e) {
      avisos.push('servidor indisponivel (' + e.message + '); usando configuracao local');
    }

    return { config: base, origem: base === DEFAULT_CONFIG ? 'padrao' : 'cache', avisos: avisos };
  }

  global.DOPM.config = {
    STORAGE_KEYS: STORAGE_KEYS,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    CONFIG_URL: CONFIG_URL,
    deepMerge: deepMerge,
    validateConfig: validateConfig,
    loadConfig: loadConfig
  };
})(window);
