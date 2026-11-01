package com.kuhy.dufs_client

import android.content.ContentResolver
import android.net.Uri
import java.io.InputStream

// Open document streams handed to Dart as integer handles, so a large upload
// is pulled chunk by chunk (openRead/readChunk/closeRead) instead of being
// copied whole. Calls come from the io thread; [readers] is guarded by its
// own monitor.
class ChunkReaders(private val contentResolver: ContentResolver) {
    private val readers = HashMap<Int, InputStream>()
    private var nextReader = 1

    fun openRead(uri: Uri): Int {
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
    fun readChunk(handle: Int, size: Int): ByteArray {
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

    fun closeRead(handle: Int): Boolean {
        val stream = synchronized(readers) { readers.remove(handle) } ?: return false
        stream.close()
        return true
    }
}
