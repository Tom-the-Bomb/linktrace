package store

import (
	"database/sql"
	"errors"
	"time"

	"github.com/go-sql-driver/mysql"
)

type User struct {
	ID           string `json:"id"`
	Username     string `json:"username"`
	PasswordHash string `json:"-"`
}

func (s *Store) CreateUser(u User) error {
	_, err := s.db.Exec(
		"INSERT INTO users (id, username, password_hash) VALUES (UUID_TO_BIN(?), ?, ?)",
		u.ID, u.Username, u.PasswordHash,
	)
	return err
}

// matches MySQL's duplicate-key error, 1062.
func IsDuplicateUsername(err error) bool {
	var me *mysql.MySQLError
	return errors.As(err, &me) && me.Number == 1062
}

// returns (nil, nil) if not found.
func (s *Store) GetUserByUsername(username string) (*User, error) {
	var u User
	return getOne(&u, func() error {
		return s.db.QueryRow(
			"SELECT BIN_TO_UUID(id), username, password_hash FROM users WHERE username = ?",
			username,
		).Scan(&u.ID, &u.Username, &u.PasswordHash)
	})
}

func (s *Store) GetUserByID(id string) (*User, error) {
	var u User
	return getOne(&u, func() error {
		return s.db.QueryRow(
			"SELECT BIN_TO_UUID(id), username, password_hash FROM users WHERE id = UUID_TO_BIN(?)",
			id,
		).Scan(&u.ID, &u.Username, &u.PasswordHash)
	})
}

// requires the user's jobs deleted first: jobs.user_id FKs users(id) without
// cascade.
func (s *Store) DeleteUser(id string) error {
	_, err := s.db.Exec("DELETE FROM users WHERE id = UUID_TO_BIN(?)", id)
	return err
}

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
	URL  string       `json:"url"`
	Runs []HistoryRun `json:"runs"`
}

// newest-first rows make each url's first row its latest run, so entries come out sorted too.
func (s *Store) ListUserHistory(userID string) ([]HistoryEntry, error) {
	rows, err := s.db.Query(`
		SELECT BIN_TO_UUID(id), url, status, created_at
		FROM jobs
		WHERE user_id = UUID_TO_BIN(?)
		ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []HistoryEntry{}
	index := map[string]int{}
	for rows.Next() {
		var url string
		var run HistoryRun
		if err := rows.Scan(&run.JobID, &url, &run.Status, &run.CreatedAt); err != nil {
			return nil, err
		}
		i, ok := index[url]
		if !ok {
			i = len(out)
			index[url] = i
			out = append(out, HistoryEntry{URL: url})
		}
		out[i].Runs = append(out[i].Runs, run)
	}
	return out, rows.Err()
}
