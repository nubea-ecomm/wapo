package api

import (
	"bytes"
	"encoding/base64"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"strings"
)

// Raster-only data URLs prevent scripts, remote tracking and server-side URL fetches.
func validProjectLogo(value string) bool {
	if value == "" {
		return true
	}

	if len(value) > 7<<20 {
		return false
	}

	prefix, encoded, ok := strings.Cut(value, ",")
	if !ok || (prefix != "data:image/png;base64" && prefix != "data:image/jpeg;base64") {
		return false
	}

	raw, e := base64.StdEncoding.DecodeString(encoded)
	if e != nil || len(raw) > 5<<20 {
		return false
	}

	config, format, e := image.DecodeConfig(bytes.NewReader(raw))
	if e != nil || config.Width <= 0 || config.Height <= 0 || config.Width > 4096 || config.Height > 4096 || config.Width*config.Height > 16000000 {
		return false
	}

	return (format == "png" && prefix == "data:image/png;base64") || (format == "jpeg" && prefix == "data:image/jpeg;base64")
}
