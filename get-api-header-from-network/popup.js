chrome.runtime.sendMessage({ action: "getAuthHeader" }, (response) => {
    const authHeaderElement = document.getElementById('auth-header');
    authHeaderElement.textContent = response.authHeader || 'Not found';
  });