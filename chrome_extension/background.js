let capturedData = {
  issueToken: null,
  cookies: null,
  listening: false,
};

/*
 * Google authentication cookies that may be required to keep
 * the Nest issueToken flow usable for longer periods.
 *
 * We still prefer the exact Cookie header Chrome sends with
 * the issueToken request. These are only used to supplement
 * cookies that Chrome has stored but did not include there.
 */
const GOOGLE_AUTH_COOKIES = new Set([
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",

  "__Secure-1PSID",
  "__Secure-3PSID",

  "__Secure-1PAPISID",
  "__Secure-3PAPISID",

  "__Secure-1PSIDTS",
  "__Secure-3PSIDTS",

  "__Secure-1PSIDCC",
  "__Secure-3PSIDCC",

  "SIDCC",
]);

function startListening() {
  capturedData = {
    issueToken: null,
    cookies: null,
    listening: true,
  };

  if (
    !chrome.webRequest.onBeforeRequest.hasListener(
      captureIssueToken
    )
  ) {
    chrome.webRequest.onBeforeRequest.addListener(
      captureIssueToken,
      {
        urls: [
          "https://accounts.google.com/o/oauth2/iframerpc*",
        ],
        types: [
          "xmlhttprequest",
          "sub_frame",
          "main_frame",
        ],
      }
    );
  }

  if (
    !chrome.webRequest.onSendHeaders.hasListener(
      captureRequestCookies
    )
  ) {
    chrome.webRequest.onSendHeaders.addListener(
      captureRequestCookies,
      {
        urls: [
          "https://accounts.google.com/o/oauth2/iframerpc*",
        ],
        types: [
          "xmlhttprequest",
          "sub_frame",
          "main_frame",
        ],
      },
      [
        "requestHeaders",
        "extraHeaders",
      ]
    );
  }
}


function stopListening() {
  capturedData.listening = false;

  if (
    chrome.webRequest.onBeforeRequest.hasListener(
      captureIssueToken
    )
  ) {
    chrome.webRequest.onBeforeRequest.removeListener(
      captureIssueToken
    );
  }

  if (
    chrome.webRequest.onSendHeaders.hasListener(
      captureRequestCookies
    )
  ) {
    chrome.webRequest.onSendHeaders.removeListener(
      captureRequestCookies
    );
  }
}


function captureIssueToken(details) {
  if (
    details.url.includes("action=issueToken")
  ) {
    capturedData.issueToken = details.url;
    checkComplete();
  }
}


function captureRequestCookies(details) {
  if (
    !details.url.includes("action=issueToken")
  ) {
    return;
  }

  const cookieHeader =
    details.requestHeaders?.find(
      (header) =>
        header.name.toLowerCase() === "cookie"
    );

  const cookieMap = new Map();

  /*
   * First use the exact cookies Chrome actually sent
   * with the issueToken request.
   */
  if (
    cookieHeader &&
    cookieHeader.value
  ) {
    cookieHeader.value
      .split(";")
      .forEach((pair) => {
        const trimmed = pair.trim();

        const eqIdx =
          trimmed.indexOf("=");

        if (eqIdx <= 0) {
          return;
        }

        const name =
          trimmed.substring(
            0,
            eqIdx
          );

        const value =
          trimmed.substring(
            eqIdx + 1
          );

        if (name) {
          cookieMap.set(
            name,
            value
          );
        }
      });
  }

  /*
   * Supplement the request with important Google
   * authentication cookies stored by Chrome.
   *
   * We deliberately do NOT copy every Google cookie.
   * Only the authentication/session families that are
   * relevant to this login mechanism are added.
   */
  chrome.cookies.getAll(
    {
      domain: ".google.com",
    },
    (cookies) => {

      if (
        chrome.runtime.lastError
      ) {
        console.error(
          "Unable to read Google cookies:",
          chrome.runtime.lastError
        );
      }

      if (cookies) {

        for (
          const cookie of cookies
        ) {

          if (
            GOOGLE_AUTH_COOKIES.has(
              cookie.name
            ) &&
            !cookieMap.has(
              cookie.name
            )
          ) {

            cookieMap.set(
              cookie.name,
              cookie.value
            );
          }

        }

      }

      /*
       * Only complete the capture if we actually
       * collected useful cookies.
       */
      if (
        cookieMap.size > 0
      ) {

        capturedData.cookies =
          Array.from(
            cookieMap.entries()
          )
            .map(
              ([name, value]) =>
                `${name}=${value}`
            )
            .join("; ");

      }

      checkComplete();
    }
  );
}


function checkComplete() {
  if (
    capturedData.issueToken &&
    capturedData.cookies
  ) {

    stopListening();

    chrome.action.setBadgeText({
      text: "✓",
    });

    chrome.action.setBadgeBackgroundColor({
      color: "#4CAF50",
    });

    chrome.action.openPopup();
  }
}


chrome.runtime.onMessage.addListener(
  (
    message,
    sender,
    sendResponse
  ) => {

    if (
      message.action ===
      "startCapture"
    ) {

      startListening();

      chrome.action.setBadgeText({
        text: "...",
      });

      chrome.action.setBadgeBackgroundColor({
        color: "#FF9800",
      });

      /*
       * Open a fresh Nest tab so the Google OAuth
       * issueToken request is generated again.
       */
      chrome.tabs.create(
        {
          url: "https://home.nest.com/",
        },
        () => {
          sendResponse({
            status: "started",
          });
        }
      );

      return true;
    }


    if (
      message.action ===
      "getStatus"
    ) {
      sendResponse(
        capturedData
      );

      return false;
    }


    if (
      message.action ===
      "reset"
    ) {

      stopListening();

      capturedData = {
        issueToken: null,
        cookies: null,
        listening: false,
      };

      chrome.action.setBadgeText({
        text: "",
      });

      sendResponse({
        status: "reset",
      });

      return false;
    }

  }
);
