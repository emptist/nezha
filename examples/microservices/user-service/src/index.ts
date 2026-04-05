import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3002;

app.use(express.json());

app.get('/users', async (req: Request, res: Response) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

app.get('/users/:id', async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.patch('/users/:id', async (req: Request, res: Response) => {
  const { name, email } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { name, email },
  });
  res.json(user);
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
});

export default app;
