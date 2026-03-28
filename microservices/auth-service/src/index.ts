import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '../../api-gateway/src/middleware/jwt';

const app = express();
const prisma = new PrismaClient();
const jwtService = new JwtService();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.post('/register', async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  const hashedPassword = await Bun.password.hash(password);

  const user = await prisma.user.create({
    data: { email, password: hashedPassword, name },
  });

  const token = jwtService.sign({ userId: user.id, roles: ['user'] });
  res.json({ user: { id: user.id, email: user.email, name: user.name }, token });
});

app.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await Bun.password.verify(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwtService.sign({ userId: user.id, roles: ['user'] });
  res.json({ user: { id: user.id, email: user.email, name: user.name }, token });
});

app.post('/refresh', async (req: Request, res: Response) => {
  const token = jwtService.refresh(req.headers.authorization?.substring(7) || '');
  if (!token) return res.status(401).json({ error: 'Invalid token' });
  res.json({ token });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`);
});

export default app;
