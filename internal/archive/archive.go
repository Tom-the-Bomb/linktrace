// Package archive queries the Wayback Machine for the closest snapshot of a (usually rotten) URL.
package archive

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"github.com/Tom-the-Bomb/linktrace/internal/httpx"
)

const (
	fetchTimeout = 10 * time.Second
	maxBodyBytes = 1 << 20
)

// queries the Wayback "available" API for the closest snapshot of rawURL.
// Returns the snapshot URL, or "" if none exists.
func Available(rawURL string) (string, error) {
	api := "https://archive.org/wayback/available?url=" + url.QueryEscape(rawURL)

	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()

	body, _, err := httpx.Fetch(ctx, http.DefaultClient, api, maxBodyBytes)
	if err != nil {
		return "", err
	}

	var out struct {
		ArchivedSnapshots struct {
			Closest struct {
				Available bool   `json:"available"`
				URL       string `json:"url"`
			} `json:"closest"`
		} `json:"archived_snapshots"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", err
	}
	if out.ArchivedSnapshots.Closest.Available {
		return out.ArchivedSnapshots.Closest.URL, nil
	}
	return "", nil
}
