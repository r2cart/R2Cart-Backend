import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadDeliveryProof, getDeliveryProofUrl } from '../src/services/image.service.js';

vi.mock('cloudinary', () => {
  return {
    v2: {
      config: vi.fn(),
      url: vi.fn((publicId, opts) => `https://res.cloudinary.com/test-cloud/image/upload/s--signature--/${publicId}`),
      uploader: {
        upload: vi.fn().mockResolvedValue({
          secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1234/r2cart/delivery-proofs/ORD-101/proof_1.jpg',
          public_id: 'r2cart/delivery-proofs/ORD-101/proof_1',
          format: 'jpg',
          bytes: 102400
        }),
        upload_stream: vi.fn((opts, callback) => {
          return {
            end: vi.fn((buffer) => {
              callback(null, {
                secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1234/r2cart/delivery-proofs/ORD-101/proof_1.jpg',
                public_id: 'r2cart/delivery-proofs/ORD-101/proof_1',
                format: 'jpg',
                bytes: 102400
              });
            })
          };
        }),
        destroy: vi.fn().mockResolvedValue({ result: 'ok' })
      }
    }
  };
});

describe('Cloudinary Delivery Proof System', () => {
  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
  });

  it('uploads delivery proof to the designated r2cart/delivery-proofs/{orderId}/{proofId} path', async () => {
    const fakeBuffer = Buffer.from('fake-image-binary-data');
    const result = await uploadDeliveryProof(fakeBuffer, 'ORD-101', 'proof_1');

    expect(result).toBeDefined();
    expect(result.publicId).toBe('r2cart/delivery-proofs/ORD-101/proof_1');
    expect(result.url).toContain('https://res.cloudinary.com');
  });

  it('rejects upload when no image binary or source is provided', async () => {
    await expect(uploadDeliveryProof(null, 'ORD-101', 'proof_1')).rejects.toThrow('Choose an image to upload as delivery proof');
  });

  it('generates a secure signed delivery proof URL for authorized staff', () => {
    const signedUrl = getDeliveryProofUrl('r2cart/delivery-proofs/ORD-101/proof_1', 'https://fallback.com/photo.jpg');
    expect(signedUrl).toContain('r2cart/delivery-proofs/ORD-101/proof_1');
  });
});
