import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3004;

app.use(express.json());

app.post('/payments', async (req: Request, res: Response) => {
  const { orderId, amount, method } = req.body;
  const payment = await prisma.payment.create({
    data: { orderId, amount, method, status: 'PENDING' },
  });
  res.json(payment);
});

app.get('/payments/:id', async (req: Request, res: Response) => {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
  res.json(payment);
});

app.post('/payments/:id/process', async (req: Request, res: Response) => {
  const payment = await prisma.payment.update({
    where: { id: req.params.id },
    data: { status: 'COMPLETED' },
  });
  res.json(payment);
});

app.get('/health', (req: Request, res: Response) => res.json({ status: 'healthy' }));

app.listen(PORT, () => console.log(`Payment Service on port ${PORT}`));
export default app;
