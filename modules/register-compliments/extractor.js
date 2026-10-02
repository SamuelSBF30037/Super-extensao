/**
 * Super DOPM - Extrator de itens de DOPM (v3.0)
 *
 * Converte o texto capturado do SEI em uma estrutura normalizada:
 *
 *   {
 *     formato: 'item-dopm' | 'item-para-dopm' | 'desconhecido',
 *     titulo, numero, unidade, processo, documento,
 *     assinaturaFinal, // quem assina o DOPM ("NOME - POSTO. CARGO.")
 *     tabela: { registros: [{posto, rg, nome, cpf}], blocos: [[registro]] },
 *     elogios: [{
 *       id, indice, rotulo,
 *       texto,            // cadastro: local/data + autoridade + assinatura final
 *       textoBase,        // sem a assinatura da autoridade
 *       assinatura,       // "IPORA-GO, AOS 16 DE SETEMBRO DE 2026."
 *       autoridade,       // nome de quem prestou o elogio
 *       autoridadeBloco,  // nome + posto + cargo ("JUAREZ ... - CAPITAO QOPM. COMANDANTE DA 4º CIA")
 *       assinaturaFinal,  // copia da assinatura final do documento
 *       rgs: ['33024', ...],
 *       origemRGs: 'nome' | 'bloco' | 'tabela' | 'nenhum'
 *     }]
 *   }
 *
 * Funciona sem DOM: se as tabelas do SEI nao estiverem disponiveis, a tabela
 * de acesso restrito e reconstruida a partir do texto.
 *
 * Compativel com Node (testes) e com o navegador (window.DOPM.extractor).
 */

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DOPM = root.DOPM || {};
  root.DOPM.extractor = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ====================================================================== */
  /* Helpers                                                                 */
  /* ====================================================================== */

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

  function juntarHifenizados(texto) {
    if (!texto) return '';
    return String(texto).replace(/([A-Za-z\u00c0-\u00ff])-\s*\n\s*([A-Za-z\u00c0-\u00ff])/g, '$1$2');
  }

  function uid() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function alternar(lista, flags) {
    return new RegExp(lista.length ? lista.map((p) => '(?:' + p + ')').join('|') : '(?!x)x', flags || 'gi');
  }

  function porTamanhoDesc(lista) {
    return lista.slice().sort((a, b) => b.length - a.length);
  }

  function listaDeTokens(lista) {
    return (lista || []).map((t) => normalizar(t).replace(/[^A-Z]/g, '')).filter(Boolean);
  }

  /* ====================================================================== */
  /* Padroes internos                                                        */
  /* ====================================================================== */

  const POSTO_PADRAO = [
    'SUB\\s?-?\\s?TENENTE', 'SUBTENENTE', 'TENENTE-?\\s?CORONEL', 'CORONEL',
    'CAPIT[AÃ]O', 'MAJOR', 'TENENTE', 'PRIMEIRO\\s?-?\\s?SARGENTO',
    'SEGUNDO\\s?-?\\s?SARGENTO', 'TERCEIRO\\s?-?\\s?SARGENTO',
    '1[ºo°]?\\s?-?\\s?SARGENTO', '2[ºo°]?\\s?-?\\s?SARGENTO',
    '3[ºo°]?\\s?-?\\s?SARGENTO', 'SARGENTO', 'SGT', 'CABO', 'CB', 'SOLDADO', 'SD'
  ];

  const POSTO_TOKEN_PADRAO = [
    'PM', 'QPPM', 'QOEPOM', 'PMGO', 'SGT', 'CABO', 'CB', 'SD', 'SOLDADO',
    'SARGENTO', 'TENENTE', 'CAPITAO', 'CAPITÃO', 'MAJOR', 'CORONEL',
    'PRIMEIRO', 'SEGUNDO', 'TERCEIRO', 'SUB', 'SUBTENENTE', 'ALUNO', 'CADETE'
  ];

/**
   * Assinatura = LOCAL-DDD, data.
   * O local nao pode conter pontuacao nem verbos ("te-se em seus assentamentos.
   * Anapolis-GO"), senao o padrao "gruda" no paragrafo anterior.
   */
  const LUGAR_PADRAO =
    '[A-Z\u00c0-\u00de][A-Za-z\u00c0-\u00ff]{0,28}' +
    '(?:\\s+[A-Z\u00c0-\u00de][A-Za-z\u00c0-\u00ff]{0,28}){0,2}\\s*-\\s?GO';

  const ASSINATURA_PADRAO = [
    LUGAR_PADRAO + '\\s*,\\s*(?:AOS?\\s+)?' +
    '(?:\\d{1,2}\\s+DE\\s+[A-Za-z\u00c0-\u00ff]+\\s+DE\\s*' +
    '|\\d{1,2}\\s+DIA[S]?\\s+M[EÊ]S\\s+DE\\s+[A-Za-z\u00c0-\u00ff]+\\s+DE\\s*' +
    '|\\d{1,2}\\/\\d{1,2}\\/)\\d{4}'
  ];


  const INICIO_ELOGIO_PADRAO = [
    'DE\\s+ACORDO\\s+COM\\s+O\\s+QUE\\s+ME\\s+FACULTA',
    'OS\\s+POLICIAIS\\s+MILITARES\\s+FORAM\\s+ELOGIADOS',
    'POR\\s+TEREM', 'POR\\s+TER\\b', 'PELO\\s+TER\\b', 'PELO\\s+SEU',
    'PELA\\s+CONTRIBUI[CÇ][ÃA]O', 'PELA\\s+POSTURA', 'QUE\\s+SEMPRE'
  ];

  const FECHAMENTO_ELOGIO_PADRAO = [
    'CONSTE-?SE\\s+EM\\s+SEUS\\s+ASSENTAMENTOS',
    'CONSTE\\s+EM\\s+SEUS\\s+ASSENTAMENTOS'
  ];

  const SECAO_ELOGIO_PADRAO = [
    'ELOGIO\\s+A\\s+POLICIAIS\\s+MILITARES',
    'JUSTI[CÇ][ÃA]E\\s+E\\s+DISCIPLINA'
  ];

  const RUIDO_PADRAO = [
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
  ];

  const FIM_PADRAO = [
    'DESPACHO', 'Documento\\s+assinado', 'Refer[eê]ncia:',
    'Item\\s+(?:para\\s+)?DOPM', 'ITEM\\s+DOPM', 'ITEM\\s+PARA',
    'Processo\\s+SEI', 'PROCESSO\\s+SEI', 'ESTADO\\s+DE\\s+GOI',
    'UNIDADE\\s+POLICIAL\\s+MILITAR', 'Publique-?se',
    '\\d{1,2}\\s*[ºo°]?\\s*BPM\\s+P/\\d',
    'AVENIDA\\s', 'ADMINISTRATIVA\\s+DO\\s+\\d{1,2}\\s*[ºo°ª]?\\s*BPM',
    '\\d{1,2}\\s*[ºo°]?\\s*BATALH[AÃ]O'
  ];

  const TABELA_HEADER_PADRAO = [
    'DADOS\\s+DO\\s+POLICIAL\\s+MILITAR\\s+PARA\\s+CADASTRO',
    'POSTO\\s*/?\\s*GRADUA[CÇ][ÃA]O'
  ];

  const RG_LOOSE = /(?<![\d])(\d{2}\s*[.\s]?\s*\d{3})(?![\d])/;

  /* ====================================================================== */
  /* Opcoes de execucao                                                      */
  /* ====================================================================== */

  function opcoesPadrao(config) {
    const c = config || {};
    const p = c.patterns || {};
    const posto = porTamanhoDesc(p.postoPatterns || POSTO_PADRAO);
    const postoToken = listaDeTokens(p.postoTokens || POSTO_TOKEN_PADRAO);
    const tabelaHeader = p.tabelaRestritaHeaders || TABELA_HEADER_PADRAO;

    return {
      posto: posto,
      postoToken: postoToken,
      postoTokenSet: new Set(postoToken),
      rePosto: new RegExp('((?:' + posto.join('|') + '))', 'i'),
      assinatura: p.assinaturaPatterns || ASSINATURA_PADRAO,
      reAssinatura: alternar(p.assinaturaPatterns || ASSINATURA_PADRAO, 'gi'),
      inicio: p.elogioStartPatterns || INICIO_ELOGIO_PADRAO,
      reInicio: alternar(p.elogioStartPatterns || INICIO_ELOGIO_PADRAO, 'gi'),
      fechamento: p.elogioClosePatterns || FECHAMENTO_ELOGIO_PADRAO,
      reFechamento: alternar(p.elogioClosePatterns || FECHAMENTO_ELOGIO_PADRAO, 'gi'),
      secao: p.elogioSectionPatterns || SECAO_ELOGIO_PADRAO,
      reSecao: alternar(p.elogioSectionPatterns || SECAO_ELOGIO_PADRAO, 'i'),
      reRuido: (p.noisePatterns || RUIDO_PADRAO).map((r) => new RegExp(r, 'gi')),
      reFim: alternar(p.fimPatterns || FIM_PADRAO, 'im'),
      tabelaHeader: tabelaHeader,
      reTabelaHeader: alternar(tabelaHeader, 'i'),
      forcarMaiusculas: c.elogio ? c.elogio.forcarMaiusculas !== false : true
    };
  }

  /* ====================================================================== */
  /* Etapa 1 - Metadados e limpeza de ruido                                 */
  /* ====================================================================== */

  function extrairMetadados(texto) {
    const t = String(texto || '');
    const meta = { titulo: '', numero: '', unidade: '', processo: '' };

    // O SEI repete "Item DOPM - Elogio NN ..." no rodape das paginas.
    // So aceitamos a linha de titulo real (tem N[o] ou "para DOPM" e nao tem "/ pg.").
    const reTitulo = /^[ \t]*(ITEM\s+(?:PARA\s+)?(?:DOEPM|DOPM)[^\n]{0,160})/gim;
    let mt;
    while ((mt = reTitulo.exec(t)) !== null) {
      const cand = mt[1];
      if (/SEI\s+\d{4,}\s*\/\s*pg\./i.test(cand)) continue;
      if (!/N[ºo°]\s*\d/i.test(cand) && !/PARA\s+DOPM/i.test(cand)) continue;
      meta.titulo = colapsarEspacos(cand);
      break;
    }

    const elogio = meta.titulo.match(/ELOGIO\s+N?[ºo°]?\s*(\d+(?:\/[A-Z0-9º°.\-]+)?)/i);
    if (elogio) meta.numero = elogio[1];

    if (!meta.numero) {
      const para = meta.titulo.match(/(?:N[ºo°]\s*){1,2}(\d+(?:\/[A-Z0-9º°.\-]*BPM[A-Z0-9º°.\/-]*)?)/i);
      if (para) meta.numero = para[1];
    }

    const unidade =
      meta.titulo.match(/(\d{1,2}\s*[ºo°]?\s*BPM(?:\s*\/\s*\d{1,2}\s*[ºo°]?\s*CRPM)?)/i) ||
      meta.titulo.match(/(PM\/P\/\d)/i);
    if (unidade) meta.unidade = colapsarEspacos(unidade[1]);

    const processo =
      t.match(/(?:Refer[eê]ncia:\s*)?Processo\s+SEI\s+n?[ºo°]?\s*(\d{6,})/i) ||
      t.match(/(?:Refer[eê]ncia:\s*)?PROCESSO\s+SEI\s+N[ºO°]?\s*(\d{6,})/i) ||
      t.match(/Refer[eê]ncia:\s*Processo\s+n?[ºo°]?\s*(\d{6,})/i);
    if (processo) meta.processo = processo[1];

    return meta;
  }

  function removerRuido(texto, opt) {
    let t = String(texto || '').replace(/\r\n?/g, '\n');
    opt.reRuido.forEach((re) => {
      t = t.replace(re, '\n');
    });
    return t;
  }

  /* ====================================================================== */
  /* Etapa 2 - Tabela de acesso restrito                                     */
  /* ====================================================================== */

  /**
   * Interpreta um trecho de tabela ("1º SARGENTO 33.024 ELVIS OLIVEIRA MORAES")
   * e devolve um registro, ou null se nao houver RG de 5 digitos.
   * @param {string} texto
   * @param {Object} opt
   * @returns {{cpf: string, posto: string, rg: string, nome: string, nomeNorm: string}|null}
   */
  function parseRegistro(texto, opt) {
    const normal = String(texto || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normal) return null;

    let cpf = '';
    let resto = normal;
    const mCpf = normal.match(/(\d{3}\s*[.\s]?\s*\d{3}\s*[.\s]?\s*\d{3}\s*-\s?\d{2})/);
    if (mCpf) {
      cpf = mCpf[1].replace(/\D/g, '');
      resto = normal.slice(0, mCpf.index) + ' ' + normal.slice(mCpf.index + mCpf[1].length);
    }

    // Varias "chaves" de 5 digitos podem existir no trecho (ex.: medidas no corpo).
    // Usamos a primeira que estiver fora de um numero maior.
    const reRg = new RegExp(RG_LOOSE.source, 'g');
    let mRg = null;
    let mr;
    while ((mr = reRg.exec(resto)) !== null) {
      if (/^\d{5}$/.test(mr[1].replace(/\D/g, ''))) {
        mRg = mr;
        break;
      }
      if (mr.index === reRg.lastIndex) reRg.lastIndex++;
    }
    if (!mRg) return null;

    const rg = mRg[1].replace(/\D/g, '');
    const antes = resto.slice(0, mRg.index);
    const depois = resto.slice(mRg.index + mRg[1].length);

    const mPosto = antes.match(opt.rePosto);
    const posto = mPosto ? mPosto[1].replace(/\s+/g, ' ').trim().toUpperCase() : '';
    if (!posto) return null;

    const nome = extrairNome(depois, opt.postoTokenSet);

    return { cpf: cpf, posto: posto, rg: rg, nome: nome, nomeNorm: normalizar(nome) };
  }

  /**
   * Conectores legitimos em nomes proprios ("Joao da Silva", "Kesia do Vale").
   * Qualquer outra palavra totalmente minuscula encerra o nome: e o inicio do
   * texto do elogio ("foram elogiados pelo ...").
   */
  const CONECTORES_NOME = ['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'D', 'DEL', 'LA', 'LE', 'Y'];

  /** Corta o nome no primeiro token que seja posto/graduacao ou prosa do elogio. */
  function extrairNome(texto, postoTokenSet) {
    const tokens = String(texto || '')
      .replace(/^[\s.:;,|/\-–—)]+/, '')
      .split(/\s+/);

    const saida = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!t) break;
      const chave = normalizar(t).replace(/[^A-Z]/g, '');
      if (!chave) {
        if (saida.length) break;
        continue;
      }
      if (postoTokenSet.has(chave)) break;
      if (chave === 'CPF') break;
      if (saida.length && t === t.toLowerCase() && CONECTORES_NOME.indexOf(chave) === -1) break;
      saida.push(t);
      if (saida.length >= 8) break;
    }
    return saida.join(' ').replace(/[\s,;.]+$/, '').trim();
  }

  /** Tabelas vindas do DOM do SEI (caminho preferencial). */
  function tabelaDoDOM(tabelas, opt) {
    const registros = [];
    const blocos = [];
    if (!Array.isArray(tabelas)) return { registros: registros, blocos: blocos };

    const temRg = /(?<![\d])\d{2}\s*[.\s]?\s*\d{3}(?![\d])|(?<![\d])\d{5}(?![\d])/;

    for (let i = 0; i < tabelas.length; i++) {
      const tabela = tabelas[i];
      if (!Array.isArray(tabela) || tabela.length < 2) continue;

      const plana = tabela
        .map((linha) => (Array.isArray(linha) ? linha.join(' ') : String(linha)))
        .join(' ');
      if (!opt.reTabelaHeader.test(plana) && !/\bCPF\b/i.test(plana)) continue;
      if (!temRg.test(plana)) continue;

      let atual = [];
      for (let j = 0; j < tabela.length; j++) {
        const celulas = Array.isArray(tabela[j]) ? tabela[j] : [tabela[j]];
        const texto = celulas.join(' ').replace(/\s+/g, ' ').trim();

        if (!texto) {
          if (atual.length) {
            blocos.push(atual);
            atual = [];
          }
          continue;
        }
        if (opt.reTabelaHeader.test(texto) || /^\s*CPF\s*:?\s*$/i.test(texto)) continue;

        const reg = parseRegistro(texto, opt);
        if (reg) {
          registros.push(reg);
          atual.push(reg);
        } else if (atual.length) {
          blocos.push(atual);
          atual = [];
        }
      }
      if (atual.length) blocos.push(atual);
    }

    return { registros: registros, blocos: blocos };
  }

  /**
   * Reconstrucao da tabela a partir do texto (fallback sem DOM).
   *
   * Nao funciona por "linhas": o PDF do SEI usa paragrafos unicos e a tabela
   * de acesso restrito aparece no meio do texto. A varredura e feita por
   * indice, a partir do cabecalho, e os registros sao removidos do corpo para
   * que dados restritos nunca entrem no texto de cadastro.
   */
  function tabelaDoTexto(texto, opt) {
    const registros = [];
    const blocos = [];
    const t = String(texto || '');
    if (!t) return { registros: registros, blocos: blocos, textoSemTabela: t };

    const reHeader = new RegExp(opt.reTabelaHeader.source, 'gi');
    const reFimRegiao = new RegExp(
      '(?:' + opt.fechamento.join('|') + ')' +
        '|[a-h]\\)\\s+(?:Os|OS)\\s+policiais' +
        '|Item\\s+(?:para\\s+)?DOPM' +
        '|[IVX]{1,4}\\s*[-–—]\\s*Conste',
      'i'
    );
    const reReg = new RegExp(
      '(?:(?:CPF[:\\s]*)?(\\d{3}\\s*[.\\s]?\\s*\\d{3}\\s*[.\\s]?\\s*\\d{3}\\s*-\\s*\\d{2})\\s*)?' +
        '(' + opt.posto.join('|') + ')\\s*(?:PM|QPPM|QOEPOM|PMGO)?\\s*' +
        // "SD 2ªClasse 39455": o descritor de classe vem antes do RG
        '(?:\\d\\s*[ºo°ª]?\\s*Classe\\s*)?' +
        '(\\d{2}\\s*[.\\s]?\\s*\\d{3})\\s+' +
        // nome para no primeiro posto/graduacao ou cabecalho de coluna seguinte
        '((?:(?!' + opt.posto.join('|') + '|CPF\\b)[A-Za-z\u00c0-\u00ff][A-Za-z\u00c0-\u00ff\'\\.\\-]*\\s+){1,8})',
      'gi'
    );

    const removidos = [];
    let cursor = 0;

    for (;;) {
      reHeader.lastIndex = cursor;
      const cab = reHeader.exec(t);
      if (!cab) break;

      const inicioRegiao = cab.index;
      const rest = t.slice(cab.index + cab[0].length);
      const mFim = rest.search(reFimRegiao);
      const fimRegiao = mFim === -1 ? t.length : cab.index + cab[0].length + mFim;
      const janela = t.slice(inicioRegiao, fimRegiao);

      let blocoAtual = [];
      let anteriorFim = -1;
      let m;
      reReg.lastIndex = 0;
      while ((m = reReg.exec(janela)) !== null) {
        const bruto = (m[1] ? m[1] + ' ' : '') + m[2] + ' ' + m[3] + ' ' + m[4];
        const reg = parseRegistro(bruto, opt);
        if (reg) {
          // Linha em branco entre grupos = bloco distinto da tabela restrita.
          if (blocoAtual.length && /\n[ \t]*\n/.test(janela.slice(anteriorFim, m.index))) {
            blocos.push(blocoAtual);
            blocoAtual = [];
          }
          registros.push(reg);
          blocoAtual.push(reg);
          anteriorFim = m.index + m[0].length;
          removidos.push([inicioRegiao + m.index, inicioRegiao + anteriorFim]);
        }
        if (m.index === reReg.lastIndex) reReg.lastIndex++;
      }
      if (blocoAtual.length) blocos.push(blocoAtual);

      removidos.push([inicioRegiao, inicioRegiao + cab[0].length]);

      cursor = fimRegiao > inicioRegiao ? fimRegiao : cab.index + cab[0].length;
      if (cursor <= cab.index) cursor = cab.index + 1;
      if (!removidos.length) break;
    }

    // Remove os trechos da tabela (e o cabecalho) do corpo do texto.
    removidos.sort((a, b) => a[0] - b[0]);
    let saida = '';
    let pos = 0;
    removidos.forEach((par) => {
      if (par[0] < pos) return;
      saida += t.slice(pos, par[0]);
      pos = par[1];
    });
    saida += t.slice(pos);

    return {
      registros: registros,
      blocos: blocos,
      textoSemTabela: saida.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n')
    };
  }

  /* ====================================================================== */
  /* Etapa 3 - Divisao em elogios                                            */
  /* ====================================================================== */

  function detectarFormato(texto, opt) {
    const temSecao = opt.reSecao.test(texto);
    const temFechamento = opt.reFechamento.test(texto);
    if (temSecao && temFechamento) return 'item-para-dopm';
    if (opt.reInicio.test(texto)) return 'item-dopm';
    if (temSecao) return 'item-para-dopm';
    return 'desconhecido';
  }

  /** Inicios de elogio, resolvendo sobreposicoes entre padroes. */
  function acharInicios(texto, opt) {
    const brutos = [];
    const re = new RegExp(opt.reInicio.source, 'gi');
    let m;
    while ((m = re.exec(texto)) !== null) {
      brutos.push({ indice: m.index, texto: m[0], ordem: m[0].length });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    brutos.sort((a, b) => a.indice - b.indice || b.ordem - a.ordem);

    const filtrados = [];
    let ultimoFim = -1;
    brutos.forEach((b) => {
      if (b.indice >= ultimoFim) {
        filtrados.push(b);
        ultimoFim = b.indice + b.texto.length;
      }
    });
    return filtrados;
  }

  /** Indice do primeiro marcador de fim de documento, ou -1. */
  function cortarFim(texto, opt) {
    const m = String(texto || '').match(opt.reFim);
    return m ? m.index : -1;
  }

  /**
   * Formato "Item para DOPM" (4a PARTE - JUSTIÇA E DISCIPLINA):
   * um item por bloco "Conste-se em seus assentamentos".
   */
  function blocosItemParaDopm(texto, opt) {
    const marcas = [];
    const re = new RegExp(opt.reFechamento.source, 'gi');
    let m;
    while ((m = re.exec(texto)) !== null) {
      marcas.push({ inicio: m.index, fim: m.index + m[0].length });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (!marcas.length) return [];

    const secao = texto.match(opt.reSecao);
    const inicioSecao = secao ? secao.index : 0;

    const blocos = [];
    for (let i = 0; i < marcas.length; i++) {
      const de = i === 0 ? inicioSecao : marcas[i - 1].fim;
      const ateBruto = i + 1 < marcas.length ? marcas[i + 1].inicio : Math.min(texto.length, marcas[i].fim + 320);
      let pedaco = texto.slice(de, ateBruto);
      if (pedaco.indexOf(texto.slice(marcas[i].inicio, marcas[i].fim)) === -1) {
        pedaco += ' ' + texto.slice(marcas[i].inicio, marcas[i].fim);
      }
      const corte = cortarFim(pedaco, opt);
      if (corte !== -1) pedaco = pedaco.slice(0, corte);

      // O bloco comeca na assinatura do item anterior: corta ate o rotulo do item.
      const marcadores = [];
      let mr;
      const reItem = /([a-z])\)\s+((?:Os|OS)\s+policiais\s+militares)/gi;
      while ((mr = reItem.exec(pedaco)) !== null) {
        marcadores.push(mr.index);
        if (mr.index === reItem.lastIndex) reItem.lastIndex++;
      }
      if (!marcadores.length) {
        const reGenerico = /([a-z])\)\s+[A-ZÀ-Ú]/g;
        let mg;
        while ((mg = reGenerico.exec(pedaco)) !== null) {
          marcadores.push(mg.index);
          if (mg.index === reGenerico.lastIndex) reGenerico.lastIndex++;
        }
      }
      if (marcadores.length) {
        const primeiro = marcadores[0];
        if (primeiro > 0 && pedaco.slice(0, primeiro).trim().length > 0) pedaco = pedaco.slice(primeiro);
      }

      if (pedaco.trim().length > 40) blocos.push(pedaco.trim());
    }
    return blocos;
  }

  /** Formato "Item DOPM": um bloco por marcador de inicio. */
  function blocosPorInicio(texto, opt) {
    const inicios = acharInicios(texto, opt);
    const blocos = [];
    for (let i = 0; i < inicios.length; i++) {
      const fim = i + 1 < inicios.length ? inicios[i + 1].indice : texto.length;
      let pedaco = texto.slice(inicios[i].indice, fim).trim();
      const corte = cortarFim(pedaco, opt);
      if (corte !== -1) pedaco = pedaco.slice(0, corte).trim();
      if (pedaco.length > 40) blocos.push(pedaco);
    }
    return blocos;
  }

  /**
   * Indica se o signatario final do documento e o mesmo do elogio, para nao
   * repetir o mesmo bloco duas vezes no texto.
   * @param {string} nomeAssinaturaFinal
   * @param {string} nomeAutoridade
   * @returns {boolean}
   */
  function mesmoSignatario(nomeAssinaturaFinal, nomeAutoridade) {
    if (!nomeAssinaturaFinal || !nomeAutoridade) return false;
    const a = normalizar(nomeAssinaturaFinal);
    const b = normalizar(nomeAutoridade);
    if (a.length < 6 || b.length < 6) return false;
    return a === b || a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
  }

  /* ====================================================================== */
  /* Etapa 4 - Texto, assinatura e autoridade                               */
  /* ====================================================================== */

  /** Marcador do proximo item ("b) Os policiais militares ..."). */
  const RE_ITEM = /[a-h]\)\s+(?:Os|OS)\s+policiais\s+militares/gi;

  function cortarNoProximoItem(texto) {
    const re = new RegExp(RE_ITEM.source, 'gi');
    const m = re.exec(texto);
    return m && m.index > 0 ? texto.slice(0, m.index) : texto;
  }

  /* ====================================================================== */
  /* Etapa 3b - Bloco de assinatura (nome + posto + cargo)                   */
  /* ====================================================================== */

  // Cargos que fecham a assinatura. O PDF do SEI gruda o cargo no posto
  // ("QOPMComandante"), por isso marcamos a fronteira antes de interpretar.
  const CARGO_ASSINATURA = [
    'SUB-COMANDANTE',
    'SUBCOMANDANTE',
    'COMANDANTE',
    'CHEFE',
    'DIRETOR',
    'ASSISTENTE',
    'PRESIDENTE',
    'SBF'
  ];

  // O cargo pode continuar na linha seguinte quando ela comeca pela unidade
  // ("COMANDANTE DA 4º CIA \n /12º BPM"), pelo proprio cargo
  // ("TENENTE-CORONEL PM \n Comandante \n do 4º BPM") ou pelo numero da
  // unidade.
  const CONTINUA_CARGO =
    '(?:\\/|(?:SUB-?COMANDANTE|SUBCOMANDANTE|COMANDANTE|CHEFE|DIRETOR|ASSISTENTE|PRESIDENTE)\\b' +
    '|\\d{0,2}\\s*[ºo°ª]?\\s*BPM\\b)';

  const FIM_CARGO =
    '(?=\\.\\s|\\s*\\.?\\s*$|\\||$|\\n(?!\\s*' + CONTINUA_CARGO + '))';

  const RE_CARGO = new RegExp(
    '\\|\\s*((?:(?:SUB-?COMANDANTE|SUBCOMANDANTE|COMANDANTE|CHEFE|DIRETOR|ASSISTENTE|PRESIDENTE)\\b' +
      '(?:[^|\\n]|\\n\\s*' + CONTINUA_CARGO + '[^|\\n]{0,80}){0,160}?)' + FIM_CARGO + ')',
    'i'
  );

  const RE_SBF = /\|\s*(SBF\.?)/i;

  function marcarCargos(texto) {
    let saida = ' ' + String(texto || '');
    CARGO_ASSINATURA.forEach(function (palavra) {
      saida = saida.replace(new RegExp('(' + palavra + ')\\b', 'gi'), ' |$1');
    });
    return saida;
  }

  /** Regex "NOME - POSTO", tolerante a caixa e a nomes hifenizados. */
  function reNomePosto(opt) {
    return new RegExp(
      '([A-Za-z\\u00c0-\\u00ff][A-Za-z\\u00c0-\\u00ff\\u2019.]*' +
        '(?:\\s+[A-Za-z\\u00c0-\\u00ff][A-Za-z\\u00c0-\\u00ff\\u2019.]*){1,6})' +
        '\\s*[-–—]\\s*(' + opt.rePosto.source + ')',
      'gi'
    );
  }

  /**
   * Monta "NOME - POSTO. CARGO. SBF." a partir de um casamento "NOME - POSTO".
   * @param {{nome: string, posto: string, fim: number}} achado
   * @param {string} marcado Texto com os cargos marcados por "|".
   * @returns {{nome: string, bloco: string}}
   */
  const POSTOS_COM_HIFEN = {
    TENENTECORONEL: 'TENENTE-CORONEL',
    PRIMEIROSARGENTO: 'PRIMEIRO-SARGENTO',
    SEGUNDOSARGENTO: 'SEGUNDO-SARGENTO',
    TERCEIROSARGENTO: 'TERCEIRO-SARGENTO',
    PRIMEIROTENENTE: 'PRIMEIRO-TENENTE',
    SEGUNDOTENENTE: 'SEGUNDO-TENENTE',
    TERCEIROTENENTE: 'TERCEIRO-TENENTE'
  };

  /** Reaplica hifenes losts ao juntar a hifenizacao do PDF ("TENENTECORONEL"). */
  function corrigirPosto(texto) {
    return String(texto || '')
      .replace(/([A-ZÀ-Þ])-\s+([A-ZÀ-Þ])/g, '$1-$2')
      .replace(
        /\b(?:TENENTECORONEL|PRIMEIROSARGENTO|SEGUNDOSARGENTO|TERCEIROSARGENTO|PRIMEIROTENENTE|SEGUNDOTENENTE|TERCEIROTENENTE)\b/gi,
        function (t) {
          return POSTOS_COM_HIFEN[t.toUpperCase()] || t;
        }
      );
  }

  function blocoDeAssinatura(achado, marcado) {
    // A captura pode comecar num token de outra linha ("BPM. IGOR ...").
    const nomeBruto = colapsarEspacos(achado.nome).replace(/^(?:\S+[\.,;]\s+)+/, '').trim();
    const nome = nomeBruto.replace(/[-–—,;:]+$/, '').trim();
    let posto = colapsarEspacos(achado.posto).replace(/^[-–—\s]+/, '').trim();

    // Complemento do posto: "PM", "QPPM", "CB", "SD" (sempre na mesma linha).
    let p = achado.fim;
    const resto = marcado.slice(p);
    const complemento = resto.match(
      /^[^\S\n]*[.,;:]?[^\S\n]*([A-Z0-9º°ª./]{1,20}(?:[^\S\n]+[A-Z0-9º°ª./]{1,12})?)/
    );
    if (complemento) {
      posto += ' ' + complemento[1];
      p += complemento[0].length;
    }
    posto = posto.replace(/[\s.,;:]+$/, '');

    let bloco = corrigirPosto(nome + ' - ' + posto);
    const sbf = marcado.slice(p).match(RE_SBF);
    if (sbf) {
      bloco += '. ' + sbf[1].replace(/\.$/, '');
      p += sbf[0].length;
    }

    const cargo = marcado.slice(p).match(RE_CARGO);
    if (cargo) {
      const texto = colapsarEspacos(cargo[1].replace(/\|/g, '')).replace(/[\s.,;:–-]+$/, '');
      if (texto) bloco += '. ' + texto;
    }

    return { nome: nome, bloco: bloco.trim() };
  }

  /**
   * Bloco de assinatura da autoridade logo apos a assinatura do elogio
   * ("JUAREZ ALVES MATOS FILHO - CAPITÃO QPPM. Comandante da 4º CIA /12º BPM").
   * @param {string} cauda
   * @param {Object} opt
   * @returns {{nome: string, bloco: string}}
   */
  function extrairBlocoAutoridade(cauda, opt) {
    const marcado = marcarCargos(cauda);
    const re = reNomePosto(opt);
    const m = re.exec(marcado);
    if (!m) {
      const nome = extrairAutoridade(cauda);
      return { nome: nome, bloco: nome, exato: false };
    }
    const bloco = blocoDeAssinatura({ nome: m[1], posto: m[2], fim: m.index + m[0].length }, marcado);
    return { nome: bloco.nome, bloco: bloco.bloco, exato: true };
  }

  /**
   * Assinatura final do documento: o ultimo bloco "NOME - POSTO. CARGO. SBF."
   * do documento (o signatario que publica o DOPM).
   * @param {string} texto
   * @param {Object} opt
   * @returns {string}
   */
  function extrairAssinaturaFinal(texto, opt) {
    const marcado = marcarCargos(texto);
    const re = reNomePosto(opt);
    let ultimo = null;
    let m;
    while ((m = re.exec(marcado)) !== null) {
      ultimo = { nome: m[1], posto: m[2], fim: m.index + m[0].length };
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (!ultimo) return '';
    return blocoDeAssinatura(ultimo, marcado).bloco;
  }

  function montarElogio(bloco, opt) {
    const bruto = String(bloco || '');
    const re = new RegExp(opt.reAssinatura.source, 'gi');

    // Varias "assinaturas" podem existir no bloco (ex.: o despacho que fecha o
    // documento). Preferimos a ultima que seja seguida de um nome de autoridade.
    const candidatas = [];
    let m;
    while ((m = re.exec(bruto)) !== null) {
      candidatas.push({ indice: m.index, texto: m[0] });
      if (m.index === re.lastIndex) re.lastIndex++;
    }

    let ultima = null;
    for (let i = candidatas.length - 1; i >= 0; i--) {
      const c = candidatas[i];
      let pos = c.indice + c.texto.length;
      if (bruto[pos] === '.') pos += 1;
      let caudaTeste = bruto.slice(pos);
      const corteT = cortarFim(caudaTeste, opt);
      if (corteT !== -1) caudaTeste = caudaTeste.slice(0, corteT);
      caudaTeste = cortarNoProximoItem(caudaTeste);
      const brancoT = caudaTeste.search(/\n[ \t]*\n/);
      if (brancoT !== -1) caudaTeste = caudaTeste.slice(0, brancoT);
      const nome = extrairAutoridade(caudaTeste);
      if (nome && nome.split(/\s+/).length >= 2) {
        ultima = c;
        break;
      }
    }
    if (!ultima && candidatas.length) ultima = candidatas[candidatas.length - 1];

    let texto = bruto;
    let textoBase = bruto;
    let assinatura = '';
    let cauda = '';

    if (ultima) {
      let pos = ultima.indice + ultima.texto.length;
      if (bruto[pos] === '.') pos += 1;
      cauda = bruto.slice(pos);
      const corte = cortarFim(cauda, opt);
      if (corte !== -1) cauda = cauda.slice(0, corte);
      cauda = cortarNoProximoItem(cauda);
      // Depois da assinatura da autoridade nao vem mais nada do elogio: o que
      // vem e o timbre do SEI, separado por linha em branco.
      const branco = cauda.search(/\n[ \t]*\n/);
      if (branco !== -1) cauda = cauda.slice(0, branco);
      assinatura = bruto.slice(ultima.indice, pos);
      // O texto de cadastro inclui local/data E a assinatura da autoridade.
      texto = bruto.slice(0, pos) + cauda;
      textoBase = bruto.slice(0, ultima.indice);
    } else {
      const corte = cortarFim(bruto, opt);
      if (corte !== -1) texto = bruto.slice(0, corte);
    }

    const autoridadeBloco = extrairBlocoAutoridade(cauda, opt);
    const maius = (s) => (opt.forcarMaiusculas ? s.toLocaleUpperCase('pt-BR') : s);

    // Quando o PDF cola posto e cargo ("MAJOR PMCOMANDANTE DO 44º BPM"), o
    // texto de cadastro usa o bloco interpretado para ficar sempre igual.
    if (ultima && autoridadeBloco.exato) {
      texto = bruto.slice(0, ultima.indice + ultima.texto.length) +
        (bruto[ultima.indice + ultima.texto.length] === '.' ? '.' : '') +
        ' ' + autoridadeBloco.bloco;
    }

    return {
      texto: maius(texto),
      textoBase: maius(textoBase),
      assinatura: colapsarEspacos(assinatura),
      autoridade: maius(autoridadeBloco.nome),
      autoridadeBloco: maius(autoridadeBloco.bloco)
    };
  }

  /**
   * Nome da autoridade a partir do trecho posterior a assinatura
   * ("JUAREZ ALVES MATOS FILHO - CAPITÃO QOPM. COMANDANTE DA 4º CIA /12º BPM.").
   */
  function extrairAutoridade(cauda) {
    const t = colapsarEspacos(cauda).replace(/^[\s.:;,–—-]+/, '');
    if (!t) return '';

    let nome = t;
    const corte = t.match(/^(.+?)(?=\s[-–—]\s|\s-\s|\.\s|\.$)/);
    if (corte) nome = corte[1];

    nome = nome
      .replace(/[-–—]?\s*\b(TENENTE|CAPIT[AÃ]O|MAJOR|CORONEL|SARGENTO|CABO|SOLDADO)\b.*$/i, '')
      .trim();

    if (nome.split(/\s+/).length < 2) {
      const partes = t.split(/\s{2,}|\s[-–—]\s|\s-\s/);
      nome = (partes[0] || t).trim();
    }
    return nome.slice(0, 120).trim();
  }

  /* ====================================================================== */
  /* Etapa 5 - Resolucao dos RGs                                            */
  /* ====================================================================== */

  /**
   * Casa o texto do elogio com a tabela restrita.
   * Prioridade: 1) nome citado no texto; 2) bloco posicional; 3) tudo.
   */
  function resolverRGs(textoElogio, tabela, indice, totalElogios) {
    const registros = tabela.registros || [];
    const blocos = tabela.blocos || [];
    if (!registros.length) return { rgs: [], origem: 'nenhum' };

    const alvo = normalizar(textoElogio);
    const casados = [];
    registros.forEach((reg) => {
      if (!reg.nomeNorm || reg.nomeNorm.length < 6) return;
      const pos = alvo.indexOf(reg.nomeNorm);
      if (pos !== -1) casados.push({ reg: reg, pos: pos });
    });

    if (casados.length) {
      casados.sort((a, b) => a.pos - b.pos);
      const rgs = [];
      casados.forEach((c) => {
        if (rgs.indexOf(c.reg.rg) === -1) rgs.push(c.reg.rg);
      });
      if (rgs.length) return { rgs: rgs, origem: 'nome' };
    }

    if (blocos.length === totalElogios && blocos[indice] && blocos[indice].length) {
      return { rgs: blocos[indice].map((r) => r.rg), origem: 'bloco' };
    }
    if (blocos.length === 1) {
      return { rgs: blocos[0].map((r) => r.rg), origem: 'tabela' };
    }
    return { rgs: registros.map((r) => r.rg), origem: 'tabela' };
  }

  /* ====================================================================== */
  /* API principal                                                          */
  /* ====================================================================== */

  function rotuloDoElogio(bloco, indice, formato) {
    if (formato === 'item-para-dopm') {
      const letra = String(bloco).match(/^\s*([a-z])\)\s/i) || String(bloco).match(/([a-z])\)\s+[A-ZÀ-Ú]/);
      if (letra) return 'Item ' + letra[1].toUpperCase() + ')';
    }
    const rai = String(bloco).match(/RAI\s+N?[ºo°]?\s*(\d{5,})/i);
    if (rai) return 'Elogio #' + (indice + 1) + ' · RAI ' + rai[1];
    return 'Elogio #' + (indice + 1);
  }

  /**
   * @param {{texto: string, tabelas?: string[][][], url?: string, titulo?: string}} entrada
   * @param {Object} config Configuracao do modulo (opcional).
   * @returns {Object} Documento estruturado.
   */
  function analisar(entrada, config) {
    const opt = opcoesPadrao(config);
    const entradaSegura = entrada || {};
    const bruto = String(entradaSegura.texto || '').replace(/\u00a0/g, ' ');

    const meta = extrairMetadados(bruto);
    const limpo = juntarHifenizados(removerRuido(bruto, opt));

    // Sempre varremos o texto: alem de recuperar a tabela quando o DOM nao
    // traz as tabelas, removemos as linhas de acesso restrito do corpo do texto.
    const porTexto = tabelaDoTexto(limpo, opt);
    let tabela = tabelaDoDOM(entradaSegura.tabelas, opt);
    if (!tabela.registros.length) {
      tabela = { registros: porTexto.registros, blocos: porTexto.blocos };
    }
    const corpo = porTexto.textoSemTabela || limpo;

    const formato = detectarFormato(corpo, opt);

    let blocos = formato === 'item-para-dopm' ? blocosItemParaDopm(corpo, opt) : [];
    if (!blocos.length) blocos = blocosPorInicio(corpo, opt);
    if (!blocos.length) {
      const corte = cortarFim(corpo, opt);
      const pedaco = (corte === -1 ? corpo : corpo.slice(0, corte)).trim();
      if (pedaco.length > 40) blocos = [pedaco];
    }

    // Assinatura que fecha o documento (o signatario que publica o DOPM).
    // Ela vem sempre depois do ultimo elogio, entao procuramos primeiro na cauda.
    const idxUltimoBloco = blocos.length ? limpo.lastIndexOf(blocos[blocos.length - 1]) : -1;
    const posUltimoBloco = idxUltimoBloco >= 0
      ? idxUltimoBloco + blocos[blocos.length - 1].length
      : -1;
    const caudaFinal = posUltimoBloco > 0 ? limpo.slice(posUltimoBloco) : limpo;
    const brutaFinal = extrairAssinaturaFinal(caudaFinal, opt) || extrairAssinaturaFinal(limpo, opt);
const assinaturaFinal = brutaFinal
  ? (opt.forcarMaiusculas ? brutaFinal.toLocaleUpperCase('pt-BR') : brutaFinal)
  : '';
const nomeAssinaturaFinal = brutaFinal ? extrairBlocoAutoridade(brutaFinal, opt).nome : '';

const elogios = blocos.map((bloco, indice) => {
      const partes = montarElogio(bloco, opt);
      const rgInfo = resolverRGs(bloco, tabela, indice, blocos.length);
      let texto = colapsarEspacos(partes.texto);
      if (formato === 'item-para-dopm') texto = texto.replace(/^[A-Za-z]\)\s+/, '');

      // O texto de cadastro concatena o fechamento do elogio com a assinatura
      // final do documento, exceto quando o signatario e o mesmo do elogio.
      if (assinaturaFinal && !mesmoSignatario(nomeAssinaturaFinal, partes.autoridade)) {
        const fechamento = /[.!?;:]$/.test(texto)
          ? texto
          : texto.replace(/[\s.,;:–-]+$/, '') + '.';
        texto = colapsarEspacos(fechamento + ' ' + assinaturaFinal);
      }

      return {
        id: uid() + '-' + indice,
        indice: indice,
        rotulo: rotuloDoElogio(bloco, indice, formato),
        texto: texto,
        textoBase: colapsarEspacos(partes.textoBase),
        assinatura: partes.assinatura,
        autoridade: partes.autoridade,
        autoridadeBloco: partes.autoridadeBloco,
        assinaturaFinal: assinaturaFinal,
        rgs: rgInfo.rgs,
        origemRGs: rgInfo.origem
      };
    });

    return {
      formato: formato,
      titulo: meta.titulo,
      numero: meta.numero,
      unidade: meta.unidade,
      processo: meta.processo,
      url: entradaSegura.url || '',
      documento: entradaSegura.titulo || '',
      capturadoEm: new Date().toISOString(),
      assinaturaFinal: assinaturaFinal,
      tabela: { registros: tabela.registros, blocos: tabela.blocos },
      elogios: elogios
    };
  }

  /**
   * Texto final de cadastro: texto do elogio + iniciais do usuario.
   * @param {string} texto
   * @param {string} iniciais
   * @param {string} separador
   * @returns {string}
   */
  function aplicarIniciais(texto, iniciais, separador) {
    const base = colapsarEspacos(texto || '');
    const marcas = String(iniciais || '').trim();
    if (!marcas) return base;
    if (base.toLocaleUpperCase('pt-BR').indexOf(marcas.toLocaleUpperCase('pt-BR')) !== -1) return base;
    return (base + (separador === undefined ? ' ' : separador) + marcas).trim();
  }

  return {
    analisar: analisar,
    aplicarIniciais: aplicarIniciais,
    extrairMetadados: extrairMetadados,
    parseRegistro: parseRegistro,
    extrairNome: extrairNome,
    extrairAutoridade: extrairAutoridade,
    extrairBlocoAutoridade: extrairBlocoAutoridade,
    extrairAssinaturaFinal: extrairAssinaturaFinal,
    normalizar: normalizar,
    colapsarEspacos: colapsarEspacos,
    _padroes: {
      posto: POSTO_PADRAO,
      inicio: INICIO_ELOGIO_PADRAO,
      assinatura: ASSINATURA_PADRAO,
      ruido: RUIDO_PADRAO
    }
  };
});
