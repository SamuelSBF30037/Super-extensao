/**
 * Extrator DOPM - Main Application (v2.0)
 * 
 * Este arquivo contém a funcionalidade principal da extensão, incluindo:
 * - Carregamento e navegação de módulos
 * - Gestão do splash screen e componentes de UI
 * - Carregamento de configurações
 * - Gerenciamento de temas
 */

// Variáveis globais
let darkMode = false;
let CONFIG = null;
let configLoaded = false;
let currentModule = null;

// URL da configuração externa
const CONFIG_URL = 'https://stive.com.br/BAPM2/adm/config.json';

// Configuração padrão como fallback
const DEFAULT_CONFIG = {
  version: "1.0",
  lastUpdate: "2025-04-12",
  patterns: {
    itemPatterns: ["ITEM DOEPM", "ITEM DOPM", "ITEM DO DOPM", "ITEM PARA DOPM"],
    authorityTitles: ["Comandante", "Chefe", "Diretor", "Assistente", "SUBCOMANDANTE", "COMANDANTE", "CHEFE", "DIRETOR", "ASSISTENTE", "RESP"],
    textStartPatterns: ["Por terem", "Por ter", "Que sempre", "PELA CONTRIBUIÇÃO", "Pelo ter"],
    textEndPatterns: ["Documento Assinado", "RNMM"],
    rgPatterns: ["(\\b\\d{2}[.,]\\d{3}\\b)", "(\\b\\d{5}\\b)"],
    customInitials: "\nRNMM."
  },
  fieldSelectors: {
    textField: "#textoElogio",
    authorityField: "#autoridade",
    rgField: "input[name='rg']",
    addButtonSelector: "input[value='Adicionar']"
  },
  timings: {
    rgProcessingDelay: 2000,
    fieldFocusDelay: 500,
    buttonClickDelay: 300
  }
};

// Configuração de módulos
const MODULES = {
  'register-compliments': {
    name: 'Cadastrar Elogios',
    icon: 'fas fa-award',
    path: 'modules/register-compliments/index.html',
    active: true,
    hostPermissions: ['sei.go.gov.br', 'sisp.ssp.go.gov.br']
  },
  'filter-rg': {
    name: 'Filtrar RGs',
    icon: 'fas fa-filter',
    path: 'modules/filter-rg/index.html',
    active: false,
    hostPermissions: ['sisp.ssp.go.gov.br']
  },
  'register-courses': {
    name: 'Cadastrar Cursos',
    icon: 'fas fa-graduation-cap',
    path: 'modules/register-courses/index.html',
    active: false,
    hostPermissions: ['sei.go.gov.br', 'sisp.ssp.go.gov.br']
  },
  'register-certificates': {
    name: 'Cadastrar Certificados',
    icon: 'fas fa-certificate',
    path: 'modules/register-certificates/index.html',
    active: false,
    hostPermissions: ['sei.go.gov.br', 'sisp.ssp.go.gov.br']
  },
  'remove-spacing': {
    name: 'Remover Espaços',
    icon: 'fas fa-broom',
    path: 'modules/remove-spacing/index.html',
    active: false,
    hostPermissions: ['sei.go.gov.br']
  },
  'extension-settings': {
    name: 'Configurações',
    icon: 'fas fa-cog',
    path: 'modules/extension-settings/index.html',
    active: false,
    hostPermissions: ['*']
  }
};

/**
 * Inicializa a aplicação
 */
async function initApp() {
  try {
    console.log("Iniciando aplicação...");
    
    // Garantir que o splash screen seja exibido no início
    toggleSplash(true, "Iniciando Extrator DOPM...", 5000);
    
    // Carregar configuração com um pequeno delay para garantir que o splash seja exibido
    setTimeout(async () => {
      try {
        // Carregar configuração
        await loadExternalConfig();
        
        // Carregar preferências do usuário
        loadPreferences();
        
        // Configurar event listeners
        setupEventListeners();
        
        // Verificar compatibilidade da aba/site ativo
        checkActiveTab();
        
        // Atualizar grid de módulos baseado nos módulos ativos
        updateModuleGrid();
        
        // Verificar se há um último módulo usado para carregar
        const lastModule = localStorage.getItem('lastModule');
        if (lastModule && MODULES[lastModule]?.active) {
          // Pequeno delay para garantir que a UI está pronta
          setTimeout(() => {
            loadModule(lastModule);
          }, 500);
        } else {
          // Se não houver módulo a carregar, esconder o splash explicitamente após a inicialização
          setTimeout(() => {
            toggleSplash(false);
          }, 1000);
        }
      } catch (error) {
        console.error("Erro durante a inicialização:", error);
        showNotification("Erro ao inicializar a aplicação", "error");
        toggleSplash(false); // Esconder splash em caso de erro
      }
    }, 500);
  } catch (error) {
    console.error("Erro crítico na inicialização da aplicação:", error);
    showNotification("Erro crítico ao inicializar a aplicação", "error");
    
    // Tentar esconder o splash mesmo em caso de erro crítico
    try {
      toggleSplash(false);
    } catch (e) {
      console.error("Não foi possível esconder o splash screen:", e);
    }
  }
}

/**
 * Configura event listeners para os elementos da UI
 */
function setupEventListeners() {
  // Botões do menu
  document.getElementById('home-button')?.addEventListener('click', navigateToHome);
  document.getElementById('darkModeToggle')?.addEventListener('click', toggleDarkMode);
  
  // Cartões de módulos
  const moduleCards = document.querySelectorAll('.module-card');
  moduleCards.forEach(card => {
    const moduleId = card.dataset.module;
    if (moduleId) {
      card.addEventListener('click', () => {
        if (MODULES[moduleId]?.active) {
          loadModule(moduleId);
        } else {
          showNotification(`O módulo "${MODULES[moduleId]?.name}" ainda não está disponível`, "info");
        }
      });
    }
  });
  
  // Configurar eventos específicos de navegação
  setupNavigationEvents();
}

/**
 * Configura eventos específicos para navegação
 */
function setupNavigationEvents() {
  // Configurar evento para o botão de voltar no módulo
  const moduleBackButton = document.getElementById('moduleBackButton');
  if (moduleBackButton) {
    moduleBackButton.addEventListener('click', navigateToHome);
  } else {
    console.warn("Botão de voltar não encontrado");
  }
}

/**
 * Carrega configuração externa ou usa o fallback local
 */
async function loadExternalConfig() {
  try {
    toggleSplash(true, "Carregando configurações...", 10000);
    
    try {
      const response = await fetch(CONFIG_URL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`Falha ao carregar configurações: ${response.status}`);
      }
      
      const config = await response.json();
      
      // Validar configuração
      if (validateConfig(config)) {
        CONFIG = config;
        configLoaded = true;
        
        console.log("Configurações carregadas com sucesso do servidor:", CONFIG);
        showNotification("Configurações carregadas do servidor", "success");
        
        toggleSplash(false);
        enableInterface();
        
        return true;
      } else {
        throw new Error("Configuração externa inválida");
      }
    } catch (error) {
      console.warn("Não foi possível carregar do servidor, usando configuração local:", error);
      
      CONFIG = DEFAULT_CONFIG;
      configLoaded = true;
      
      showNotification("Usando configuração local", "info");
      
      toggleSplash(false);
      enableInterface();
      
      return true;
    }
  } catch (error) {
    console.error("Erro crítico ao carregar configurações:", error);
    
    try {
      CONFIG = DEFAULT_CONFIG;
      configLoaded = true;
      
      showNotification("Usando configuração de emergência", "error");
      
      toggleSplash(false);
      enableInterface();
      
      return true;
    } catch (e) {
      console.error("Erro crítico ao usar configuração de emergência:", e);
      showNotification("Erro crítico de configuração", "error");
      
      toggleSplash(true, "Erro crítico ao iniciar. Tente reinstalar a extensão.", 0);
      
      disableInterface();
      
      return false;
    }
  }
}

/**
 * Valida o objeto de configuração
 */
function validateConfig(config) {
  try {
    if (!config || typeof config !== 'object') return false;
    
    const requiredSections = ['patterns', 'fieldSelectors', 'timings'];
    for (const section of requiredSections) {
      if (!config[section] || typeof config[section] !== 'object') {
        console.error(`Seção obrigatória ausente: ${section}`);
        return false;
      }
    }
    
    const requiredPatterns = [
      'itemPatterns', 'authorityTitles', 'textStartPatterns', 
      'textEndPatterns', 'rgPatterns', 'customInitials'
    ];
    
    for (const pattern of requiredPatterns) {
      if (pattern === 'customInitials') {
        if (typeof config.patterns[pattern] !== 'string') {
          console.error(`Campo obrigatório inválido: patterns.${pattern} (deveria ser string)`);
          return false;
        }
      } else {
        if (!Array.isArray(config.patterns[pattern]) || config.patterns[pattern].length === 0) {
          console.error(`Campo obrigatório inválido: patterns.${pattern} (deveria ser array não-vazio)`);
          return false;
        }
      }
    }
    
    const requiredSelectors = ['textField', 'authorityField', 'rgField', 'addButtonSelector'];
    for (const selector of requiredSelectors) {
      if (typeof config.fieldSelectors[selector] !== 'string' || !config.fieldSelectors[selector]) {
        console.error(`Campo obrigatório inválido: fieldSelectors.${selector}`);
        return false;
      }
    }
    
    const requiredTimings = ['rgProcessingDelay', 'fieldFocusDelay', 'buttonClickDelay'];
    for (const timing of requiredTimings) {
      if (typeof config.timings[timing] !== 'number' || config.timings[timing] < 0) {
        console.error(`Campo obrigatório inválido: timings.${timing}`);
        return false;
      }
    }
    
    return true;
  } catch (e) {
    console.error("Erro ao validar configuração:", e);
    return false;
  }
}

/**
 * Verifica a aba ativa e atualiza a UI de acordo
 */
function checkActiveTab() {
  if (!configLoaded) {
    showNotification("Aguarde o carregamento das configurações", "error");
    return;
  }
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    const url = activeTab.url || '';
    
    // Verificar se estamos em um site compatível
    const isCompatibleSite = (
      url.startsWith('https://sei.go.gov.br') ||
      url.startsWith('https://sisp.ssp.go.gov.br')
    );
    
    const mainContent = document.getElementById('main-content');
    const warningSection = document.getElementById('warning-section');

    if (!mainContent || !warningSection) {
      console.error("Elementos essenciais da interface não encontrados");
      return;
    }

    toggleSplash(true, "Verificando compatibilidade do site...", 1500);

    // Inicialmente esconde tudo
    mainContent.style.display = 'none';
    warningSection.style.display = 'none';

    setTimeout(() => {
      if (isCompatibleSite) {
        mainContent.style.display = 'block';
        
        // Habilita apenas os módulos compatíveis para este site
        updateModulesAvailability(url);
        
      } else {
        warningSection.style.display = 'block';
      }
    }, 1600);
  });
}

/**
 * Habilita/desabilita módulos baseado no site atual
 */
function updateModulesAvailability(url) {
  const hostname = new URL(url).hostname;
  
  // Atualiza o estado ativo de cada módulo baseado na compatibilidade
  for (const [moduleId, module] of Object.entries(MODULES)) {
    const isCompatible = module.hostPermissions.some(host => hostname.includes(host));
    
    // Apenas register-compliments é totalmente implementado
    if (moduleId === 'register-compliments') {
      module.active = isCompatible;
    } else {
      module.active = false; // Outros módulos ainda não estão implementados
    }
  }
  
  // Atualiza a grid de módulos
  updateModuleGrid();
}

/**
 * Atualiza a grid de módulos para refletir o estado atual
 */
function updateModuleGrid() {
  const moduleCards = document.querySelectorAll('.module-card');
  
  moduleCards.forEach(card => {
    const moduleId = card.dataset.module;
    if (!moduleId) return;
    
    const module = MODULES[moduleId];
    if (!module) return;
    
    const statusElement = card.querySelector('.module-status');
    const statusBadge = card.querySelector('.status-badge');
    
    if (module.active) {
      statusElement.classList.add('active');
      statusBadge.textContent = 'Ativo';
      card.style.opacity = '1';
    } else {
      statusElement.classList.remove('active');
      statusBadge.textContent = 'Em breve';
      card.style.opacity = '0.7';
    }
  });
}

/**
 * Carrega um módulo específico
 */
function loadModule(moduleId) {
  // Verificar se o módulo existe e está ativo
  if (!MODULES[moduleId]) {
    showNotification(`Módulo não encontrado`, "error");
    return;
  }
  
  // Se o módulo não estiver ativo, mostrar notificação
  if (!MODULES[moduleId].active) {
    showNotification(`O módulo "${MODULES[moduleId]?.name}" ainda não está disponível`, "info");
    return;
  }
  
  // Salvar o módulo atual nas variáveis globais e localStorage
  currentModule = moduleId;
  localStorage.setItem('lastModule', moduleId);
  
  // Obter os elementos do DOM
  const homePage = document.getElementById('home-page');
  const moduleContainer = document.getElementById('module-container');
  const moduleTitle = document.getElementById('moduleTitle');
  const moduleContent = document.getElementById('module-content');
  
  // Verificar se todos os elementos estão presentes
  if (!homePage || !moduleContainer || !moduleTitle || !moduleContent) {
    console.error("Elementos do DOM não encontrados");
    showNotification("Erro ao carregar o módulo", "error");
    return;
  }
  
  // Mostrar o splash de carregamento
  toggleSplash(true, `Carregando módulo: ${MODULES[moduleId].name}...`, 1500);
  
  // Esconder a página inicial e mostrar o container do módulo
  homePage.style.display = 'none';
  moduleContainer.style.display = 'block';
  
  // Definir o título e ícone do módulo na barra de navegação
  moduleTitle.innerHTML = `<i class="${MODULES[moduleId].icon}"></i> ${MODULES[moduleId].name}`;
  
  // Limpar o conteúdo anterior e criar um novo iframe
  moduleContent.innerHTML = '';
  
  // Criar o iframe
  const iframe = document.createElement('iframe');
  iframe.src = MODULES[moduleId].path;
  iframe.style.width = '100%';
  iframe.style.height = '600px';
  iframe.style.border = 'none';
  
  // Adicionar o iframe ao container
  moduleContent.appendChild(iframe);
  
  // Adicionar evento para aplicar o modo escuro ao iframe quando carregado
  iframe.onload = function() {
    try {
      // Aplicar modo escuro se necessário
      if (darkMode && iframe.contentDocument && iframe.contentDocument.body) {
        iframe.contentDocument.body.classList.add('dark-mode');
      }
      
      // Esconder o splash quando o iframe estiver completamente carregado
      setTimeout(() => {
        toggleSplash(false);
      }, 200);
    } catch (e) {
      console.warn("Erro ao interagir com o iframe:", e);
      // Garantir que o splash seja escondido mesmo em caso de erro
      toggleSplash(false);
    }
  };
}

/**
 * Navega de volta para a página inicial
 */
function navigateToHome() {
  // Obter os elementos do DOM
  const homePage = document.getElementById('home-page');
  const moduleContainer = document.getElementById('module-container');
  
  // Verificar se os elementos estão presentes
  if (!homePage || !moduleContainer) {
    console.error("Elementos do DOM não encontrados");
    return;
  }
  
  // Mostrar o splash durante a navegação
  toggleSplash(true, "Carregando página inicial...", 1000);
  
  // Navegar para a página inicial com um pequeno delay para a animação
  setTimeout(() => {
    // Mostrar a página inicial, esconder o container do módulo
    homePage.style.display = 'block';
    moduleContainer.style.display = 'none';
    moduleContainer.querySelector('#module-content').innerHTML = ''; // Limpar conteúdo
    
    // Atualizar a grid de módulos
    updateModuleGrid();
    
    // Verificar a compatibilidade do site atual
    checkActiveTab();
  }, 300);
}

/**
 * Exibe mensagem de notificação
 */
function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  if (!notification) return;
  
  const notificationMessage = document.getElementById('notification-message');
  if (!notificationMessage) return;
  
  const iconElement = notification.querySelector('i');
  if (iconElement) {
    iconElement.className = type === 'success' ? 'fas fa-check-circle' : 
                         type === 'error' ? 'fas fa-exclamation-circle' : 
                         'fas fa-info-circle';
  }
  
  notification.className = `notification ${type}`;
  notificationMessage.textContent = message;
  
  notification.classList.add('show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

/**
 * Controla o Splash Screen
 */
function toggleSplash(show, message = null, duration = 2000) {
  const splash = document.getElementById('splash-screen');
  if (!splash) {
    console.error("Elemento splash-screen não encontrado");
    return;
  }
  
  const subtitle = splash.querySelector('.splash-subtitle');
  if (!subtitle) {
    console.error("Elemento splash-subtitle não encontrado");
    return;
  }
  
  // Atualizar mensagem se fornecida
  if (message) {
    subtitle.textContent = message;
  }
  
  if (show) {
    // Reiniciar animação da barra de carregamento
    const loadingBar = splash.querySelector('.splash-loading-bar');
    if (loadingBar) {
      loadingBar.style.animation = 'none';
      loadingBar.offsetHeight; // Forçar um reflow
      loadingBar.style.animation = 'loading 1.5s ease-in-out forwards';
    }
    
    // Mostrar o splash
    splash.classList.add('active');
    
    // Esconder o splash após a duração especificada (se não for 0)
    if (duration > 0) {
      setTimeout(() => {
        splash.classList.remove('active');
      }, duration);
    }
  } else {
    // Esconder o splash imediatamente
    splash.classList.remove('active');
  }
}

/**
 * Alterna o modo escuro
 */
function toggleDarkMode() {
  if (!configLoaded) {
    showNotification("Aguarde o carregamento das configurações", "error");
    return;
  }
  
  toggleSplash(true, `Ativando modo ${!darkMode ? 'escuro' : 'claro'}...`, 1500);
  
  setTimeout(() => {
    darkMode = !darkMode;
    document.body.classList.toggle('dark-mode');
    
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.innerHTML = darkMode ? 
        '<i class="fas fa-sun"></i> Modo claro' : 
        '<i class="fas fa-moon"></i> Modo escuro';
    }
    
    localStorage.setItem('darkMode', darkMode.toString());
    
    // Se há um iframe carregado, aplicar modo escuro também
    const iframe = document.querySelector('#module-container iframe');
    if (iframe && iframe.contentWindow) {
      try {
        if (darkMode) {
          iframe.contentDocument.body.classList.add('dark-mode');
        } else {
          iframe.contentDocument.body.classList.remove('dark-mode');
        }
      } catch (e) {
        console.warn("Não foi possível aplicar modo escuro ao iframe:", e);
      }
    }
    
    showNotification(`Modo ${darkMode ? 'escuro' : 'claro'} ativado`, 'info');
  }, 1000);
}

/**
 * Carrega preferências do usuário do storage
 */
function loadPreferences() {
  darkMode = localStorage.getItem('darkMode') === 'true';
  
  if (darkMode) {
    document.body.classList.add('dark-mode');
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.innerHTML = '<i class="fas fa-sun"></i> Modo claro';
    }
  }
}

/**
 * Habilita elementos da interface
 */
function enableInterface() {
  const buttons = document.querySelectorAll('button:not(#retry-button)');
  if (buttons) {
    buttons.forEach(button => {
      if (button) {
        button.disabled = false;
        button.classList.remove('disabled');
      }
    });
  }
  
  const warning = document.getElementById('config-warning');
  if (warning) {
    warning.remove();
  }
  
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.classList.remove('disabled-content');
  }
}

/**
 * Desabilita elementos da interface
 */
function disableInterface() {
  const buttons = document.querySelectorAll('button:not(#retry-button)');
  if (buttons) {
    buttons.forEach(button => {
      if (button) {
        button.disabled = true;
        button.classList.add('disabled');
      }
    });
  }
  
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.classList.add('disabled-content');
    
    if (!document.getElementById('config-warning')) {
      const warning = document.createElement('div');
      warning.id = 'config-warning';
      warning.className = 'config-warning';
      warning.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Configurações não carregadas. Não é possível utilizar a extensão.';
      mainContent.prepend(warning);
    }
  }
}

// Inicializa a aplicação quando o DOM é carregado
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM carregado, chamando initApp()");
  initApp();
});