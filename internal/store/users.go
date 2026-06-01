package store

import (
	"database/sql"
	"errors"
	"sort"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/google/uuid"
)

type User struct {
	ID           string `json:"id"`
	Username     string `json:"username"`
	PasswordHash string `json:"-"`
}

// inserts a new account. UNIQUE(username) makes duplicate inserts fail at the DB.
func (s *Store) CreateUser(u User) error {
	_, err := s.db.Exec(
		"INSERT INTO users (id, username, password_hash) VALUES (UUID_TO_BIN(?), ?, ?)",
		u.ID, u.Username, u.PasswordHash,
	)
	return err
}

// reports whether err is a MySQL duplicate-key error (code 1062).
// Lets the handler turn it into a 409 instead of a generic 500.
func IsDuplicateUsername(err error) bool {
	var me *mysql.MySQLError
	return errors.As(err, &me) && me.Number == 1062
}

// returns the user with the given username, or (nil, nil) if not found.
func (s *Store) GetUserByUsername(username string) (*User, error) {
	var u User
	return getOne(&u, func() error {
		return s.db.QueryRow(
			"SELECT BIN_TO_UUID(id), username, password_hash FROM users WHERE username = ?",
			username,
		).Scan(&u.ID, &u.Username, &u.PasswordHash)
	})
}

// is the symmetric lookup used by /auth/me.
func (s *Store) GetUserByID(id string) (*User, error) {
	var u User
	return getOne(&u, func() error {
		return s.db.QueryRow(
			"SELECT BIN_TO_UUID(id), username, password_hash FROM users WHERE id = UUID_TO_BIN(?)",
			id,
		).Scan(&u.ID, &u.Username, &u.PasswordHash)
	})
}

// removes the user row. Callers must delete the user's jobs first: jobs.user_id
// references users(id) with no ON DELETE CASCADE, so a lingering job blocks this.
func (s *Store) DeleteUser(id string) error {
	if _, err := uuid.Parse(id); err != nil {
		return nil
	}
	_, err := s.db.Exec("DELETE FROM users WHERE id = UUID_TO_BIN(?)", id)
	return err
}

// returns every job id owned by userID, so account deletion can tear each one
// down individually (cache purge + row delete) before removing the user.
func (s *Store) ListUserJobIDs(userID string) ([]string, error) {
	return queryRows(s.db,
		"SELECT BIN_TO_UUID(id) FROM jobs WHERE user_id = UUID_TO_BIN(?)",
		func(rows *sql.Rows) (string, error) {
			var id string
			err := rows.Scan(&id)
			return id, err
		}, userID)
}

type HistoryRun struct {
	JobID     string    `json:"job_id"`
	CreatedAt time.Time `json:"created_at"`
	Status    string    `json:"status"`
}

type HistoryEntry struct {
	URL         string       `json:"url"`
	CrawlCount  int          `json:"crawl_count"`
	LastJobID   string       `json:"last_job_id"`
	LastCrawled time.Time    `json:"last_crawled"`
	Runs        []HistoryRun `json:"runs"`
}

// returns one row per site the user has crawled (most recent first), each
// with its individual runs, so the frontend can render an expandable list per domain.
// Rows are grouped in Go from a single (url, created_at DESC) query.
func (s *Store) ListUserHistory(userID string) ([]HistoryEntry, error) {
	rows, err := s.db.Query(`
		SELECT BIN_TO_UUID(id), url, status, created_at
		FROM jobs
		WHERE user_id = UUID_TO_BIN(?)
		ORDER BY url, created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byURL := map[string]*HistoryEntry{}
	for rows.Next() {
		var jobID, url, status string
		var createdAt time.Time
		if err := rows.Scan(&jobID, &url, &status, &createdAt); err != nil {
			return nil, err
		}
		e, ok := byURL[url]
		if !ok {
			// first row for this URL is the newest (rows are ordered DESC within each url)
			e = &HistoryEntry{URL: url, LastJobID: jobID, LastCrawled: createdAt}
			byURL[url] = e
		}
		e.CrawlCount++
		e.Runs = append(e.Runs, HistoryRun{JobID: jobID, CreatedAt: createdAt, Status: status})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]HistoryEntry, 0, len(byURL))
	for _, e := range byURL {
		out = append(out, *e)
	}
	// final order: most recently active domain first
	sort.Slice(out, func(i, j int) bool { return out[i].LastCrawled.After(out[j].LastCrawled) })
	return out, nil
}
