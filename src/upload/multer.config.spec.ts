import { stat, unlink } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { saveDoctorImage } from './multer.config.js';

const uploadsDir = join(process.cwd(), 'uploads', 'doctors');

describe('saveDoctorImage', () => {
  it('decodes and re-encodes a valid image as WebP', async () => {
    const buffer = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();

    const url = await saveDoctorImage({ buffer } as Express.Multer.File);
    const filename = url.split('/').pop()!;
    const path = join(uploadsDir, filename);

    try {
      expect(filename).toMatch(/\.webp$/);
      expect((await stat(path)).size).toBeGreaterThan(0);
      expect((await sharp(path).metadata()).format).toBe('webp');
    } finally {
      await unlink(path);
    }
  });

  it('rejects invalid image bytes even when the request claims an image MIME type', async () => {
    await expect(
      saveDoctorImage({
        buffer: Buffer.from('<script>alert(1)</script>'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File),
    ).rejects.toThrow('Upload must contain a valid image');
  });
});
