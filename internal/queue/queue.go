package queue

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/Tom-the-Bomb/linktrace/internal/store"
)

const (
	WorkQueuePrefix = "pages"
	DeadFanout      = "pages_dlx"
	DeadQueue       = "pages_dead"
	ResultsEx       = "page_checked"
	QReport         = "q.report"
	QArchive        = "q.archive"
	QAggregate      = "q.aggregate"
)

func ShardQueue(i int) string { return WorkQueuePrefix + "." + strconv.Itoa(i) }

const publishTimeout = 5 * time.Second

type PageJob struct {
	JobID      string `json:"job_id"`
	URL        string `json:"url"`
	Depth      int    `json:"depth"`
	RetryCount int    `json:"retry_count"`
	Shard      int    `json:"shard"`
	// crawl-wide settings ride every message so workers needn't re-read them per page
	CrawlDelay int    `json:"crawl_delay,omitempty"` // seconds
	MaxPages   int    `json:"max_pages,omitempty"`
	Site       string `json:"site,omitempty"` // crawler.SiteKey of the seed
}

type PageChecked struct {
	JobID   string           `json:"job_id"`
	URL     string           `json:"url"`
	IsAlive bool             `json:"is_alive"`
	Result  store.PageResult `json:"result"`
	SEO     *store.SEOAudit  `json:"seo"` // nil unless the page is healthy HTML
	Links   []string         `json:"links,omitempty"`
}

type Queue struct {
	conn   *amqp.Connection
	ch     *amqp.Channel
	shards int
}

func New(url string, shards int) (*Queue, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, err
	}
	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, err
	}
	q := &Queue{conn: conn, ch: ch, shards: shards}
	if err := q.declareTopology(); err != nil {
		conn.Close()
		return nil, err
	}
	go exitOnClose(conn.NotifyClose(make(chan *amqp.Error, 1)))
	go exitOnClose(ch.NotifyClose(make(chan *amqp.Error, 1)))
	return q, nil
}

// amqp091 doesn't reconnect, so a lost connection or channel exits and Docker restarts the process
func exitOnClose(closed chan *amqp.Error) {
	if err := <-closed; err != nil {
		log.Fatalf("[queue] %v", err)
	}
}

func (q *Queue) Close() error {
	return q.conn.Close()
}

func (q *Queue) publish(exchange, key string, v any) error {
	body, err := json.Marshal(v)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), publishTimeout)
	defer cancel()

	return q.ch.PublishWithContext(ctx,
		exchange, key, false, false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         body,
		},
	)
}

// uses the default exchange, which routes by queue name.
func (q *Queue) PublishPageJob(job PageJob) error {
	shard := job.Shard
	if shard < 0 || shard >= q.shards {
		shard = 0
	}
	return q.publish("", ShardQueue(shard), job)
}

func (q *Queue) PublishResult(r PageChecked) error {
	return q.publish(ResultsEx, "", r)
}

// uses manual ack: the caller must Ack or Nack every delivery.
func (q *Queue) Consume(queueName string, prefetch int) (<-chan amqp.Delivery, *amqp.Channel, error) {
	ch, err := q.conn.Channel()
	if err != nil {
		return nil, nil, err
	}
	if err := ch.Qos(prefetch, 0, false); err != nil {
		ch.Close()
		return nil, nil, err
	}
	deliveries, err := ch.Consume(
		queueName,
		"",    // consumer tag (auto)
		false, // autoAck
		false, // exclusive
		false, // noLocal
		false, // noWait
		nil,
	)
	if err != nil {
		ch.Close()
		return nil, nil, err
	}
	go exitOnClose(ch.NotifyClose(make(chan *amqp.Error, 1)))
	return deliveries, ch, nil
}
