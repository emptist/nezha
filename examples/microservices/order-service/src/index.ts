import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { MessageQueue } from '../infrastructure/rabbitmq';

const app = express();
const prisma = new PrismaClient();
const mq = new MessageQueue();
const PORT = process.env.PORT || 3003;

app.use(express.json());

app.post('/orders', async (req: Request, res: Response) => {
  const { userId, items, total } = req.body;

  const order = await prisma.order.create({
    data: { userId, total, status: 'PENDING', items: JSON.stringify(items) },
  });

  await mq.publish('order.created', order);
  res.json(order);
});

app.get('/orders/:id', async (req: Request, res: Response) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.get('/orders/user/:userId', async (req: Request, res: Response) => {
  const orders = await prisma.order.findMany({ where: { userId: req.params.userId } });
  res.json(orders);
});

app.patch('/orders/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body;
  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: { status },
  });
  await mq.publish('order.status.changed', order);
  res.json(order);
});

app.get('/health', (req: Request, res: Response) => res.json({ status: 'healthy' }));

app.listen(PORT, () => console.log(`Order Service on port ${PORT}`));
export default app;
