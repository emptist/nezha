import amqp, { Connection, Channel } from 'amqplib';

export class MessageQueue {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private url: string;

  constructor() {
    this.url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
  }

  async connect(): Promise<void> {
    this.connection = await amqp.connect(this.url);
    this.channel = await this.connection.createChannel();
  }

  async publish(queue: string, data: unknown): Promise<void> {
    if (!this.channel) await this.connect();
    this.channel!.assertQueue(queue, { durable: true });
    this.channel!.sendToQueue(queue, Buffer.from(JSON.stringify(data)));
  }

  async subscribe(queue: string, handler: (data: unknown) => void): Promise<void> {
    if (!this.channel) await this.connect();
    this.channel!.assertQueue(queue, { durable: true });
    this.channel!.consume(queue, msg => {
      if (msg) {
        handler(JSON.parse(msg.content.toString()));
        this.channel!.ack(msg);
      }
    });
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}
