// Package archive queries the Wayback Machine for the closest snapshot of a (usually rotten) URL.
package archive

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"time"
)

// Available queries the Wayback "available" API for the closest snapshot of rawURL.
// Returns the snapshot URL, or "" if none exists.
func Available(rawURL string) (string, error) {
	api := "https://archive.org/wayback/available?url=" + url.QueryEscape(rawURL)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, api, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var out struct {
		ArchivedSnapshots struct {
			Closest struct {
				Available bool   `json:"available"`
				URL       string `json:"url"`
			} `json:"closest"`
		} `json:"archived_snapshots"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.ArchivedSnapshots.Closest.Available {
		return out.ArchivedSnapshots.Closest.URL, nil
	}
	return "", nil
}
