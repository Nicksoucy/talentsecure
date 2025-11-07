import morgan from 'morgan';
import { stream } from '../config/logger';

// Define custom morgan format
const format = process.env.NODE_ENV === 'production'
  ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms'
  : ':method :url :status :response-time ms - :res[content-length]';

// Create morgan middleware
export const httpLogger = morgan(format, { stream });

// Skip logging for health checks in production
export const httpLoggerWithSkip = morgan(format, {
  stream,
  skip: (req, res) => {
    // Skip health check endpoints in production
    if (process.env.NODE_ENV === 'production' && req.url === '/health') {
      return true;
    }
    return false;
  },
});
