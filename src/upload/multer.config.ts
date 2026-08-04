import { BadRequestException } from '@nestjs/common';
import { memoryStorage, type Options } from 'multer';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

const DOCTOR_UPLOADS_DIR = join(process.cwd(), 'uploads', 'doctors');
const LABORATORY_UPLOADS_DIR = join(process.cwd(), 'uploads', 'laboratories');
const LABORATORY_RECORD_UPLOADS_DIR = join(
  process.cwd(),
  'uploads',
  'laboratory-records',
);
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

// Laboratories use the same safe image constraints as doctor portraits.
export const laboratoryImageMulterOpts = doctorImageMulterOpts;
export const laboratoryRecordImageMulterOpts = doctorImageMulterOpts;

export function filePathToUrl(filePath: string): string {
  return `/uploads/doctors/${filePath.split('/').pop() ?? filePath}`;
}

export function laboratoryFilePathToUrl(filePath: string): string {
  return `/uploads/laboratories/${filePath.split('/').pop() ?? filePath}`;
}

export function laboratoryRecordFilePathToUrl(filePath: string): string {
  return `/uploads/laboratory-records/${filePath.split('/').pop() ?? filePath}`;
}

/**
 * Re-encodes a decoded raster image so uploaded bytes cannot be served as
 * active content under the API origin. Output is always a bounded WebP file.
 */
async function saveImage(
  file: Express.Multer.File,
  uploadsDir: string,
  toUrl: (filePath: string) => string,
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
    await mkdir(uploadsDir, { recursive: true });
    await image
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(join(uploadsDir, filename));
    return toUrl(filename);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Upload must contain a valid image');
  }
}

export function saveDoctorImage(file: Express.Multer.File): Promise<string> {
  return saveImage(file, DOCTOR_UPLOADS_DIR, filePathToUrl);
}

export function saveLaboratoryImage(
  file: Express.Multer.File,
): Promise<string> {
  return saveImage(file, LABORATORY_UPLOADS_DIR, laboratoryFilePathToUrl);
}

export function saveLaboratoryRecordImage(
  file: Express.Multer.File,
): Promise<string> {
  return saveImage(
    file,
    LABORATORY_RECORD_UPLOADS_DIR,
    laboratoryRecordFilePathToUrl,
  );
}
