import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CoreModule } from './core/core.module';
import { AuthModule } from './core/auth/auth.module';
import { KnowledgeCaptureModule } from './tools/knowledge-capture/knowledge-capture.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CoreModule,
    AuthModule,
    KnowledgeCaptureModule,
  ],
})
export class AppModule {}
