package expo.modules.downloadssaver

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.annotation.RequiresApi
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException

// Saves a local file into the public Downloads folder, like a browser download.
// MediaStore.Downloads needs no storage permission (READ/WRITE_EXTERNAL_STORAGE
// are blocked in app.config.ts), but it only exists on Android 10+.
class DownloadsSaverModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DownloadsSaver")

    Constants("isSupported" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q))

    AsyncFunction("saveToDownloads") { sourceUri: String, fileName: String, mimeType: String ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        throw UnsupportedOperationException("Saving to Downloads requires Android 10+")
      }
      saveToDownloads(sourceUri, fileName, mimeType)
    }
  }

  // Returns the display name actually used (MediaStore renames duplicates, e.g. "x (1).pdf")
  @RequiresApi(Build.VERSION_CODES.Q)
  private fun saveToDownloads(sourceUri: String, fileName: String, mimeType: String): String {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val resolver = context.contentResolver

    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
      put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val item = resolver.insert(collection, values) ?: throw IOException("Could not create download entry")

    try {
      val input = resolver.openInputStream(Uri.parse(sourceUri)) ?: throw IOException("Could not read $sourceUri")
      input.use { src ->
        val output = resolver.openOutputStream(item) ?: throw IOException("Could not write download")
        output.use { dst -> src.copyTo(dst) }
      }
      values.clear()
      values.put(MediaStore.MediaColumns.IS_PENDING, 0)
      resolver.update(item, values, null, null)
    } catch (e: Exception) {
      resolver.delete(item, null, null)
      throw e
    }

    resolver.query(item, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) return cursor.getString(0)
    }
    return fileName
  }
}
