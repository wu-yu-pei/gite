import express from 'express';
import requestLogger from './middlewares/requestLogger.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';

const app = express();

app.use(express.json());
app.use(requestLogger);

app.use(healthRouter);
app.use(authRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
