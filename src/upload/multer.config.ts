import { BadRequestException } from '@nestjs/common';
import { diskStorage, type Options } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'doctors');
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const doctorImageMulterOpts: Options = {
  storage: diskStorage({
    destination: UPLOADS_DIR,
    filename(_req, file, cb) {
      const unique = randomUUID();
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${unique}${ext}`);
    },
  }),
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
