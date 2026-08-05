import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  // 动态 CORS：允许 localhost 开发服务器 + Chrome 扩展来源
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      // 无 origin 的请求（如 Postman、curl、service worker fetch）允许通过
      if (!origin) {
        callback(null, true);
        return;
      }

      // localhost 开发服务器
      if (origin.startsWith('http://localhost:')) {
        callback(null, true);
        return;
      }
      if (origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
        return;
      }

      // Chrome 扩展
      if (origin.startsWith('chrome-extension://')) {
        callback(null, true);
        return;
      }

      callback(null, true); // 生产环境按需收紧
    },
    credentials: true,
  });

  // Body size 上限 5MB，适配极端 localStorage payload
  app.use(json({ limit: '5mb' }));
  // cookie-parser's CommonJS export has no resolved declaration in this package.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
