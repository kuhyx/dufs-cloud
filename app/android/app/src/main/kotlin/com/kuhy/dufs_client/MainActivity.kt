package com.kuhy.dufs_client

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.InputStream
import java.util.concurrent.Executors

// Platform side of `com.kuhy.dufs_client/downloads` (Dart: services/
// public_downloads.dart and services/device_picker.dart). Two jobs:
//
//  * Downloads: move a finished file into the public Download/ collection
//    through MediaStore and open it with ACTION_VIEW.
//  * Uploads: a Storage Access Framework picker that hands back content URIs,
//    which Dart then reads chunk by chunk through openRead/readChunk/closeRead.
//    Pull-based reads give natural backpressure and avoid the whole-file copy
//    into cache that file_picker does before it returns (a 1 GB video meant
//    40 s of nothing on screen).
//
// Disk work runs on a single background thread; results hop back to main.
class MainActivity : FlutterActivity() {
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val readers = HashMap<Int, InputStream>()
    private var nextReader = 1
    private var pendingPick: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "saveToDownloads" -> {
                        val tempPath = call.argument<String>("tempPath")
                        val name = call.argument<String>("name")
                        if (tempPath == null || name == null) {
                            result.error("args", "tempPath and name are required", null)
                        } else {
                            background(result) { saveToDownloads(File(tempPath), name) }
                        }
                    }
                    "openUri" -> {
                        val uri = call.argument<String>("uri")
                        val mime = call.argument<String>("mime")
                        if (uri == null || mime == null) {
                            result.error("args", "uri and mime are required", null)
                        } else {
                            result.success(openUri(Uri.parse(uri), mime))
                        }
                    }
                    "pickFiles" -> pickFiles(result)
                    "openRead" -> {
                        val uri = call.argument<String>("uri")
                        if (uri == null) {
                            result.error("args", "uri is required", null)
                        } else {
                            background(result) { openRead(Uri.parse(uri)) }
                        }
                    }
                    "readChunk" -> {
                        val handle = call.argument<Int>("handle")
                        val size = call.argument<Int>("size")
                        if (handle == null || size == null) {
                            result.error("args", "handle and size are required", null)
                        } else {
                            background(result) { readChunk(handle, size) }
                        }
                    }
                    "closeRead" -> {
                        val handle = call.argument<Int>("handle")
                        if (handle == null) {
                            result.error("args", "handle is required", null)
                        } else {
                            background(result) { closeRead(handle) }
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    // Runs [work] on the io thread and delivers its value (or error) to
    // [result] on the main thread, as the channel requires.
    private fun background(result: MethodChannel.Result, work: () -> Any?) {
        io.execute {
            try {
                val value = work()
                main.post { result.success(value) }
            } catch (e: Exception) {
                main.post { result.error("io", e.toString(), null) }
            }
        }
    }

    // ---- Downloads -------------------------------------------------------

    // Copies [temp] into the public Download/ collection through MediaStore
    // (no storage permission needed from API 29) and deletes the temp file.
    // MediaStore renames on collision ("x (1).bin"), so the display name and
    // relative path are read back from the inserted row rather than assumed.
    private fun saveToDownloads(temp: File, name: String): Map<String, String> {
        val mime = mimeOf(name)
        val resolver = contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, mime)
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("MediaStore insert returned null")
        try {
            resolver.openOutputStream(uri)!!.use { out ->
                temp.inputStream().use { it.copyTo(out) }
            }
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        } finally {
            temp.delete()
        }
        resolver.update(
            uri,
            ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) },
            null,
            null,
        )
        var savedName = name
        var relativePath = Environment.DIRECTORY_DOWNLOADS + "/"
        val projection = arrayOf(
            MediaStore.Downloads.DISPLAY_NAME,
            MediaStore.Downloads.RELATIVE_PATH,
        )
        resolver.query(uri, projection, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                savedName = cursor.getString(0) ?: savedName
                relativePath = cursor.getString(1) ?: relativePath
            }
        }
        return mapOf(
            "uri" to uri.toString(),
            "name" to savedName,
            "relativePath" to relativePath,
            "mime" to mime,
        )
    }

    // ACTION_VIEW on a MediaStore URI. No resolveActivity() pre-check: under
    // Android 11 package visibility it returns null even when a viewer exists,
    // so the only reliable probe is to try and catch.
    private fun openUri(uri: Uri, mime: String): Boolean {
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, mime)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }

    private fun mimeOf(name: String): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
            ?: "application/octet-stream"
    }

    // ---- Uploads ---------------------------------------------------------

    private fun pickFiles(result: MethodChannel.Result) {
        if (pendingPick != null) {
            result.error("busy", "a pick is already open", null)
            return
        }
        pendingPick = result
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*")
            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        startActivityForResult(intent, REQ_PICK)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_PICK) return
        val result = pendingPick ?: return
        pendingPick = null
        val uris = ArrayList<Uri>()
        if (resultCode == Activity.RESULT_OK && data != null) {
            val clip = data.clipData
            if (clip != null) {
                for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)
            } else {
                data.data?.let { uris.add(it) }
            }
        }
        result.success(uris.map { describe(it) })
    }

    // Name and size straight from the document provider; no bytes move.
    private fun describe(uri: Uri): Map<String, Any> {
        var name = uri.lastPathSegment ?: "file"
        var size = 0L
        val projection = arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                cursor.getString(0)?.let { name = it }
                if (!cursor.isNull(1)) size = cursor.getLong(1)
            }
        }
        // Providers may report a stale 0 (MediaStore for a file still being
        // written); the descriptor's stat is what the bytes will actually be.
        if (size <= 0) {
            try {
                contentResolver.openFileDescriptor(uri, "r")?.use { size = it.statSize }
            } catch (e: Exception) {
                size = 0
            }
        }
        return mapOf("uri" to uri.toString(), "name" to name, "size" to size)
    }

    private fun openRead(uri: Uri): Int {
        val stream = contentResolver.openInputStream(uri)
            ?: throw IllegalStateException("cannot open $uri")
        val handle = synchronized(readers) {
            val h = nextReader++
            readers[h] = stream
            h
        }
        return handle
    }

    // Up to [size] bytes; an empty array means end of file.
    private fun readChunk(handle: Int, size: Int): ByteArray {
        val stream = synchronized(readers) { readers[handle] }
            ?: throw IllegalStateException("unknown reader $handle")
        val buffer = ByteArray(size)
        var filled = 0
        while (filled < size) {
            val n = stream.read(buffer, filled, size - filled)
            if (n < 0) break
            filled += n
        }
        return if (filled == size) buffer else buffer.copyOf(filled)
    }

    private fun closeRead(handle: Int): Boolean {
        val stream = synchronized(readers) { readers.remove(handle) } ?: return false
        stream.close()
        return true
    }

    companion object {
        const val CHANNEL = "com.kuhy.dufs_client/downloads"
        const val REQ_PICK = 4101
    }
}
