import { requireOptionalNativeModule } from "expo";

interface DownloadsSaverModule {
  isSupported: boolean;
  saveToDownloads(sourceUri: string, fileName: string, mimeType: string): Promise<string>;
}

// Android only; null on iOS
export default requireOptionalNativeModule<DownloadsSaverModule>("DownloadsSaver");
