import { put } from '@vercel/blob';
export function decodeImage(input) {
  const fail = (status, message) => {
    throw Object.assign(new Error(message), { status });
  };
  if (
    typeof input.data !== 'string' ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)
  )
    fail(400, 'Choose a PNG, JPEG, or WebP image.');
  const bytes = Buffer.from(input.data, 'base64');
  if (!bytes.length || bytes.length > 2 * 1024 * 1024)
    fail(400, 'Image must be at most 2 MB.');
  let type;
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    type = ['image/png', 'png'];
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    type = ['image/jpeg', 'jpg'];
  else if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    type = ['image/webp', 'webp'];
  if (!type || input.contentType !== type[0])
    fail(400, 'File content must match PNG, JPEG, or WebP format.');
  return { bytes, contentType: type[0], extension: type[1] };
}
export async function uploadImage(input) {
  const { bytes, contentType, extension } = decodeImage(input);
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    throw Object.assign(
      new Error(
        'Image uploads require a connected public Vercel Blob store. You can still enter an HTTPS image URL.',
      ),
      { status: 503 },
    );
  const blob = await put(`movies/image.${extension}`, bytes, {
    access: 'public',
    contentType,
    addRandomSuffix: true,
  });
  return { url: blob.url };
}
