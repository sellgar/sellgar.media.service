const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { test } = require('node:test');

const { ImagesService } = require('../src/api/images/images.service');

test('returns the ready file and its object stream', async () => {
  const file = { uuid: 'file-id', status: 'ready', storageKey: 'objects/image.jpg' };
  const stream = Readable.from(['image']);
  const service = new ImagesService(
    { findByUuid: async (uuid) => { assert.equal(uuid, file.uuid); return file; } },
    { getObject: async (key) => { assert.equal(key, file.storageKey); return stream; } },
  );

  assert.deepEqual(await service.getByFileUuid(file.uuid), { file, stream });
});

for (const status of [undefined, 'pending', 'failed']) {
  test(`does not read storage for an unavailable file (${status})`, async () => {
    const service = new ImagesService(
      { findByUuid: async () => status ? { status, storageKey: 'image' } : null },
      { getObject: async () => assert.fail('Unavailable file must not be read') },
    );

    await assert.rejects(service.getByFileUuid('file-id'), { status: 404 });
  });
}

test('returns not found when a ready file has no readable object', async () => {
  const service = new ImagesService(
    { findByUuid: async () => ({ status: 'ready', storageKey: 'missing' }) },
    { getObject: async () => { throw new Error('Missing object'); } },
  );

  await assert.rejects(service.getByFileUuid('file-id'), { status: 404 });
});

test('propagates metadata service failure rather than reporting a missing image', async () => {
  const failure = new Error('Metadata service unavailable');
  const service = new ImagesService(
    { findByUuid: async () => { throw failure; } },
    { getObject: async () => assert.fail('Metadata must be resolved first') },
  );

  await assert.rejects(service.getByFileUuid('file-id'), failure);
});
