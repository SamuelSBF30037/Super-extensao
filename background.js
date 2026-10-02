/**
 * Super DOPM - Service Worker (v3.0)
 *
 * Responsavel unico por abrir o painel lateral (Side Panel) ao clicar no icone
 * da extensao. O restante da aplicacao vive no painel (sidepanel.html).
 */

const SIDE_PANEL_PATH = 'sidepanel.html';

chrome.runtime.onInstalled.addListener(async (details) => {
  await configurarSidePanel();

  if (details.reason === 'install') {
    try {
      await chrome.sidePanel.setOptions({ path: SIDE_PANEL_PATH });
    } catch (e) {
      console.warn('Nao foi possivel definir o caminho do painel lateral:', e);
    }
  }
});

chrome.runtime.onStartup.addListener(() => {
  configurarSidePanel();
});

/**
 * Habilita a abertura automatica do painel lateral ao clicar no icone.
 * O metodo setPanelBehavior exige Chrome 114+.
 */
async function configurarSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (e) {
    // Navegadores sem suporte: mantem o fallback por onClicked.
    console.warn('setPanelBehavior indisponivel, usando fallback:', e);
    chrome.action.onClicked.addListener((tab) => {
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
        chrome.windows.create({ url: chrome.runtime.getURL(SIDE_PANEL_PATH), width: 480 });
      });
    });
  }
}

configurarSidePanel();
