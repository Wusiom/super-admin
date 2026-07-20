import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CoreModule } from './core/core.module';
import { AuthModule } from './core/auth/auth.module';
import { KnowledgeCaptureModule } from './tools/knowledge-capture/knowledge-capture.module';
import { validateEnvironment } from './config/environment';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    CoreModule,
    AuthModule,
    KnowledgeCaptureModule,
  ],
})
export class AppModule {}
