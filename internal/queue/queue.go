// Package queue owns the RabbitMQ topology and typed publish/consume helpers: a work queue
// with a dead-letter exchange, plus a results fanout bound to per-consumer queues (report,
// archive, aggregate). The topology declaration lives in utils.go.
package queue

import (
	"context"
	"encoding/json"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	WorkQueue  = "pages"
	DeadFanout = "pages_dlx"
	DeadQueue  = "pages_dead"
	ResultsEx  = "page_checked"
	QReport    = "q.report"
	QArchive   = "q.archive"
	QAggregate = "q.aggregate"
)

// publishTimeout bounds each publish's broker round-trip.
const publishTimeout = 5 * time.Second

type PageJob struct {
	JobID      string `json:"job_id"`
	URL        string `json:"url"`
	Depth      int    `json:"depth"`
	RetryCount int    `json:"retry_count"`
}

// JSON-encoded result + SEO fields avoid importing store/seo here (would cycle)
type PageChecked struct {
	JobID   string          `json:"job_id"`
	URL     string          `json:"url"`
	Depth   int             `json:"depth"`
	IsAlive bool            `json:"is_alive"`
	Result  json.RawMessage `json:"result"`
	SEO     json.RawMessage `json:"seo"`
	Links   []string        `json:"links,omitempty"` // outbound internal links discovered on this page
}

type Queue struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

// dials RabbitMQ, opens a channel, and declares the topology.
func New(url string) (*Queue, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, err
	}
	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, err
	}
	q := &Queue{conn: conn, ch: ch}
	if err := q.declareTopology(); err != nil {
		conn.Close()
		return nil, err
	}
	return q, nil
}

// closes the connection (and its channels).
func (q *Queue) Close() error {
	return q.conn.Close()
}

// jSON-marshals v and sends it to exchange/key as a persistent message.
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

// enqueues a page to crawl onto the work queue.
// Default exchange ("") + routing key = queue name routes straight to that queue.
func (q *Queue) PublishPageJob(job PageJob) error {
	return q.publish("", WorkQueue, job)
}

// fans a checked-page result out to all result consumers (fanout ignores the key).
func (q *Queue) PublishResult(r PageChecked) error {
	return q.publish(ResultsEx, "", r)
}

// opens its own channel (per concurrency rule) with prefetch set for backpressure.
// Manual ack throughout: caller acks via d.Ack(false) / d.Nack(false, requeue).
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
	return deliveries, ch, nil
}
