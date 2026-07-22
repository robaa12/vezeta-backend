import 'reflect-metadata';
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { OPENAPI_VERSION, getOpenApiDocument } from './swagger.js';

export async function exportOpenApiToFile(outputPath: string): Promise<void> {
  const logger = new Logger('ExportOpenAPI');

  logger.log('Bootstrapping Nest app to introspect the OpenAPI document…');
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  try {
    const document = getOpenApiDocument(app);
    const stamped = {
      ...document,
      info: {
        ...document.info,
        version: document.info?.version ?? OPENAPI_VERSION,
        'x-generated-at': new Date().toISOString(),
      },
    };
    await writeFile(
      outputPath,
      `${JSON.stringify(stamped, null, 2)}\n`,
      'utf8',
    );

    const pathCount = Object.keys(document.paths ?? {}).length;
    const schemaCount = Object.keys(document.components?.schemas ?? {}).length;
    logger.log(
      `Wrote ${outputPath} — ${pathCount} paths, ${schemaCount} schemas.`,
    );
  } finally {
    await app.close();
  }
}
