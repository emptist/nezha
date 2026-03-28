import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { MessageQueue } from '../infrastructure/rabbitmq';

const app = express();
const prisma = new PrismaClient();
const mq = new MessageQueue();
const PORT = process.env.PORT || 3006;

app.use(express.json());

app.post('/notifications', async (req: Request, res: Response) => {
  const { userId, type, message } = req.body;
  const notification = await prisma.notification.create({
    data: { userId, type, message, read: false },
  });
  res.json(notification);
});

app.get('/notifications/:userId', async (req: Request, res: Response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.params.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(notifications);
});

app.patch('/notifications/:id/read', async (req: Request, res: Response) => {
  const notification = await prisma.notification.update({
    where: { id: req.params.id },
    data: { read: true },
  });
  res.json(notification);
});

mq.subscribe('order.created', async data => {
  console.log('Notification: New order', data);
});

app.get('/health', (req: Request, res: Response) => res.json({ status: 'healthy' }));

app.listen(PORT, () => console.log(`Notification Service on port ${PORT}`));
export default app;
