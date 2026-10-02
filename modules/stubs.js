/**
 * Super DOPM - Modulos em construcao (v3.0)
 *
 * Registra as funcionalidades que ainda nao foram migradas para o painel
 * lateral como abas de aviso, preservando o mesmo lugar que elas ocupavam no
 * popup legado. Basta substituir o stub pela view real quando o modulo for
 * implementado.
 */

(function (global) {
  'use strict';

  const DOPM = global.DOPM;

  const EM_CONSTRUCAO = [
    {
      id: 'filter-rg',
      titulo: 'Filtrar RGs',
      descricao: 'Organizar e validar listas de RGs antes do cadastro.'
    },
    {
      id: 'register-courses',
      titulo: 'Cursos',
      descricao: 'Cadastrar cursos e treinamentos dos{pm}s.'
    },
    {
      id: 'register-certificates',
      titulo: 'Certificados',
      descricao: 'Cadastrar certificados e diplomatas.'
    },
    {
      id: 'remove-spacing',
      titulo: 'Limpar Texto',
      descricao: 'Remover espacos e quebras excedentes do texto do elogio.'
    },
    {
      id: 'extension-settings',
      titulo: 'Configuracoes',
      descricao: 'Ajustes da extensao: iniciais, tema e origem da configuracao.'
    }
  ];

  function view(root, modulo) {
    root.innerHTML = [
      '<section class="sp-bloco">',
      '  <header>' + modulo.titulo + '</header>',
      '  <div class="sp-corpo sp-stub">',
      '    <img src="images/alert.png" alt="" class="sp-stub-logo" />',
      '    <h3>Funcionalidade em construcao</h3>',
      '    <p>' + modulo.descricao + '</p>',
      '    <p class="sp-dica">Previsto para as proximas atualizacoes da extensao.</p>',
      '  </div>',
      '</section>'
    ].join('\n');
  }

  EM_CONSTRUCAO.forEach(function (modulo) {
    DOPM.app.registrarModulo({
      id: modulo.id,
      titulo: modulo.titulo,
      emConstrucao: true,
      iniciar: function (contexto) {
        view(contexto.root, modulo);
      }
    });
  });
})(window);
