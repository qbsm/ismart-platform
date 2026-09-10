Total messages: 16 (Errors: 12, Warnings: 2)
Returning 12 messages for level "error"

[ERROR] Failed to load resource: the server responded with a status of 404 (Not Found) @ https://stage.cuckoo.downfall.ru/cuckoo/options:0
[ERROR] Failed to load resource: the server responded with a status of 404 (Not Found) @ https://stage.cuckoo.downfall.ru/cuckoo/options:0
[ERROR] Failed to load resource: the server responded with a status of 403 () @ https://cdp.avtodom.ru/api/sdk/weblayers/resolve?utm_referrer=https%3a%2f%2fascgroup.ru%2f:0
[ERROR] WebLayer fetch error: Error: WebLayer resolve failed: 403
    at SDK.fetchWeblayersConfig (https://cdn.avtodom.ru/upload/Y/sdk.min.js:1:18796)
    at async SDK.runWeblayers (https://cdn.avtodom.ru/upload/Y/sdk.min.js:1:19277) @ https://cdn.downfall.ru/cuckoo/cuckoo.js:18
[ERROR] Failed to load resource: the server responded with a status of 403 () @ https://cdp.avtodom.ru/api/sdk/mobile-app/installed?globalId=8a2861a4-f1ce-430a-85ba-f571b60a677e&days=30&utm_referrer=https%3a%2f%2fascgroup.ru%2f:0
[ERROR] Mobile app status check error: Error: Mobile app status request failed: 403
    at SDK._ensureMobileAppStatusInner (https://cdn.avtodom.ru/upload/Y/sdk.min.js:1:6377) @ https://cdn.downfall.ru/cuckoo/cuckoo.js:18
[ERROR] Failed to load resource: the server responded with a status of 403 () @ https://cdp.avtodom.ru/api/sdk/tags/resolve?utm_referrer=https%3a%2f%2fascgroup.ru%2f:0
[ERROR] Tag Manager fetch error: Error: Tag Manager resolve failed: 403
    at SDK.fetchTagManagerConfig (https://cdn.avtodom.ru/upload/Y/sdk.min.js:1:20409)
    at async SDK.runTagManager (https://cdn.avtodom.ru/upload/Y/sdk.min.js:2:847) @ https://cdn.downfall.ru/cuckoo/cuckoo.js:18
[ERROR] Failed to load resource: net::ERR_TOO_MANY_REDIRECTS @ https://api.avtodom.ru/v1/webjs/events?utm_referrer=https%3a%2f%2fservice-himki.ru%2f:0
[ERROR] Error sending event: TypeError: Failed to fetch
    at SDK.sendEvent (https://cdn.avtodom.ru/upload/Y/sdk.min.js:2:3511)
    at SDK.trackEvent (https://cdn.avtodom.ru/upload/Y/sdk.min.js:2:2383)
    at https://cdn.avtodom.ru/upload/Y/sdk.min.js:2:1803 @ https://cdn.downfall.ru/cuckoo/cuckoo.js:18
[ERROR] Failed to load resource: net::ERR_TOO_MANY_REDIRECTS @ https://api.avtodom.ru/v1/webjs/events?utm_referrer=https%3a%2f%2fascgroup.ru%2f:0
[ERROR] Error sending event: TypeError: Failed to fetch
    at SDK.sendEvent (https://cdn.avtodom.ru/upload/Y/sdk.min.js:2:3511)
    at SDK.trackEvent (https://cdn.avtodom.ru/upload/Y/sdk.min.js:2:2383)
    at https://cdn.avtodom.ru/upload/Y/sdk.min.js:2:1803 @ https://cdn.downfall.ru/cuckoo/cuckoo.js:18