// Variáveis globais para armazenar os dados
let capturedText = '';
let rgs = '';
let authority = '';
let darkMode = false;
let CONFIG = null; // Inicializamos sem configuração
let configLoaded = false;
// Flag para controlar se estamos atualizando programaticamente (não deve acionar saveData)
let isAutomaticUpdate = false;

// URL da configuração externa (usando HTTPS)
const CONFIG_URL = 'https://stive.com.br/BAPM2/config.json';
 


/**
 * Carrega configurações externas do servidor ou usa configuração local
 * @returns {Promise} Promise que resolve quando a configuração é carregada
 */
async function loadExternalConfig() {
  try {
    toggleSplash(true, "Carregando configurações...", 10000); // Timeout mais longo para carregamento
    
    // Tenta carregar o arquivo externo
    try {
      const response = await fetch(CONFIG_URL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors' // Explicitamente pede CORS
      });
      
      if (!response.ok) {
        throw new Error(`Falha ao carregar configurações: ${response.status}`);
      }
      
      const config = await response.json();
      
      // Verifica se a configuração é válida
      if (validateConfig(config)) {
        // Define a configuração global
        CONFIG = config;
        configLoaded = true;
        
        console.log("Configurações carregadas com sucesso do servidor:", CONFIG);
        showNotification("Configurações carregadas do servidor", "success");
        
        // Esconde o splash
        toggleSplash(false);
        
        // Ativa os botões da interface
        enableInterface();
        
        return true;
      } else {
        throw new Error("Configuração externa inválida");
      }
    } catch (error) {
      console.warn("Não foi possível carregar do servidor, usando configuração local:", error);
      
      // Usa a configuração local
      CONFIG = DEFAULT_CONFIG;
      configLoaded = true;
      
      showNotification("Usando configuração local", "info");
      console.log("Usando configuração local:", CONFIG);
      
      // Esconde o splash
      toggleSplash(false);
      
      // Ativa os botões da interface
      enableInterface();
      
      return true;
    }
  } catch (error) {
    console.error("Erro crítico ao carregar configurações:", error);
    
    // Último recurso: tenta usar a configuração padrão
    try {
      CONFIG = DEFAULT_CONFIG;
      configLoaded = true;
      
      showNotification("Usando configuração de emergência", "error");
      
      // Esconde o splash
      toggleSplash(false);
      
      // Ativa os botões da interface
      enableInterface();
      
      return true;
    } catch (e) {
      // Se até isso falhar, mostra erro crítico
      console.error("Erro crítico ao usar configuração de emergência:", e);
      showNotification("Erro crítico de configuração", "error");
      
      // Atualiza o splash com mensagem de erro
      toggleSplash(true, "Erro crítico ao iniciar. Tente reinstalar a extensão.", 0);
      
      // Desativa a interface
      disableInterface();
      
      return false;
    }
  }
}

/**
 * Adiciona um botão de nova tentativa ao splash screen
 */
function addRetryButton() {
  // Remove o botão existente, se houver
  const existingButton = document.getElementById('retry-button');
  if (existingButton) {
    existingButton.remove();
  }
  
  const splash = document.getElementById('splash-screen');
  if (!splash) return; // Proteção contra null
  
  const retryButton = document.createElement('button');
  retryButton.id = 'retry-button';
  retryButton.className = 'retry-button';
  retryButton.innerHTML = '<i class="fas fa-sync-alt"></i> Tentar novamente';
  retryButton.addEventListener('click', () => {
    loadExternalConfig();
  });
  
  splash.appendChild(retryButton);
}

/**
 * Verifica se a configuração tem todas as propriedades necessárias
 * @param {Object} config - Configuração a ser validada
 * @returns {boolean} Verdadeiro se a configuração for válida
 */
function validateConfig(config) {
  try {
    // Verifica a estrutura básica
    if (!config || typeof config !== 'object') return false;
    
    // Verifica a existência de propriedades e subpropriedades obrigatórias
    const requiredSections = ['patterns', 'fieldSelectors', 'timings'];
    for (const section of requiredSections) {
      if (!config[section] || typeof config[section] !== 'object') {
        console.error(`Seção obrigatória ausente: ${section}`);
        return false;
      }
    }
    
    // Verifica campos específicos em patterns
    const requiredPatterns = [
      'itemPatterns', 'authorityTitles', 'textStartPatterns', 
      'textEndPatterns', 'rgPatterns', 'customInitials'
    ];
    
    for (const pattern of requiredPatterns) {
      // Verifica se o campo existe e se é um array (exceto customInitials que é string)
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
    
    // Verifica campos específicos em fieldSelectors
    const requiredSelectors = ['textField', 'authorityField', 'rgField', 'addButtonSelector'];
    for (const selector of requiredSelectors) {
      if (typeof config.fieldSelectors[selector] !== 'string' || !config.fieldSelectors[selector]) {
        console.error(`Campo obrigatório inválido: fieldSelectors.${selector}`);
        return false;
      }
    }
    
    // Verifica campos específicos em timings
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
 * Desativa os botões da interface até que as configurações sejam carregadas
 */
function disableInterface() {
  // Primeiro verifica se os elementos existem
  const buttons = document.querySelectorAll('button:not(#retry-button)');
  if (buttons) {
    buttons.forEach(button => {
      if (button) {
        button.disabled = true;
        button.classList.add('disabled');
      }
    });
  }
  
  // Adiciona mensagem de aviso
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.classList.add('disabled-content');
    
    // Adiciona uma mensagem se não existir
    if (!document.getElementById('config-warning')) {
      const warning = document.createElement('div');
      warning.id = 'config-warning';
      warning.className = 'config-warning';
      warning.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Configurações não carregadas. Não é possível utilizar a extensão.';
      mainContent.prepend(warning);
    }
  }
}

/**
 * Ativa os botões da interface após o carregamento bem-sucedido das configurações
 */
function enableInterface() {
  // Primeiro verifica se os elementos existem
  const buttons = document.querySelectorAll('button');
  if (buttons) {
    buttons.forEach(button => {
      if (button) {
        button.disabled = false;
        button.classList.remove('disabled');
      }
    });
  }
  
  // Remove mensagem de aviso se existir
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
 * Controla o Splash Screen da aplicação
 * @param {boolean} show - Se verdadeiro, mostra o splash; se falso, esconde
 * @param {string} message - Mensagem personalizada para mostrar no splash (opcional)
 * @param {number} duration - Duração do splash em milissegundos (0 para não esconder)
 */
function toggleSplash(show, message = null, duration = 2000) {
  const splash = document.getElementById('splash-screen');
  if (!splash) return; // Proteção contra null
  
  const subtitle = splash.querySelector('.splash-subtitle');
  if (!subtitle) return; // Proteção contra null
  
  // Atualiza a mensagem do splash se fornecida
  if (message) {
    subtitle.textContent = message;
  }
  
  if (show) {
    // Reseta a animação da barra de carregamento
    const loadingBar = splash.querySelector('.splash-loading-bar');
    if (loadingBar) {
      loadingBar.style.animation = 'none';
      loadingBar.offsetHeight; // Força um reflow para reiniciar a animação
      loadingBar.style.animation = 'loading 1.5s ease-in-out forwards';
    }
    
    // Mostra o splash
    splash.classList.add('active');
    
    // Esconde o splash após a duração especificada (se não for 0)
    if (duration > 0) {
      setTimeout(() => {
        splash.classList.remove('active');
      }, duration);
    }
  } else {
    // Esconde o splash imediatamente
    splash.classList.remove('active');
  }
}

/**
 * Sistema de notificações para feedback visual ao usuário
 * @param {string} message - Mensagem a ser exibida
 * @param {string} type - Tipo de notificação: success, error ou info
 */
function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  if (!notification) return; // Proteção contra null
  
  const notificationMessage = document.getElementById('notification-message');
  if (!notificationMessage) return; // Proteção contra null
  
  // Atualiza o ícone baseado no tipo
  const iconElement = notification.querySelector('i');
  if (iconElement) {
    iconElement.className = type === 'success' ? 'fas fa-check-circle' : 
                         type === 'error' ? 'fas fa-exclamation-circle' : 
                         'fas fa-info-circle';
  }
  
  // Define a classe do tipo
  notification.className = `notification ${type}`;
  
  // Atualiza a mensagem
  notificationMessage.textContent = message;
  
  // Mostra a notificação
  notification.classList.add('show');
  
  // Remove a notificação após 3 segundos
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

/**
 * Verifica a URL da aba ativa e exibe o conteúdo adequado
 * Mostra diferentes botões baseado no site atual (SEI ou SICAD)
 */
function checkActiveTab() {
  // Verifica se as configurações foram carregadas
  if (!configLoaded) {
    showNotification("Aguarde o carregamento das configurações", "error");
    return;
  }
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    const url = activeTab.url;

    const topButtons = document.getElementById('top-buttons');
    const bottomButtons = document.getElementById('bottom-buttons');
    const mainContent = document.getElementById('main-content');
    const warningSection = document.getElementById('warning-section');

    // Proteção contra null
    if (!topButtons || !bottomButtons || !mainContent || !warningSection) {
      console.error("Elementos essenciais da interface não encontrados");
      return;
    }

    // Exibe splash screen ao verificar o site
    toggleSplash(true, "Verificando compatibilidade do site...", 1500);

    // Inicialmente oculta tudo com animação
    topButtons.style.display = 'none';
    bottomButtons.style.display = 'none';
    mainContent.style.display = 'none';
    warningSection.style.display = 'none';

    // Aplica delay para animação suave
    setTimeout(() => {
      // Verifica a URL ativa e exibe o conteúdo correspondente
      if (url.startsWith('https://sei.go.gov.br')) {
        topButtons.style.display = 'flex';
        mainContent.style.display = 'block';
        showNotification('Modo SEI ativado - Você pode capturar dados', 'info');
      } else if (url.startsWith('https://sisp.ssp.go.gov.br')) {
        bottomButtons.style.display = 'flex';
        mainContent.style.display = 'block';
        showNotification('Modo SICAD ativado - Você pode preencher formulários', 'info');
      } else {
        warningSection.style.display = 'block';
      }
    }, 1600); // Delay para esperar o splash terminar
  });
}

/**
 * Captura o conteúdo da página ativa (no SEI)
 * Executa a função extractContentFromPage no contexto da página
 */
function captureContent() {
  // Verifica se as configurações foram carregadas
  if (!configLoaded) {
    showNotification("Aguarde o carregamento das configurações", "error");
    return;
  }
  
  // Inicia o splash screen durante a captura
  toggleSplash(true, "Capturando e processando texto...");
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript(
      { 
        target: { tabId: tabs[0].id }, 
        function: extractContentFromPage 
      },
      (results) => {
        if (results && results[0] && results[0].result) {
          const data = results[0].result;
          processContent(data);
          showNotification('Texto capturado com sucesso!', 'success');
        } else {
          toggleSplash(false); // Esconde o splash em caso de erro
          showNotification('Erro ao capturar o texto. Tente novamente.', 'error');
        }
      }
    );
  });
}

/**
 * Processa o conteúdo capturado extraindo informações relevantes
 * @param {string} data - Texto capturado da página
 */
function processContent(data) {
  // Verifica se as configurações foram carregadas
  if (!configLoaded || !CONFIG) {
    showNotification("Aguarde o carregamento das configurações", "error");
    return;
  }
  
  const customInitials = CONFIG.patterns.customInitials;
  let text = data;
  let lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');

  // Cria regex dinâmica para buscar itens DOPM
  const itemRegexPattern = CONFIG.patterns.itemPatterns.join('|');
  const itemRegex = new RegExp(itemRegexPattern, 'i');
  
  // Procura o índice do item DOPM para limitar a busca
  const itemIndex = lines.findIndex((line) => itemRegex.test(line));
  
  // Define o intervalo de busca
  const searchRange = itemIndex !== -1 ? lines.slice(0, itemIndex).join(' ') : text;

  // Cria regex dinâmica para RGs
  const rgRegexPattern = CONFIG.patterns.rgPatterns.join('|');
  const rgRegex = new RegExp(rgRegexPattern, 'g');
  
  // Extrai RGs usando regex e formata-os
  let rgMatches = searchRange.match(rgRegex);
  const rgList = rgMatches
    ? rgMatches.map((rg) => rg.replace(/[.,]/g, '')).filter((rg) => rg.length === 5)
    : [];

  // Cria regex para o início e fim do texto
  const textStartPattern = CONFIG.patterns.textStartPatterns.join('|');
  const textEndPattern = CONFIG.patterns.textEndPatterns.join('|');
  const textStartRegex = new RegExp(textStartPattern, 'i');
  const textEndRegex = new RegExp(textEndPattern, 'i');
  
  // Extrai o texto principal entre marcadores específicos
  const startIndex = lines.findIndex((line) => textStartRegex.test(line));
  const endIndex = lines.findIndex((line) => textEndRegex.test(line));
  const effectiveEndIndex = endIndex !== -1 ? endIndex : lines.length;

  // Monta o texto processado
  const processedText =
    startIndex !== -1 && startIndex < effectiveEndIndex
      ? lines.slice(startIndex, effectiveEndIndex).join(' ')
      : lines.slice(startIndex).join(' ');

  // Adiciona as iniciais personalizadas se necessário
  let finalText = processedText.includes(customInitials.trim())
    ? processedText
    : processedText + customInitials;
    
  // NOVO REPROCESSAMENTO: Remover tudo antes de "Por ter", "Por terem", etc.
  const markers = ["POR TEREM", " POR TEREM ","Por ter,", "Por terem,", "por ter,", "por terem,", "Por ter ", "Por terem ", "por ter ", "por terem "];
  let foundIndex = -1;
  let foundMarker = "";
  
  for (const marker of markers) {
    const index = finalText.indexOf(marker);
    if (index !== -1) {
      // Se encontrou um marcador com índice menor que o atual ou é o primeiro encontrado
      if (foundIndex === -1 || index < foundIndex) {
        foundIndex = index;
        foundMarker = marker;
      }
    }
  }
  
  // Se encontrou um marcador, remove tudo antes dele
  if (foundIndex !== -1) {
    finalText = finalText.substring(foundIndex);
    console.log(`Texto reprocessado: removido conteúdo antes de "${foundMarker}"`);
  }

  // ----- NOVA ABORDAGEM PARA BUSCAR AUTORIDADE -----
  
  // Cria regex para títulos de autoridade
  const authorityTitlesPattern = CONFIG.patterns.authorityTitles.join('|');
  const authorityRegex = new RegExp(`^(${authorityTitlesPattern})`, 'i');
  
  // Busca o nome da autoridade após o texto do elogio
  let authorityName = '';
  
  // Se temos um fim definido para o texto do elogio, buscamos a partir dali
  if (endIndex !== -1 && endIndex < lines.length) {
    // Busca sequencialmente a partir do fim do texto do elogio
    for (let i = endIndex; i < lines.length; i++) {
      if (authorityRegex.test(lines[i])) {
        // Se encontrou um título de autoridade e existe uma linha anterior com o nome
        if (i > 0) {
          authorityName = lines[i - 1].trim();
        }
        break;
      }
    }
  }
  
  // Se não encontrou autoridade após o texto, busca em todo o documento como fallback
  if (!authorityName) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (authorityRegex.test(lines[i])) {
        if (i > 0) {
          authorityName = lines[i - 1].trim();
        }
        break;
      }
    }
  }

  // Atualiza as variáveis globais
  capturedText = finalText.trim();
  rgs = rgList.join(', ');
  authority = authorityName;

  // Define a flag para evitar que a atualização dos campos seja tratada como edição manual
  isAutomaticUpdate = true;
  
  // Atualiza a interface
  updateUI();
  
  // Restaura a flag para permitir edições manuais serem detectadas novamente
  setTimeout(() => {
    isAutomaticUpdate = false;
  }, 500);
  
  // Salva os dados
  saveData(capturedText, rgs, authority);
}

/**
 * Atualiza a interface com os dados processados
 */
function updateUI() {
  const txtCapturedText = document.getElementById('capturedText');
  const txtRgs = document.getElementById('rgs');
  const txtAuthority = document.getElementById('autoridade');
  
  // Proteção contra null
  if (!txtCapturedText || !txtRgs || !txtAuthority) {
    console.error("Elementos de formulário não encontrados");
    return;
  }
  
  // Aplica uma animação sutil de fade-in
  [txtCapturedText, txtRgs, txtAuthority].forEach(element => {
    element.style.opacity = "0";
    setTimeout(() => {
      element.value = element === txtCapturedText ? capturedText : 
                      element === txtRgs ? rgs : authority;
      element.style.transition = "opacity 0.3s ease";
      element.style.opacity = "1";
    }, 100);
  });
}

/**
 * Atualiza a barra de progresso para RGs
 * @param {number} current - RG atual sendo processado
 * @param {number} total - Total de RGs a processar
 */
function updateProgressBar(current, total) {
  const progressContainer = document.getElementById('rg-progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  
  // Proteção contra null
  if (!progressContainer || !progressBar || !progressText) {
    console.error("Elementos de progresso não encontrados");
    return;
  }
  
  // Mostra o container de progresso
  progressContainer.style.display = 'block';
  
  // Calcula a porcentagem
  const percentage = Math.round((current / total) * 100);
  
  // Atualiza a barra e o texto
  progressBar.style.width = `${percentage}%`;
  progressText.textContent = `${current}/${total}`;
  
  // Adiciona classes para efeitos visuais baseados no progresso
  progressBar.classList.remove('progress-bar-start', 'progress-bar-middle', 'progress-bar-complete');
  
  if (percentage < 30) {
    progressBar.classList.add('progress-bar-start');
  } else if (percentage < 100) {
    progressBar.classList.add('progress-bar-middle');
  } else {
    progressBar.classList.add('progress-bar-complete');
  }
}

/**
 * Preenche o formulário na página ativa (SICAD)
 * Inclui a lógica de preenchimento sequencial de RGs
 */
function fillForm() {
  // Verifica se as configurações foram carregadas
  if (!configLoaded || !CONFIG) {
    showNotification("Aguarde o carregamento das configurações", "error");
    return;
  }
  
  // NOVA LÓGICA: Lê os valores atuais dos campos
  const txtCapturedText = document.getElementById('capturedText');
  const txtRgs = document.getElementById('rgs');
  const txtAuthority = document.getElementById('autoridade');
  
  // Verifica se os campos existem
  if (!txtCapturedText || !txtRgs || !txtAuthority) {
    showNotification('Erro ao ler os campos do formulário', 'error');
    return;
  }
  
  // Usa os valores atuais dos campos em vez das variáveis globais
  const textoElogio = txtCapturedText.value.trim();
  const autoridade = txtAuthority.value.trim();
  const rgInput = txtRgs.value.trim();
  
  if (!textoElogio && !autoridade && !rgInput) {
    showNotification('Não há dados para preencher. Capture os dados primeiro.', 'error');
    return;
  }
  
  // Obtém a lista de RGs
  const rgList = rgInput.split(',').map(rg => rg.trim()).filter(Boolean);
  
  // Ativa o splash durante o preenchimento
  toggleSplash(true, "Iniciando preenchimento do formulário...", 2000);
  
  // Primeiro preenche os campos de texto e autoridade
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: preencherCamposTexto,
      args: [textoElogio, autoridade, CONFIG.fieldSelectors],
    }).then(() => {
      // Após preencher os campos de texto, inicia o preenchimento dos RGs
      if (rgList.length > 0) {
        toggleSplash(true, `Preenchendo ${rgList.length} RGs...`, 2000);
        
        // Executa o script para processar os RGs
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: processarRGs,
          args: [rgList, CONFIG.fieldSelectors, CONFIG.timings]
        }).then(() => {
          showNotification(`Processamento de RGs iniciado. Total: ${rgList.length}`, 'info');
        }).catch(err => {
          console.error("Erro ao iniciar processamento de RGs:", err);
          showNotification('Erro ao processar RGs. Verifique o console.', 'error');
        });
      } else {
        showNotification('Formulário preenchido com sucesso!', 'success');
      }
    }).catch(err => {
      toggleSplash(false);
      showNotification('Erro ao preencher o formulário. Tente novamente.', 'error');
      console.error("Erro ao preencher formulário:", err);
    });
  });
}

/**
 * Salva dados no localStorage para persistência
 * Pode ser chamado com dados específicos ou sem parâmetros para usar os valores dos campos
 */
function saveData(specificText, specificRgs, specificAuthority) {
  // Se chamado com parâmetros, usa os valores fornecidos
  // Caso contrário, lê dos campos de entrada quando disponíveis
  if (specificText !== undefined && specificRgs !== undefined && specificAuthority !== undefined) {
    capturedText = specificText;
    rgs = specificRgs;
    authority = specificAuthority;
  } else {
    // Tenta ler os valores atuais dos campos do formulário
    const txtCapturedText = document.getElementById('capturedText');
    const txtRgs = document.getElementById('rgs');
    const txtAuthority = document.getElementById('autoridade');
    
    if (txtCapturedText && txtRgs && txtAuthority) {
      // Atualiza as variáveis globais com os valores dos campos
      capturedText = txtCapturedText.value.trim();
      rgs = txtRgs.value.trim();
      authority = txtAuthority.value.trim();
    }
  }
  
  // Salva no localStorage
  localStorage.setItem('capturedText', capturedText);
  localStorage.setItem('rgs', rgs);
  localStorage.setItem('autoridade', authority);
  localStorage.setItem('darkMode', darkMode.toString());
}

/**
 * Carrega dados do localStorage
 */
function loadData() {
  capturedText = localStorage.getItem('capturedText') || '';
  rgs = localStorage.getItem('rgs') || '';
  authority = localStorage.getItem('autoridade') || '';
  darkMode = localStorage.getItem('darkMode') === 'true';
  
  // Aplica o modo escuro se estiver ativado
  if (darkMode) {
    document.body.classList.add('dark-mode');
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.innerHTML = '<i class="fas fa-sun"></i> Modo claro';
    }
  }
  
  // Define a flag para evitar que a atualização dos campos seja tratada como edição manual
  isAutomaticUpdate = true;
  
  // Atualiza a interface
  updateUI();
  
  // Restaura a flag para permitir edições manuais serem detectadas novamente
  setTimeout(() => {
    isAutomaticUpdate = false;
  }, 500);
}

/**
 * Limpa todos os dados e localStorage
 */
function clearData() {
  // Verifica se as configurações foram carregadas
  if (!configLoaded) {
    showNotification("Aguarde o carregamento das configurações", "error");
    return;
  }
  
  // Ativa o splash durante a limpeza
  toggleSplash(true, "Limpando todos os dados...", 1500);
  
  setTimeout(() => {
    capturedText = '';
    rgs = '';
    authority = '';
    
    // Define a flag para evitar que a atualização dos campos seja tratada como edição manual
    isAutomaticUpdate = true;
    
    // Atualiza a interface
    updateUI();
    
    // Restaura a flag para permitir edições manuais serem detectadas novamente
    setTimeout(() => {
      isAutomaticUpdate = false;
    }, 500);
    
    localStorage.removeItem('capturedText');
    localStorage.removeItem('rgs');
    localStorage.removeItem('autoridade');
    
    showNotification('Todos os dados foram limpos', 'info');
  }, 1000);
}

/**
 * Alterna entre modo escuro e claro
 */
function toggleDarkMode() {
  // Verifica se as configurações foram carregadas
  if (!configLoaded) {
    showNotification("Aguarde o carregamento das configurações", "error");
    return;
  }
  
  // Ativa o splash durante a troca de tema
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
    
    saveData();
    showNotification(`Modo ${darkMode ? 'escuro' : 'claro'} ativado`, 'info');
  }, 1000);
}

// ===== FUNÇÕES INJETADAS NA PÁGINA =====

/**
 * Função injetada na página para extrair conteúdo
 * Executada no contexto da página do SEI
 * @returns {string} Texto extraído
 */
function extractContentFromPage() {
  let extractedText = '';

  try {
    // Tenta acessar o iframe principal
    const iframeVisualizacao = document.getElementById('ifrVisualizacao');
    if (iframeVisualizacao) {
      const iframeDoc1 = iframeVisualizacao.contentDocument || iframeVisualizacao.contentWindow.document;
      
      // Tenta acessar o iframe interno
      const iframeArvoreHtml = iframeDoc1.getElementById('ifrArvoreHtml');
      if (iframeArvoreHtml) {
        const iframeDoc2 = iframeArvoreHtml.contentDocument || iframeArvoreHtml.contentWindow.document;
        extractedText = iframeDoc2.body.innerText.trim();
      }
    }
    
    // Retorna texto vazio caso não consiga encontrar
    return extractedText;
  } catch (e) {
    console.error('Erro ao acessar o conteúdo:', e);
    return '';
  }
}

/**
 * Função injetada para preencher os campos de texto e autoridade
 * @param {string} textoElogio - Texto processado para preencher
 * @param {string} autoridade - Nome da autoridade
 * @param {Object} selectors - Seletores de campos do formulário da configuração
 */
function preencherCamposTexto(textoElogio, autoridade, selectors) {
  function buscarElemento(seletor) {
    let elemento = document.querySelector(seletor);
    
    if (!elemento) {
      const iframes = Array.from(document.querySelectorAll('iframe')).flatMap((iframe) => {
        try {
          return iframe.contentDocument ? [iframe.contentDocument.querySelector(seletor)] : [];
        } catch {
          return [];
        }
      });
      elemento = iframes.find(Boolean);
    }
    
    return elemento;
  }

  const campoTextoElogio = buscarElemento(selectors.textField);
  const campoAutoridade = buscarElemento(selectors.authorityField);
    
  // Aplica efeito visual de preenchimento para melhor experiência do usuário
  if (campoTextoElogio) {
    campoTextoElogio.style.transition = "background-color 0.3s ease";
    campoTextoElogio.style.backgroundColor = "#e6f7ff";
    campoTextoElogio.value = textoElogio;
      
    setTimeout(() => {
      campoTextoElogio.style.backgroundColor = "";
    }, 500);
  }
    
  if (campoAutoridade) {
    campoAutoridade.style.transition = "background-color 0.3s ease";
    campoAutoridade.style.backgroundColor = "#e6f7ff";
    campoAutoridade.value = autoridade;
      
    setTimeout(() => {
      campoAutoridade.style.backgroundColor = "";
    }, 500);
  }
    
  // Ajusta a altura do iframe para melhor visualização (se existir)
  try {
    const xpath = "/html/body/form/table/tbody/tr[5]/td/iframe";
    const iframe = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    
    if (iframe) {
      iframe.style.height = '200px';
    }
  } catch (e) {
    console.log("Não foi possível ajustar altura do iframe:", e);
  }
  
  return true;
}

/**
 * Função injetada para processar e inserir múltiplos RGs
 * Baseada na lógica da extensão "Adiciona RG" que funcionava anteriormente
 * @param {Array} rgNumbers - Lista de RGs para processar
 * @param {Object} selectors - Seletores de campos do formulário da configuração
 * @param {Object} timings - Configurações de tempo para o processamento
 */
function processarRGs(rgNumbers, selectors, timings) {
  let currentIndex = 0;
  const total = rgNumbers.length;
  
  // Função para processar um RG individual
  function processarNumero(numero, callback) {
    console.log(`Processando RG: ${numero} (${currentIndex + 1}/${total})`);
    
    function tentarPreencherFormulario() {
      // Tenta encontrar o campo de RG e o botão "Adicionar"
      let campoRG = document.querySelector(selectors.rgField);
      let botaoAdicionar = document.querySelector(selectors.addButtonSelector);
      
      // Se não encontrar, procura dentro de iframes
      if (!campoRG || !botaoAdicionar) {
        const iframes = document.querySelectorAll('iframe');
        if (iframes.length > 0) {
          for (let i = 0; i < iframes.length; i++) {
            try {
              const iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
              campoRG = iframeDoc.querySelector(selectors.rgField);
              botaoAdicionar = iframeDoc.querySelector(selectors.addButtonSelector);
              if (campoRG && botaoAdicionar) break;
            } catch (e) {
              console.error("Erro ao acessar iframe:", e);
            }
          }
        }
      }
      
      // Se ainda não encontrou, tenta novamente
      if (!campoRG || !botaoAdicionar) {
        console.log("Campo RG ou botão Adicionar não encontrado, tentando novamente...");
        setTimeout(tentarPreencherFormulario, timings.fieldFocusDelay);
        return;
      }
      
      // Preenche o campo e clica no botão
      campoRG.focus();
      campoRG.value = '';
      
      setTimeout(() => {
        // Destaca o campo para efeito visual
        campoRG.style.transition = "background-color 0.3s ease";
        campoRG.style.backgroundColor = "#e6f7ff";
        
        // Preenche o valor
        campoRG.value = numero;
        
        setTimeout(() => {
          // Remove destaque e clica no botão
          campoRG.style.backgroundColor = "";
          botaoAdicionar.click();
          console.log(`RG ${numero} adicionado com sucesso!`);
          
          // Notifica o popup sobre o progresso
          chrome.runtime.sendMessage({ 
            type: 'rgProgress', 
            current: currentIndex + 1, 
            total: total 
          });
          
          // Chama o callback após um delay para processar o próximo
          setTimeout(callback, timings.rgProcessingDelay);
        }, timings.buttonClickDelay);
      }, timings.fieldFocusDelay);
    }
    
    tentarPreencherFormulario();
  }
  
  // Função recursiva para processar todos os RGs em sequência
  function processarProximoRG() {
    if (currentIndex >= rgNumbers.length) {
      console.log("Todos os RGs foram processados com sucesso!");
      chrome.runtime.sendMessage({ 
        type: 'rgComplete', 
        total: total 
      });
      return;
    }
    
    processarNumero(rgNumbers[currentIndex], () => {
      currentIndex++;
      processarProximoRG();
    });
  }
  
  // Inicia o processamento
  processarProximoRG();
}

// Ouve mensagens de progresso do content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'rgProgress') {
    updateProgressBar(message.current, message.total);
    
    // Atualiza o splash screen com o progresso
    const progress = Math.round((message.current / message.total) * 100);
    toggleSplash(true, `Processando RGs: ${message.current} de ${message.total} (${progress}%)`, 1000);
    
    // Se for o último, mostra uma notificação de sucesso
    if (message.current === message.total) {
      showNotification(`Todos os ${message.total} RGs foram adicionados com sucesso!`, 'success');
    }
  } else if (message.type === 'rgComplete') {
    showNotification(`Todos os ${message.total} RGs foram adicionados com sucesso!`, 'success');
    
    // Completa a barra de progresso e deixa ela visível por um tempo
    updateProgressBar(message.total, message.total);
    
    // Oculta a barra de progresso após 5 segundos
    const progressContainer = document.getElementById('rg-progress-container');
    if (progressContainer) {
      setTimeout(() => {
        progressContainer.style.display = 'none';
      }, 5000);
    }
  }
});

/**
 * Configura os listeners para capturar alterações manuais nos campos
 */
function setupInputListeners() {
  const txtCapturedText = document.getElementById('capturedText');
  const txtRgs = document.getElementById('rgs');
  const txtAuthority = document.getElementById('autoridade');
  
  // Proteção contra null
  if (!txtCapturedText || !txtRgs || !txtAuthority) {
    console.error("Elementos de formulário não encontrados para configurar listeners");
    return;
  }
  
  // Função para salvar após edição em qualquer campo
  const handleInputChange = () => {
    // Verifica se a atualização é automática ou manual
    if (!isAutomaticUpdate) {
      // Atualiza as variáveis globais com os valores atuais dos campos
      capturedText = txtCapturedText.value.trim();
      rgs = txtRgs.value.trim();
      authority = txtAuthority.value.trim();
      
      // Salva no localStorage
      saveData(capturedText, rgs, authority);
      console.log("Alterações manuais salvas");
    }
  };
  
  // Adiciona event listeners para mudanças nos campos
  // Usa o evento 'input' para capturar alterações em tempo real
  txtCapturedText.addEventListener('input', handleInputChange);
  txtRgs.addEventListener('input', handleInputChange);
  txtAuthority.addEventListener('input', handleInputChange);
  
  // Também captura quando o usuário sai do campo (para melhor compatibilidade)
  txtCapturedText.addEventListener('blur', handleInputChange);
  txtRgs.addEventListener('blur', handleInputChange);
  txtAuthority.addEventListener('blur', handleInputChange);
  
  console.log("Event listeners configurados para os campos de entrada");
}

// ===== EVENTOS AO CARREGAR A PÁGINA =====
document.addEventListener('DOMContentLoaded', async function() {
  // Exibe o splash screen inicial
  toggleSplash(true, "Iniciando Extrator DOPM...", 2500);
  
  try {
    // Tenta carregar a configuração
    await loadExternalConfig();
    
    // Se chegou aqui, configurações foram carregadas com sucesso
    // Carrega dados salvos e verifica a aba atual após o splash
    setTimeout(() => {
      loadData();
      checkActiveTab();
      
      // Configura listeners para capturar edições manuais
      setupInputListeners();
    }, 1000);
    
    // Registra eventos para os botões (com verificação de null)
    const registerClickHandler = (id, handler) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('click', handler);
      } else {
        console.warn(`Elemento #${id} não encontrado`);
      }
    };
    
    registerClickHandler('captureButton', captureContent);
    registerClickHandler('fillButton', fillForm);
    registerClickHandler('clearButtonTop', clearData);
    registerClickHandler('clearButtonBottom', clearData);
    registerClickHandler('darkModeToggle', toggleDarkMode);
    
    // Adiciona eventos de suavização para botões
    const allButtons = document.querySelectorAll('button:not(#retry-button)');
    if (allButtons) {
      allButtons.forEach(button => {
        if (button) {
          button.addEventListener('mousedown', () => {
            if (!button.disabled) {
              button.style.transform = 'scale(0.98)';
            }
          });
          
          button.addEventListener('mouseup', () => {
            button.style.transform = '';
          });
          
          button.addEventListener('mouseleave', () => {
            button.style.transform = '';
          });
        }
      });
    }
  } catch (error) {
    console.error("Erro fatal na inicialização:", error);
  }
});

// Initialize the module when DOM is loaded
document.addEventListener('DOMContentLoaded', init);