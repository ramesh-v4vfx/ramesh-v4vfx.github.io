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
  const RV_NOTIFY_ENDPOINT = 'https://rv-notify.ramesh-rkvfx.workers.dev';

  // Storage can be blocked (private mode, strict settings). Fall back to an id kept in memory
  // so reminders still work for this page visit instead of failing outright.
  let memoryId = null;
  function getVisitorId() {
    let id = null;
    try { id = localStorage.getItem('rvVisitorId'); } catch (e) {}
    if (!id) {
      id = memoryId || (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      memoryId = id;
      try { localStorage.setItem('rvVisitorId', id); } catch (e) {}
    }
    return id;
  }

  // fetch that gives up after 10 s, so a bad connection can't leave a button stuck on "wait"
  function rvFetch(url, opts) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, 10000);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(function () { clearTimeout(timer); });
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
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      throw new Error('serviceWorker/PushManager unsupported in this browser');
    }
    if (Notification.permission === 'denied') return null;      // blocked in browser settings: nothing to ask

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return null;

      const keyRes = await rvFetch(RV_NOTIFY_ENDPOINT + '/vapid-public-key');
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
    const subRes = await rvFetch(RV_NOTIFY_ENDPOINT + '/subscribe' + query(), {
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

    const res = await rvFetch(RV_NOTIFY_ENDPOINT + '/schedule' + query(channel), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifications: payload })
    });
    if (!res.ok) throw new Error('/schedule failed: ' + res.status);
  }

  // Cancels the not-yet-fired notifications of one lane only.
  async function cancelNotifications(channel) {
    await rvFetch(RV_NOTIFY_ENDPOINT + '/cancel' + query(channel), {
      method: 'POST'
    });
  }

  // Full "forget me": drops this browser's push subscription and tells the worker to delete it.
  // Not called by the tools on their own: the subscription is shared by every tool, so turning
  // one tool's Notify me off must not switch off the others. Needs a /unsubscribe route on the
  // worker; if the worker doesn't have one yet, the browser-side unsubscribe still happens.
  async function unsubscribe() {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration('/sw.js') || await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub) return false;
    try { await rvFetch(RV_NOTIFY_ENDPOINT + '/unsubscribe' + query(), { method: 'POST' }); } catch (e) {}
    return sub.unsubscribe();
  }

  window.RVNotify = {
    ensurePushSubscription: ensurePushSubscription,
    scheduleNotifications: scheduleNotifications,
    cancelNotifications: cancelNotifications,
    unsubscribe: unsubscribe,
    getVisitorId: getVisitorId
  };
})(window);
