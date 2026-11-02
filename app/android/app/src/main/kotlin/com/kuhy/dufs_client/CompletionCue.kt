package com.kuhy.dufs_client

import android.content.Context
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager

// The completion cue: the user's default notification tone, played with the
// notification-event usage so silent and do-not-disturb modes mute it.
object CompletionCue {
    private var active: Ringtone? = null

    fun play(context: Context) {
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val tone = RingtoneManager.getRingtone(context, uri) ?: return
        tone.audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        active?.stop()
        active = tone
        tone.play()
    }
}
