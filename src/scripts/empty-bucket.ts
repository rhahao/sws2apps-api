import Storage from '../storages/index.js';

await Storage.initialize()
await Storage.clearBucket();
