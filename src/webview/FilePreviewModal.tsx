import { Ionicons } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { DownloadedFile } from "./fileDownloads";

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

// Android's WebView can't display PDFs, so render them with pdf.js instead
const buildPdfViewerHtml = (base64: string) => `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
  <style>
    body { margin: 0; background: #525659; }
    canvas { display: block; margin: 8px auto; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
    #msg { color: #fff; font: 14px sans-serif; text-align: center; padding: 32px 16px; }
  </style>
  <script src="${PDFJS_CDN}/pdf.min.js"></script>
</head>
<body>
  <div id="msg">Loading…</div>
  <script>
    (function() {
      var msg = document.getElementById('msg');
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS_CDN}/pdf.worker.min.js';
        var raw = atob('${base64}');
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        pdfjsLib.getDocument({ data: bytes }).promise.then(function(pdf) {
          msg.remove();
          var width = window.innerWidth - 16;
          var ratio = window.devicePixelRatio || 1;
          var chain = Promise.resolve();
          for (var n = 1; n <= pdf.numPages; n++) {
            (function(n) {
              chain = chain.then(function() { return pdf.getPage(n); }).then(function(page) {
                var base = page.getViewport({ scale: 1 });
                var viewport = page.getViewport({ scale: (width / base.width) * ratio });
                var canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.style.width = width + 'px';
                canvas.style.height = (viewport.height / ratio) + 'px';
                document.body.appendChild(canvas);
                return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
              });
            })(n);
          }
        }).catch(function() { msg.textContent = 'Could not display this file.'; });
      } catch (e) {
        msg.textContent = 'Could not display this file.';
      }
    })();
  </script>
</body>
</html>`;

interface FilePreviewModalProps {
  file: DownloadedFile | null;
  isDark: boolean;
  onClose: () => void;
  onDownload: (file: DownloadedFile) => void;
}

export default function FilePreviewModal({
  file,
  isDark,
  onClose,
  onDownload,
}: FilePreviewModalProps) {
  const [pdfHtml, setPdfHtml] = useState<string | null>(null);
  const usePdfJs =
    Platform.OS === "android" && file?.mimeType === "application/pdf";

  useEffect(() => {
    setPdfHtml(null);
    if (!file || !usePdfJs) return;
    new File(file.uri)
      .base64()
      .then((b64) => setPdfHtml(buildPdfViewerHtml(b64)))
      .catch((e) => console.warn("[Native] Failed to read file for preview", e));
  }, [file, usePdfJs]);

  const fg = isDark ? "#fff" : "#111";
  const bg = isDark ? "#1a1a1a" : "#fff";

  return (
    <Modal
      visible={!!file}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <SafeAreaProvider>
        <SafeAreaView
          edges={["top", "bottom", "left", "right"]}
          style={[styles.container, { backgroundColor: bg }]}
        >
          <View
            style={[
              styles.header,
              { borderBottomColor: isDark ? "#333" : "#e5e5e5" },
            ]}
          >
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close preview"
            >
              <Ionicons name="close" size={26} color={fg} />
            </TouchableOpacity>
            <Text numberOfLines={1} style={[styles.title, { color: fg }]}>
              {file?.name}
            </Text>
            <TouchableOpacity
              onPress={() => file && onDownload(file)}
              hitSlop={12}
              accessibilityLabel="Download file"
            >
              <Ionicons name="download-outline" size={24} color={fg} />
            </TouchableOpacity>
          </View>

          {file &&
            (usePdfJs ? (
              pdfHtml ? (
                <WebView
                  // Same origin as the CDN so pdf.js can start its web worker
                  source={{ html: pdfHtml, baseUrl: `${PDFJS_CDN}/` }}
                  originWhitelist={["*"]}
                  style={styles.container}
                />
              ) : (
                <ActivityIndicator style={styles.container} color={fg} />
              )
            ) : (
              <WebView
                source={{ uri: file.uri }}
                originWhitelist={["*"]}
                allowFileAccess
                allowingReadAccessToURL={file.uri.replace(/[^/]+$/, "")}
                style={styles.container}
              />
            ))}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
