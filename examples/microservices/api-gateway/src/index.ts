import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ServiceRegistry } from '../service-discovery/src';
import { AuthMiddleware } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3000;

const serviceRegistry = new ServiceRegistry();
const authMiddleware = new AuthMiddleware();

app.use(helmet());
app.use(cors());
app.use(express.json());

interface RouteConfig {
  path: string;
  service: string;
  auth?: boolean;
}

const routes: RouteConfig[] = [
  { path: '/api/auth/*', service: 'auth-service', auth: false },
  { path: '/api/users/*', service: 'user-service', auth: true },
  { path: '/api/orders/*', service: 'order-service', auth: true },
  { path: '/api/payments/*', service: 'payment-service', auth: true },
  { path: '/api/inventory/*', service: 'inventory-service', auth: true },
  { path: '/api/notifications/*', service: 'notification-service', auth: true },
];

app.use(async (req: Request, res: Response, next: NextFunction) => {
  const route = routes.find(r => req.path.startsWith(r.path));
  if (!route) {
    return res.status(404).json({ error: 'Route not found' });
  }

  if (route.auth && !authMiddleware.verify(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const serviceUrl = await serviceRegistry.getService(route.service);
  if (!serviceUrl) {
    return res.status(503).json({ error: 'Service unavailable' });
  }

  next();
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});

export default app;
