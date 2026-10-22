package api

import (
	"bytes"
	"context"
	"io"
	"os/exec"
	"testing"
)

func TestVoiceTranscodeProducesMonoOpus(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg required for recording conversion integration test")
	}

	raw, err := exec.Command("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2", "-c:a", "libopus", "-f", "webm", "pipe:1").Output()
	if err != nil {
		t.Fatal(err)
	}

	file, err := transcodeVoice(context.Background(), bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	defer removeVoiceFile(file)
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil || !bytes.HasPrefix(data, []byte("OggS")) || !bytes.Contains(data, []byte("OpusHead")) {
		t.Fatal("recording was not converted to OGG/Opus")
	}

	if _, err = transcodeVoice(context.Background(), bytes.NewReader([]byte("invalid audio"))); err == nil {
		t.Fatal("invalid audio accepted")
	}
}
