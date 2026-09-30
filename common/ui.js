/**
 * Common UI components and functions for the extension
 */

/**
 * Creates a notification element
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, info, warning)
 * @param {number} duration - Duration in ms (0 for no auto-hide)
 * @returns {HTMLElement} The notification element
 */
function createNotification(message, type = 'info', duration = 3000) {
  // Remove existing notifications with the same type
  const existingNotifications = document.querySelectorAll(`.notification.${type}`);
  existingNotifications.forEach(notif => {
    if (notif.dataset.removing !== 'true') {
      removeNotification(notif);
    }
  });
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  // Icon based on type
  const iconClass = 
    type === 'success' ? 'fa-check-circle' :
    type === 'error' ? 'fa-exclamation-circle' :
    type === 'warning' ? 'fa-exclamation-triangle' :
    'fa-info-circle';
  
  notification.innerHTML = `
    <i class="fas ${iconClass}"></i>
    <span>${message}</span>
    <button class="notification-close"><i class="fas fa-times"></i></button>
  `;
  
  // Add close button event
  const closeButton = notification.querySelector('.notification-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      removeNotification(notification);
    });
  }
  
  // Add to DOM
  document.body.appendChild(notification);
  
  // Show with animation
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Auto-hide after duration
  if (duration > 0) {
    setTimeout(() => {
      removeNotification(notification);
    }, duration);
  }
  
  return notification;
}

/**
 * Removes a notification with animation
 * @param {HTMLElement} notification - The notification element to remove
 */
function removeNotification(notification) {
  if (!notification) return;
  
  notification.dataset.removing = 'true';
  notification.classList.remove('show');
  
  // Remove from DOM after animation
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300);
}

/**
 * Creates a confirmation dialog
 * @param {string} message - Dialog message
 * @param {Object} options - Dialog options
 * @returns {Promise} Promise that resolves with user's choice
 */
function createConfirmDialog(message, options = {}) {
  return new Promise((resolve) => {
    const defaults = {
      title: 'Confirmação',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      confirmClass: 'btn-blue',
      cancelClass: 'btn-red',
      showCancel: true
    };
    
    const settings = { ...defaults, ...options };
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'dialog-container';
    
    // Dialog content
    dialog.innerHTML = `
      <div class="dialog-header">
        <h3>${settings.title}</h3>
        <button class="dialog-close"><i class="fas fa-times"></i></button>
      </div>
      <div class="dialog-body">
        <p>${message}</p>
      </div>
      <div class="dialog-footer">
        ${settings.showCancel ? `<button class="dialog-cancel ${settings.cancelClass}">${settings.cancelText}</button>` : ''}
        <button class="dialog-confirm ${settings.confirmClass}">${settings.confirmText}</button>
      </div>
    `;
    
    // Add to DOM
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Show with animation
    setTimeout(() => {
      overlay.classList.add('show');
    }, 10);
    
    // Close button event
    const closeButton = dialog.querySelector('.dialog-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        closeDialog(overlay, false);
      });
    }
    
    // Cancel button event
    const cancelButton = dialog.querySelector('.dialog-cancel');
    if (cancelButton) {
      cancelButton.addEventListener('click', () => {
        closeDialog(overlay, false);
      });
    }
    
    // Confirm button event
    const confirmButton = dialog.querySelector('.dialog-confirm');
    if (confirmButton) {
      confirmButton.addEventListener('click', () => {
        closeDialog(overlay, true);
      });
    }
    
    // Close dialog function
    function closeDialog(overlay, result) {
      overlay.classList.remove('show');
      
      // Remove from DOM after animation
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        
        resolve(result);
      }, 300);
    }
  });
}

/**
 * Creates a loading spinner
 * @param {string} message - Loading message
 * @param {string} container - Container selector (if null, appends to body)
 * @returns {HTMLElement} The loading spinner element
 */
function createLoadingSpinner(message = 'Carregando...', container = null) {
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  
  spinner.innerHTML = `
    <div class="spinner-container">
      <div class="spinner"></div>
      <p>${message}</p>
    </div>
  `;
  
  if (container) {
    const containerElement = document.querySelector(container);
    if (containerElement) {
      containerElement.appendChild(spinner);
    } else {
      document.body.appendChild(spinner);
    }
  } else {
    document.body.appendChild(spinner);
  }
  
  // Show with animation
  setTimeout(() => {
    spinner.classList.add('show');
  }, 10);
  
  // Return with remove method
  spinner.remove = () => {
    spinner.classList.remove('show');
    
    // Remove from DOM after animation
    setTimeout(() => {
      if (spinner.parentNode) {
        spinner.parentNode.removeChild(spinner);
      }
    }, 300);
  };
  
  spinner.updateMessage = (newMessage) => {
    const messageElement = spinner.querySelector('p');
    if (messageElement) {
      messageElement.textContent = newMessage;
    }
  };
  
  return spinner;
}

/**
 * Creates a tooltip on an element
 * @param {HTMLElement} element - Element to attach tooltip to
 * @param {string} message - Tooltip message
 * @param {string} position - Tooltip position (top, bottom, left, right)
 */
function createTooltip(element, message, position = 'top') {
  if (!element) return;
  
  element.setAttribute('data-tooltip', message);
  element.setAttribute('data-tooltip-position', position);
  element.classList.add('has-tooltip');
}

/**
 * Creates tabs for content sections
 * @param {string} container - Container selector
 * @param {Array} tabs - Array of tab objects with id, label, content
 * @returns {Object} Tab control methods
 */
function createTabs(container, tabs) {
  const containerElement = document.querySelector(container);
  if (!containerElement) return;
  
  // Create tabs container
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'tabs-container';
  
  // Create tab buttons
  const tabButtons = document.createElement('div');
  tabButtons.className = 'tab-buttons';
  
  // Create content container
  const tabContents = document.createElement('div');
  tabContents.className = 'tab-contents';
  
  // Add tabs
  tabs.forEach((tab, index) => {
    // Create tab button
    const button = document.createElement('button');
    button.className = 'tab-button';
    button.innerHTML = `<span>${tab.label}</span>`;
    button.dataset.tabId = tab.id;
    
    if (index === 0) {
      button.classList.add('active');
    }
    
    // Create tab content
    const content = document.createElement('div');
    content.className = 'tab-content';
    content.id = `tab-content-${tab.id}`;
    content.innerHTML = tab.content;
    
    if (index === 0) {
      content.classList.add('active');
    }
    
    // Add click event
    button.addEventListener('click', () => {
      // Deactivate all
      tabButtons.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
      });
      
      tabContents.querySelectorAll('.tab-content').forEach(cnt => {
        cnt.classList.remove('active');
      });
      
      // Activate current
      button.classList.add('active');
      content.classList.add('active');
    });
    
    tabButtons.appendChild(button);
    tabContents.appendChild(content);
  });
  
  // Add to container
  tabsContainer.appendChild(tabButtons);
  tabsContainer.appendChild(tabContents);
  containerElement.appendChild(tabsContainer);
  
  // Return control methods
  return {
    goToTab: (tabId) => {
      const button = tabButtons.querySelector(`[data-tab-id="${tabId}"]`);
      if (button) {
        button.click();
      }
    },
    getCurrentTab: () => {
      const activeButton = tabButtons.querySelector('.tab-button.active');
      return activeButton ? activeButton.dataset.tabId : null;
    },
    updateContent: (tabId, newContent) => {
      const content = tabContents.querySelector(`#tab-content-${tabId}`);
      if (content) {
        content.innerHTML = newContent;
      }
    }
  };
}

// Export the UI components for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createNotification,
    removeNotification,
    createConfirmDialog,
    createLoadingSpinner,
    createTooltip,
    createTabs
  };
}