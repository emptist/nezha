import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3005;

app.use(express.json());

app.get('/inventory', async (req: Request, res: Response) => {
  const items = await prisma.inventory.findMany();
  res.json(items);
});

app.get('/inventory/:productId', async (req: Request, res: Response) => {
  const item = await prisma.inventory.findUnique({ where: { productId: req.params.productId } });
  res.json(item);
});

app.post('/inventory/reserve', async (req: Request, res: Response) => {
  const { productId, quantity } = req.body;
  const item = await prisma.inventory.findUnique({ where: { productId } });
  if (!item || item.quantity < quantity) {
    return res.status(400).json({ error: 'Insufficient inventory' });
  }
  const updated = await prisma.inventory.update({
    where: { productId },
    data: { quantity: item.quantity - quantity },
  });
  res.json(updated);
});

app.post('/inventory/restock', async (req: Request, res: Response) => {
  const { productId, quantity } = req.body;
  const item = await prisma.inventory.findUnique({ where: { productId } });
  if (item) {
    await prisma.inventory.update({
      where: { productId },
      data: { quantity: item.quantity + quantity },
    });
  } else {
    await prisma.inventory.create({ data: { productId, quantity } });
  }
  res.json({ success: true });
});

app.get('/health', (req: Request, res: Response) => res.json({ status: 'healthy' }));

app.listen(PORT, () => console.log(`Inventory Service on port ${PORT}`));
export default app;
