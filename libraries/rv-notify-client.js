// Place this file at https://rameshverse.com/libraries/rv-notify-client.js
// Include it on any tool's page with:
//   <script src="/libraries/rv-notify-client.js"></script>
// then use window.RVNotify from that tool's own script.
//
// LANES: scheduleNotifications() and cancelNotifications() take an optional lane name.
// Without one they use the original lane (Timer, Pomodoro Focus, Focus Timer, unchanged).
// A tool that passes its own lane (the homepage notes use 'notes') never replaces or
// cancels another tool's reminders. Needs the rv-notify worker that understands ?ch=.

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

  // "?id=<visitor>" plus "&ch=<lane>" when a lane is given
  function query(channel) {
    return '?id=' + encodeURIComponent(getVisitorId()) + (channel ? '&ch=' + encodeURIComponent(channel) : '');
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

    if (!sub) {
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
    }

    // Always (re)send the subscription to the server — cheap and idempotent.
    // Guarantees the Durable Object actually has it, even if the browser
    // already had a cached subscription from before this endpoint existed.
    const subRes = await fetch(RV_NOTIFY_ENDPOINT + '/subscribe' + query(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub })
    });
    if (!subRes.ok) throw new Error('/subscribe failed: ' + subRes.status);

    return sub;
  }

  // notifications: [{ delayMs, title, body, tag }]
  // Replaces any previously scheduled (not-yet-fired) notifications in the same lane
  // (the original lane when no channel is given). Other lanes are left alone.
  async function scheduleNotifications(notifications, channel) {
    const now = Date.now();
    const payload = notifications.map(function (n) {
      return { fireAt: now + n.delayMs, title: n.title, body: n.body, tag: n.tag };
    });

    const res = await fetch(RV_NOTIFY_ENDPOINT + '/schedule' + query(channel), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifications: payload })
    });
    if (!res.ok) throw new Error('/schedule failed: ' + res.status);
  }

  // Cancels the not-yet-fired notifications of one lane only.
  async function cancelNotifications(channel) {
    await fetch(RV_NOTIFY_ENDPOINT + '/cancel' + query(channel), {
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
