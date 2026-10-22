package api

import (
	"context"
	"io"
	"os"
	"os/exec"
	"time"
)

var voiceSlots = make(chan struct{}, 2)

func removeVoiceFile(file *os.File) { _ = os.Remove(file.Name()) }

func transcodeVoice(ctx context.Context, source io.Reader) (*os.File, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	select {
	case voiceSlots <- struct{}{}:
		defer func() { <-voiceSlots }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	file, err := os.CreateTemp("", "wapo-voice-*.ogg")
	if err != nil {
		return nil, err
	}

	// Pipe-only inputs prevent a crafted recording from opening network URLs or
	// local paths. Duration, worker count, CPU threads and input bytes are bounded.
	cmd := exec.CommandContext(ctx, "ffmpeg", "-hide_banner", "-loglevel", "error", "-threads", "1", "-filter_threads", "1", "-protocol_whitelist", "pipe", "-i", "pipe:0", "-map", "0:a:0", "-vn", "-t", "120", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1")
	cmd.Stdin = io.LimitReader(source, 16<<20)
	cmd.Stdout = file

	err = cmd.Run()
	if err == nil {
		_, err = file.Seek(0, io.SeekStart)
	}

	if err != nil {
		file.Close()
		removeVoiceFile(file)

		return nil, err
	}

	return file, nil
}
