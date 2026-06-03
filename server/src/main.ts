import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 动态 CORS：允许 localhost 开发服务器 + Chrome 扩展来源
  app.enableCors({
    origin: (origin, callback) => {
      // 无 origin 的请求（如 Postman、curl、service worker fetch）允许通过
      if (!origin) return callback(null, true);

      // localhost 开发服务器
      if (origin.startsWith('http://localhost:')) return callback(null, true);
      if (origin.startsWith('http://127.0.0.1:')) return callback(null, true);

      // Chrome 扩展
      if (origin.startsWith('chrome-extension://')) return callback(null, true);

      callback(null, true); // 生产环境按需收紧
    },
    credentials: true,
  });

  // Body size 上限 5MB，适配极端 localStorage payload
  app.use(json({ limit: '5mb' }));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
