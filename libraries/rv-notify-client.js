// Place this file at https://rameshverse.com/libraries/rv-notify-client.js
// Include it on any tool's page with:
//   <script src="/libraries/rv-notify-client.js"></script>
// then use window.RVNotify from that tool's own script.

(function (window) {
  // ⚠️ Replace with your deployed Worker URL after `wrangler deploy`.
  const RV_NOTIFY_ENDPOINT = 'https://rv-notify.ramesh-rkvfx.workers.dev';

  function getVisitorId() {
    let id = localStorage.getItem('rvVisitorId');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      localStorage.setItem('rvVisitorId', id);
    }
    return id;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
    return output;
  }

  // Registers the service worker and subscribes for push, asking permission
  // the first time. Safe to call every time a tool starts a session — it's a
  // no-op if already subscribed. Returns null if unsupported or denied.
  async function ensurePushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('serviceWorker/PushManager unsupported in this browser');
    }

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (sub) return sub;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const keyRes = await fetch(RV_NOTIFY_ENDPOINT + '/vapid-public-key');
    if (!keyRes.ok) throw new Error('vapid-public-key fetch failed: ' + keyRes.status);
    const { key } = await keyRes.json();
    if (!key) throw new Error('vapid-public-key response had no key');

    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key)
    });

    const subRes = await fetch(RV_NOTIFY_ENDPOINT + '/subscribe?id=' + encodeURIComponent(getVisitorId()), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub })
    });
    if (!subRes.ok) throw new Error('/subscribe failed: ' + subRes.status);

    return sub;
  }

  // notifications: [{ delayMs, title, body, tag }]
  // Replaces any previously scheduled (not-yet-fired) notifications for this visitor.
  async function scheduleNotifications(notifications) {
    const now = Date.now();
    const payload = notifications.map(function (n) {
      return { fireAt: now + n.delayMs, title: n.title, body: n.body, tag: n.tag };
    });

    const res = await fetch(RV_NOTIFY_ENDPOINT + '/schedule?id=' + encodeURIComponent(getVisitorId()), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifications: payload })
    });
    if (!res.ok) throw new Error('/schedule failed: ' + res.status);
  }

  async function cancelNotifications() {
    await fetch(RV_NOTIFY_ENDPOINT + '/cancel?id=' + encodeURIComponent(getVisitorId()), {
      method: 'POST'
    });
  }

  window.RVNotify = {
    ensurePushSubscription: ensurePushSubscription,
    scheduleNotifications: scheduleNotifications,
    cancelNotifications: cancelNotifications,
    getVisitorId: getVisitorId
  };
})(window);
