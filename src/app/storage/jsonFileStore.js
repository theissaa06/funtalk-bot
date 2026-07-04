const fs = require('fs');
const path = require('path');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class JsonFileStore {
  constructor(filePath, createDefaultData, logger) {
    this.filePath = path.resolve(filePath);
    this.createDefaultData = createDefaultData;
    this.logger = logger;
  }

  ensureFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.write(this.createDefaultData());
    }
  }

  read() {
    this.ensureFile();
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      return this.normalize(parsed);
    } catch (error) {
      this.logger?.error(`failed to read ${this.filePath}:`, error.message);
      const fallback = this.createDefaultData();
      this.write(fallback);
      return fallback;
    }
  }

  write(data) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!data.meta) data.meta = {};
    data.meta.updatedAt = new Date().toISOString();

    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  mutate(mutator) {
    const data = this.read();
    const result = mutator(data);
    this.write(data);
    return clone(result);
  }

  normalize(data) {
    const defaults = this.createDefaultData();
    return {
      ...defaults,
      ...data,
      meta: { ...defaults.meta, ...(data.meta || {}) },
      counters: { ...defaults.counters, ...(data.counters || {}) },
    };
  }
}

module.exports = {
  JsonFileStore,
  clone,
};
