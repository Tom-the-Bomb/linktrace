package store

import (
	"database/sql"
	"encoding/json"
	"strings"
)

func queryRows[T any](db *sql.DB, q string, scan func(*sql.Rows) (T, error), args ...any) ([]T, error) {
	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []T
	for rows.Next() {
		v, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// maps sql.ErrNoRows to (nil, nil).
func getOne[T any](dest *T, scan func() error) (*T, error) {
	switch err := scan(); err {
	case nil:
		return dest, nil
	case sql.ErrNoRows:
		return nil, nil
	default:
		return nil, err
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func clip(s string, n int) string {
	// MySQL rejects invalid UTF-8, and pages in legacy charsets carry it
	s = strings.ToValidUTF8(s, "\uFFFD")
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
