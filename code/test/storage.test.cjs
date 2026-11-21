const assert = require('node:assert/strict');
const { test } = require('node:test');

const { of } = require('rxjs');

const { MinioStorageRepository } = require('../dist/storage/minio-storage.repository');

const configuration = {
  MINIO_BUCKET: 'media',
  AMQP_MEDIA_OBJECT_WRITE: 'object.written',
  AMQP_MEDIA_OBJECT_DELETE: 'object.deleted',
};

for (const operation of ['putObject', 'removeObject']) {
  test(`${operation} emits an event only after storage succeeds`, async () => {
    const calls = [];
    const repository = new MinioStorageRepository(
      { get: (key) => configuration[key] },
      { client: { [operation]: async (...args) => { calls.push(args); return 'stored'; } } },
      { emit: (topic, event) => { calls.push([topic, event]); return of(undefined); } },
    );
    const content = Buffer.from('image');

    if (operation === 'putObject') {
      assert.equal(await repository.putObject('image.jpg', content), 'stored');
      assert.deepEqual(calls[0], ['media', 'image.jpg', content, undefined]);
    } else {
      await repository.removeObject('image.jpg');
      assert.deepEqual(calls[0], ['media', 'image.jpg']);
    }
    assert.deepEqual(calls[1], [
      operation === 'putObject' ? 'object.written' : 'object.deleted',
      { storageKey: 'image.jpg' },
    ]);
  });

  test(`${operation} does not publish a successful operation when storage fails`, async () => {
    const failure = new Error('Storage unavailable');
    const repository = new MinioStorageRepository(
      { get: (key) => configuration[key] },
      { client: { [operation]: async () => { throw failure; } } },
      { emit: () => assert.fail('Failed writes must not publish success') },
    );

    await assert.rejects(repository[operation]('image.jpg', Buffer.from('image')), failure);
  });
}
