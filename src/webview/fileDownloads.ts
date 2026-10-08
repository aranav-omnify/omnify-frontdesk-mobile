import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform, ToastAndroid } from "react-native";
import DownloadsSaver from "../../modules/downloads-saver";

// The WebView has no tabs and can't save blob:/data: URLs, so file actions the
// web app does the "browser way" (window.open into a new tab, <a download>,
// blob URLs) silently do nothing. This script runs before the page loads and
// routes those actions to native:
//  - blob:/data:/download links are read inside the page (where the blob and
//    session cookies live) and posted to native as base64 (FILE_DOWNLOAD)
//  - files the page can't fetch (cross-origin, CORS) are fetched by native
//    instead (FILE_FETCH_NATIVE)
//  - window.open() with no URL returns a stand-in window; whatever the page
//    later loads into it (location, document.write, iframe) is forwarded
//  - http(s) targets of a deferred window go back to native (OPEN_WINDOW)
// Each file carries an intent: things opened in a new tab are "view" (shown
// in-app), <a download> links are "download" (saved to the device).
export const FILE_DOWNLOAD_BRIDGE_SCRIPT = String.raw`
  (function() {
    if (window.__omnifyDownloadBridge) return;
    window.__omnifyDownloadBridge = true;

    function post(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    }

    function fail(err) {
      post({ action: 'FILE_DOWNLOAD_ERROR', payload: { message: String((err && err.message) || err) } });
    }

    function isFileUrl(url) {
      return /^(blob|data):/i.test(url);
    }

    function filenameFromResponse(res) {
      var cd = res.headers.get('content-disposition') || '';
      var match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
      if (!match) return null;
      try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
    }

    function sendBlob(blob, filename, intent) {
      var reader = new FileReader();
      reader.onload = function() {
        var result = String(reader.result);
        post({
          action: 'FILE_DOWNLOAD',
          payload: {
            base64: result.slice(result.indexOf(',') + 1),
            mimeType: blob.type || 'application/octet-stream',
            filename: filename || null,
            intent: intent
          }
        });
      };
      reader.onerror = function() { fail(reader.error); };
      reader.readAsDataURL(blob);
    }

    function download(url, filename, intent) {
      intent = intent || 'download';
      fetch(url, { credentials: 'include' })
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          var name = filename || filenameFromResponse(res);
          return res.blob().then(function(blob) { sendBlob(blob, name, intent); });
        })
        .catch(function(err) {
          // Cross-origin files may be blocked by CORS; native has no CORS
          if (/^https?:/i.test(url)) {
            post({ action: 'FILE_FETCH_NATIVE', payload: { url: url, filename: filename || null, intent: intent } });
          } else {
            fail(err);
          }
        });
    }
    window.__omnifyDownload = download;

    function openTarget(url) {
      if (!url) return;
      var abs;
      try { abs = new URL(String(url), document.baseURI).href; } catch (e) { abs = String(url); }
      if (abs.indexOf('about:') === 0) return;
      if (isFileUrl(abs)) download(abs, null, 'view');
      else post({ action: 'OPEN_WINDOW', payload: { url: abs } });
    }

    // Stand-in for the window returned by window.open() — pages often open an
    // empty tab first, then point it at the file once it is ready.
    function deferredWindow() {
      var done = false;
      var html = '';

      function go(url) {
        if (done || !url) return;
        done = true;
        openTarget(url);
      }

      function srcOf(el) {
        return el && (el.src || el.data || el.href);
      }

      function flushHtml() {
        if (done || !html) return;
        var match = /<(?:iframe|embed)[^>]*\ssrc=["']([^"']+)["']/i.exec(html) ||
          /<object[^>]*\sdata=["']([^"']+)["']/i.exec(html);
        if (match) {
          go(match[1]);
        } else {
          done = true;
          sendBlob(new Blob([html], { type: 'text/html' }), null, 'view');
        }
      }

      var loc = {
        assign: go,
        replace: go,
        reload: function() {},
        toString: function() { return 'about:blank'; }
      };
      Object.defineProperty(loc, 'href', { get: function() { return 'about:blank'; }, set: go });

      var body = {
        appendChild: function(el) { go(srcOf(el)); return el; },
        append: function(el) { go(srcOf(el)); },
        style: {}
      };
      Object.defineProperty(body, 'innerHTML', {
        get: function() { return html; },
        set: function(value) { html = String(value); setTimeout(flushHtml, 0); }
      });

      var doc = {
        title: '',
        body: body,
        open: function() {},
        write: function() {
          html += Array.prototype.join.call(arguments, '');
          setTimeout(flushHtml, 0);
        },
        writeln: function() {
          html += Array.prototype.join.call(arguments, '') + '\n';
          setTimeout(flushHtml, 0);
        },
        close: flushHtml,
        createElement: function(tag) { return document.createElement(tag); }
      };

      var win = {
        closed: false,
        opener: window,
        document: doc,
        focus: function() {},
        blur: function() {},
        print: function() {},
        postMessage: function() {},
        addEventListener: function() {},
        removeEventListener: function() {},
        close: function() { win.closed = true; done = true; }
      };
      Object.defineProperty(win, 'location', { get: function() { return loc; }, set: go });
      win.__go = go;
      return win;
    }

    var originalOpen = window.open;
    window.open = function(url) {
      var target = url == null ? '' : String(url);
      if (!target || target === 'about:blank') return deferredWindow();
      if (isFileUrl(target)) {
        var win = deferredWindow();
        win.__go(target);
        return win;
      }
      return originalOpen.apply(window, arguments);
    };

    function handleAnchor(a) {
      var href = a.href;
      if (!href) return false;
      var name = a.getAttribute('download') || null;
      if (a.hasAttribute('download')) {
        download(href, name, 'download');
        return true;
      }
      if (isFileUrl(href)) {
        download(href, null, 'view');
        return true;
      }
      return false;
    }

    // Programmatic downloads: createElement('a') + .click(), often detached
    // from the DOM so the click never reaches a document listener
    var originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (handleAnchor(this)) return;
      return originalClick.apply(this, arguments);
    };

    document.addEventListener('click', function(e) {
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (a && handleAnchor(a)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  })();
  true;
`;


export type FileIntent = "view" | "download";

export interface DownloadedFile {
  uri: string;
  name: string;
  mimeType: string;
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "text/html": "html",
  "text/csv": "csv",
  "text/plain": "txt",
  "image/png": "png",
  "image/jpeg": "jpg",
};

// iOS share sheet uses UTIs to pick a preview (Quick Look for PDFs)
const UTIS: Record<string, string> = {
  "application/pdf": "com.adobe.pdf",
  "text/html": "public.html",
  "image/png": "public.png",
  "image/jpeg": "public.jpeg",
};

const buildFilename = (filename: string | null, mimeType: string) => {
  const clean = (filename || `download-${Date.now()}`)
    .replace(/[\/:*?"<>|]+/g, "_")
    .trim();
  const ext = EXTENSIONS[mimeType];
  return ext && !/\.[a-z0-9]{2,5}$/i.test(clean) ? `${clean}.${ext}` : clean;
};

// Only the latest file is kept in the cache; older ones are cleared
const freshDownloadDir = () => {
  const dir = new Directory(Paths.cache, "downloads");
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  return dir;
};

// File posted from the page as base64 (blob:, data:, same-origin fetch)
export function writeBase64File(
  base64: string,
  mimeType: string,
  filename: string | null,
): DownloadedFile {
  const name = buildFilename(filename, mimeType);
  const file = new File(freshDownloadDir(), name);
  file.create();
  file.write(base64, { encoding: "base64" });
  return { uri: file.uri, name, mimeType };
}

// File the page couldn't fetch itself (CORS); native requests have no CORS
export async function downloadUrlToFile(
  url: string,
  filename: string | null,
): Promise<DownloadedFile> {
  const dir = freshDownloadDir();
  const downloaded = await File.downloadFileAsync(url, dir);
  const mimeType = (downloaded.type || "application/octet-stream").split(";")[0].trim();
  let downloadedName = Paths.basename(downloaded.uri);
  try {
    downloadedName = decodeURIComponent(downloadedName);
  } catch {}
  const name = buildFilename(filename || downloadedName, mimeType);
  const target = new File(dir, name);
  if (target.uri !== downloaded.uri) downloaded.move(target);
  return { uri: target.uri, name, mimeType };
}

export async function shareFile({ uri, name, mimeType }: DownloadedFile) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device");
  }
  await Sharing.shareAsync(uri, {
    mimeType,
    UTI: UTIS[mimeType],
    dialogTitle: name,
  });
}

// Android 10+: straight into the public Downloads folder, like a browser.
// iOS (and older Android): share sheet, which offers "Save to Files".
export async function saveFile(file: DownloadedFile) {
  if (Platform.OS === "android" && DownloadsSaver?.isSupported) {
    const savedName = await DownloadsSaver.saveToDownloads(
      file.uri,
      file.name,
      file.mimeType,
    );
    ToastAndroid.show(`Saved to Downloads: ${savedName}`, ToastAndroid.LONG);
    return;
  }
  await shareFile(file);
}
