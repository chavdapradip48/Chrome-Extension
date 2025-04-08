console.log('Background script is running...');

let isFirstCallCaptured = false;

chrome.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
    console.log('Intercepted request:', details.url); // Log every request to debug
    if (!isFirstCallCaptured && details.url.includes('api/v1/leaves/my-leaves')) {
      const headers = details.requestHeaders;
      const authHeader = headers.find(header => header.name.toLowerCase() === 'authorization')?.value || 'Not found';

      console.log('First API Call (via webRequest):');
      console.log('URL:', details.url);
      console.log('All Headers:', headers);
      console.log('Authorization Header:', authHeader);

      isFirstCallCaptured = true;
    }
    return { requestHeaders: details.requestHeaders };
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);