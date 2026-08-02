import { BadRequestException } from '@nestjs/common';
import { memoryStorage, type Options } from 'multer';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'doctors');
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const doctorImageMulterOpts: Options = {
  storage: memoryStorage(),
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(
        new BadRequestException(
          'Only JPEG, PNG, GIF, and WebP images are allowed',
        ),
      );
    }
    cb(null, true);
  },
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
};

export function filePathToUrl(filePath: string): string {
  return `/uploads/doctors/${filePath.split('/').pop() ?? filePath}`;
}

/**
 * Re-encodes a decoded raster image so uploaded bytes cannot be served as
 * active content under the API origin. Output is always a bounded WebP file.
 */
export async function saveDoctorImage(
  file: Express.Multer.File,
): Promise<string> {
  try {
    const image = sharp(file.buffer, { limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'gif', 'webp'].includes(metadata.format ?? '')) {
      throw new BadRequestException(
        'Only JPEG, PNG, GIF, and WebP images are allowed',
      );
    }

    const filename = `${randomUUID()}.webp`;
    await mkdir(UPLOADS_DIR, { recursive: true });
    await image
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(join(UPLOADS_DIR, filename));
    return filePathToUrl(filename);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Upload must contain a valid image');
  }
}
