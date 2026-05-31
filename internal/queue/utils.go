package queue

import amqp "github.com/rabbitmq/amqp091-go"

// declareTopology declares the exchanges, queues, and bindings. Idempotent, safe to run on
// every startup.
func (q *Queue) declareTopology() error {
	// dead-letter side
	if err := q.ch.ExchangeDeclare(DeadFanout, "fanout", true, false, false, false, nil); err != nil {
		return err
	}
	if _, err := q.ch.QueueDeclare(DeadQueue, true, false, false, false, nil); err != nil {
		return err
	}
	if err := q.ch.QueueBind(DeadQueue, "", DeadFanout, false, nil); err != nil {
		return err
	}

	// work queue -> dead-letters into DeadFanout on nack(requeue=false)
	workArgs := amqp.Table{"x-dead-letter-exchange": DeadFanout}
	if _, err := q.ch.QueueDeclare(WorkQueue, true, false, false, false, workArgs); err != nil {
		return err
	}

	// results fanout + bound consumer queues
	if err := q.ch.ExchangeDeclare(ResultsEx, "fanout", true, false, false, false, nil); err != nil {
		return err
	}
	for _, name := range []string{QReport, QArchive, QAggregate} {
		if _, err := q.ch.QueueDeclare(name, true, false, false, false, nil); err != nil {
			return err
		}
		if err := q.ch.QueueBind(name, "", ResultsEx, false, nil); err != nil {
			return err
		}
	}
	return nil
}
