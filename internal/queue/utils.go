package queue

import amqp "github.com/rabbitmq/amqp091-go"

func (q *Queue) declareTopology() error {
	if err := q.ch.ExchangeDeclare(DeadFanout, "fanout", true, false, false, false, nil); err != nil {
		return err
	}
	if _, err := q.ch.QueueDeclare(DeadQueue, true, false, false, false, nil); err != nil {
		return err
	}
	if err := q.ch.QueueBind(DeadQueue, "", DeadFanout, false, nil); err != nil {
		return err
	}

	workArgs := amqp.Table{"x-dead-letter-exchange": DeadFanout}
	for i := range q.shards {
		if _, err := q.ch.QueueDeclare(ShardQueue(i), true, false, false, false, workArgs); err != nil {
			return err
		}
	}

	if err := q.ch.ExchangeDeclare(ResultsEx, "fanout", true, false, false, false, nil); err != nil {
		return err
	}
	for _, name := range []string{QReport, QArchive} {
		if _, err := q.ch.QueueDeclare(name, true, false, false, false, nil); err != nil {
			return err
		}
		if err := q.ch.QueueBind(name, "", ResultsEx, false, nil); err != nil {
			return err
		}
	}
	// older versions also fanned results into this queue; left unconsumed, it would grow forever
	_, err := q.ch.QueueDelete("q.aggregate", false, false, false)
	return err
}
