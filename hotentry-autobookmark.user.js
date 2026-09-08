// ==UserScript==
// @name         はてなホットエントリー 自動非公開ブックマーク
// @namespace    https://github.com/CiaNostal/hotentry-autobookmark
// @version      1.1.0
// @description  b.hatena.ne.jp のホットエントリーのリンクを開いたら、自動で非公開ブックマーク登録する
// @author       you
// @match        https://b.hatena.ne.jp/
// @match        https://b.hatena.ne.jp/hotentry*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      bookmark.hatenaapis.com
// @updateURL    https://raw.githubusercontent.com/CiaNostal/hotentry-autobookmark/main/hotentry-autobookmark.user.js
// @downloadURL  https://raw.githubusercontent.com/CiaNostal/hotentry-autobookmark/main/hotentry-autobookmark.user.js
// ==/UserScript==

(function () {
  'use strict';

  const API_URL = 'https://bookmark.hatenaapis.com/rest/1/my/bookmark';
  const LINK_SELECTOR = '.entrylist-contents-title a';
  const STORAGE_KEYS = {
    consumerKey: 'hatena_consumer_key',
    consumerSecret: 'hatena_consumer_secret',
    accessToken: 'hatena_access_token',
    accessTokenSecret: 'hatena_access_token_secret',
  };

  const registeredInThisSession = new Set();

  // ---------- 設定(このブラウザ/端末ごとに一度だけ入力する) ----------

  function getConfig() {
    const consumerKey = GM_getValue(STORAGE_KEYS.consumerKey, '');
    const consumerSecret = GM_getValue(STORAGE_KEYS.consumerSecret, '');
    const accessToken = GM_getValue(STORAGE_KEYS.accessToken, '');
    const accessTokenSecret = GM_getValue(STORAGE_KEYS.accessTokenSecret, '');
    if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
      return null;
    }
    return { consumerKey, consumerSecret, accessToken, accessTokenSecret };
  }

  function setupCredentials() {
    const consumerKey = window.prompt('Consumer key を入力してください', GM_getValue(STORAGE_KEYS.consumerKey, ''));
    if (consumerKey === null) return;
    const consumerSecret = window.prompt('Consumer secret を入力してください', GM_getValue(STORAGE_KEYS.consumerSecret, ''));
    if (consumerSecret === null) return;
    const accessToken = window.prompt('Access token を入力してください', GM_getValue(STORAGE_KEYS.accessToken, ''));
    if (accessToken === null) return;
    const accessTokenSecret = window.prompt('Access token secret を入力してください', GM_getValue(STORAGE_KEYS.accessTokenSecret, ''));
    if (accessTokenSecret === null) return;

    GM_setValue(STORAGE_KEYS.consumerKey, consumerKey.trim());
    GM_setValue(STORAGE_KEYS.consumerSecret, consumerSecret.trim());
    GM_setValue(STORAGE_KEYS.accessToken, accessToken.trim());
    GM_setValue(STORAGE_KEYS.accessTokenSecret, accessTokenSecret.trim());
    window.alert('保存しました。');
  }

  GM_registerMenuCommand('設定: OAuth情報を入力/更新', setupCredentials);

  // ---------- OAuth 1.0a 署名(外部ライブラリ不使用、自前実装のSHA-1/HMAC-SHA1) ----------

  function rotl(n, s) {
    return (n << s) | (n >>> (32 - s));
  }

  function sha1(bytes) {
    const len = bytes.length;
    const bitLen = len * 8;
    const padded = new Uint8Array((((len + 9 + 63) >> 6) << 6));
    padded.set(bytes);
    padded[len] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 4, bitLen >>> 0, false);
    dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296), false);

    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    const w = new Array(80);

    for (let i = 0; i < padded.length; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
      for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);

      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let t = 0; t < 80; t++) {
        let f, k;
        if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        const temp = (rotl(a, 5) + f + e + k + w[t]) >>> 0;
        e = d; d = c; c = rotl(b, 30); b = a; a = temp;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }

    const out = new Uint8Array(20);
    const odv = new DataView(out.buffer);
    odv.setUint32(0, h0, false); odv.setUint32(4, h1, false); odv.setUint32(8, h2, false);
    odv.setUint32(12, h3, false); odv.setUint32(16, h4, false);
    return out;
  }

  function concatBytes(...arrs) {
    const total = arrs.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrs) { out.set(a, offset); offset += a.length; }
    return out;
  }

  function hmacSha1(keyBytes, msgBytes) {
    const blockSize = 64;
    let key = keyBytes.length > blockSize ? sha1(keyBytes) : keyBytes;
    const padded = new Uint8Array(blockSize);
    padded.set(key);
    const oKeyPad = new Uint8Array(blockSize);
    const iKeyPad = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      oKeyPad[i] = padded[i] ^ 0x5c;
      iKeyPad[i] = padded[i] ^ 0x36;
    }
    const inner = sha1(concatBytes(iKeyPad, msgBytes));
    return sha1(concatBytes(oKeyPad, inner));
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function rfc3986(str) {
    return encodeURIComponent(str).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  }

  function generateNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function buildAuthHeader(method, baseUrl, params, config) {
    const oauthParams = {
      oauth_consumer_key: config.consumerKey,
      oauth_nonce: generateNonce(),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: config.accessToken,
      oauth_version: '1.0',
    };

    const allParams = Object.assign({}, params, oauthParams);
    const paramString = Object.keys(allParams)
      .sort()
      .map((k) => `${rfc3986(k)}=${rfc3986(allParams[k])}`)
      .join('&');

    const baseString = [method.toUpperCase(), rfc3986(baseUrl), rfc3986(paramString)].join('&');
    const signingKey = `${rfc3986(config.consumerSecret)}&${rfc3986(config.accessTokenSecret)}`;

    const signatureBytes = hmacSha1(
      new TextEncoder().encode(signingKey),
      new TextEncoder().encode(baseString)
    );
    oauthParams.oauth_signature = bytesToBase64(signatureBytes);

    return 'OAuth ' + Object.keys(oauthParams)
      .sort()
      .map((k) => `${rfc3986(k)}="${rfc3986(oauthParams[k])}"`)
      .join(', ');
  }

  // ---------- ブックマーク登録 ----------

  function registerBookmark(articleUrl) {
    const config = getConfig();
    if (!config) {
      console.warn('[hotentry-autobookmark] OAuth情報が未設定です。Tampermonkeyメニューから設定してください。');
      return;
    }
    if (registeredInThisSession.has(articleUrl)) return;
    registeredInThisSession.add(articleUrl);

    const params = { url: articleUrl, private: '1' };
    const authHeader = buildAuthHeader('POST', API_URL, params, config);
    const qs = Object.keys(params).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');

    GM_xmlhttpRequest({
      method: 'POST',
      url: `${API_URL}?${qs}`,
      headers: { Authorization: authHeader },
      onload: (res) => {
        if (res.status === 200) {
          console.log('[hotentry-autobookmark] 登録成功:', articleUrl);
        } else {
          console.error('[hotentry-autobookmark] 登録失敗:', res.status, res.responseText);
        }
      },
      onerror: (err) => console.error('[hotentry-autobookmark] 通信エラー:', err),
    });
  }

  // ---------- クリック検知(遷移はブロックしない) ----------

  document.addEventListener(
    'click',
    (event) => {
      const link = event.target.closest(LINK_SELECTOR);
      if (!link || !link.href) return;
      registerBookmark(link.href);
    },
    true
  );
})();
