//  创建 Fastify 实例 + 插件注册
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import path from 'path';

import routes from './routes/index.js';
import dbPlugin from './plugins/db.js'
import replyPlugin from './plugins/reply.js'
import hashPlugin from './plugins/hash.js'

//  任务流
import { registerTaskScanner } from './jobs/taskScanner.js';
import { dispatchScanner } from './jobs/dispatchScanner.js';

const app = Fastify({ logger: true });

app.register(fastifyMultipart, {
  limits: {
    fileSize: 5 * 1024 * 1024 // 限制 5MB
  }
})

// 注册 CORS 插件
await app.register(cors, {
  origin: true,
  //  允许前端携带 cookie 或认证头（比如 Authorization）
  credentials: true, // 如果需要携带 cookie
});

// 静态资源访问（可选）
app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'uploads'),
  prefix: '/uploads/', // http://localhost:3000/uploads/xxx.png
})

//  注册路由
await app.register(routes);

//  插件注册
await app.register(dbPlugin);
await app.register(replyPlugin);
await app.register(hashPlugin, { saltRounds: 12 });

registerTaskScanner(app);
dispatchScanner(app);

export default app;

