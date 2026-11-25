// SQLite stores the same typed documents the existing Mongoose schemas produce.
// Keep queries local to one collection. This backend is intended for personal desks.
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const sift = require('sift').default;
const { EJSON } = mongoose.mongo.BSON;
const { ObjectId } = mongoose.Types;
let db;
const schemas = new Map();

function open() {
  if (db) return db;
  const file = process.env.SQLITE_PATH || path.resolve('data', 'newsdesk.sqlite');
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS documents (collection TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(collection,id))');
  for (const [name, schema] of schemas) ensureIndexes(name, schema);
  return db;
}

// Index definitions come exclusively from the application's Mongoose schemas.
function ensureIndexes(name, schema) {
  for (const [fields, options] of schema.indexes()) {
    if (!options.unique) continue;
    const keys = Object.keys(fields);
    const expressions = keys.map(key => `json_extract(body, '$.${key}')`);
    let where = `collection = '${name}'`;
    for (const [field, condition] of Object.entries(options.partialFilterExpression || {})) {
      if (condition.$type !== 'date') throw new Error('Unsupported partial index on ' + field);
      where += ` AND json_extract(body, '$.${field}."$date"') IS NOT NULL`;
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "${name}_${keys.join('_')}" ON documents (${expressions.join(',')}) WHERE ${where}`);
  }
}

function transaction(fn) {
  const store = open();
  store.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    store.exec('COMMIT');
    return result;
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
}

function matcher(filter) {
  // sift names BSON dates "timestamp". Keep the stored values as real Dates.
  const convert = value => {
    if (Array.isArray(value)) return value.map(convert);
    if (!value || value.constructor !== Object) return value;
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, k === '$type' && v === 'date' ? 'timestamp' : convert(v)]));
  };
  return sift(convert(filter));
}

function project(doc, fields) {
  if (!fields || !Object.keys(fields).length) return doc;
  if (Object.values(fields).some(Boolean)) {
    return Object.fromEntries(Object.entries(doc).filter(([key]) => fields[key] || (key === '_id' && fields._id !== 0)));
  }
  return Object.fromEntries(Object.entries(doc).filter(([key]) => fields[key] !== 0));
}

function collection(name) {
  function find(filter = {}, options = {}) {
    const accept = matcher(filter);
    const rows = open().prepare('SELECT body FROM documents WHERE collection=?').iterate(name);
    let docs = [];
    for (const row of rows) {
      const doc = EJSON.parse(row.body);
      if (accept(doc)) docs.push(doc);
    }
    const order = Object.entries(options.sort || {});
    if (order.length) docs.sort((a,b) => {
      for (const [field, direction] of order) {
        if (a[field] > b[field]) return direction;
        if (a[field] < b[field]) return -direction;
      }
      return 0;
    });
    if (options.limit) docs = docs.slice(0, options.limit);
    return docs.map(d => project(d, options.projection));
  }

  function save(doc, insert) {
    doc._id ||= new ObjectId();
    // Mongoose nested documents expose plain BSON via toBSON().
    const bson = mongoose.mongo.BSON;
    const body = EJSON.stringify(bson.deserialize(bson.serialize(doc)));
    try {
      if (insert) open().prepare('INSERT INTO documents VALUES (?,?,?)').run(name, String(doc._id), body);
      else open().prepare('UPDATE documents SET body=? WHERE collection=? AND id=?').run(body, name, String(doc._id));
    } catch (err) {
      if (err.errcode === 2067 || err.errcode === 1555) err.code = 11000;
      throw err;
    }
    return doc;
  }

  function update(filter, changes, options, many = false) {
    const docs = find(filter, many ? {} : { limit: 1 });
    const before = docs[0];
    const insert = !before && options.upsert;
    if (insert) docs.push(Object.fromEntries(Object.entries(filter).filter(([k,v]) => !k.startsWith('$') && v?.constructor !== Object)));
    let after;
    for (const doc of docs) {
      after = { ...doc, ...(insert ? changes.$setOnInsert : {}), ...changes.$set };
      for (const k of Object.keys(changes.$unset || {})) delete after[k];
      for (const [k,v] of Object.entries(changes.$inc || {})) after[k] = (after[k] || 0) + v;
      for (const op of Object.keys(changes)) {
        if (!['$setOnInsert','$set','$unset','$inc'].includes(op)) throw new Error('Unsupported local update ' + op);
      }
      save(after, insert);
    }
    return { before, after, matchedCount: insert ? 0 : docs.length, modifiedCount: insert ? 0 : docs.length, upsertedCount: insert ? 1 : 0, acknowledged: true };
  }

  return {
    collectionName: name,
    find: (f,o) => ({ toArray: async () => find(f,o) }),
    findOne: async (f,o) => find(f,{ ...o, limit: 1 })[0] || null,
    distinct: async (key,f) => [...new Map(find(f).map(d => [String(d[key]),d[key]])).values()],
    insertOne: async d => transaction(() => ({ acknowledged: true, insertedId: save(d,true)._id })),
    insertMany: async (docs, options = {}) => {
      const errors = [];
      const ids = {};
      transaction(() => {
        for (const [index, doc] of docs.entries()) {
          try {
            ids[index] = save(doc, true)._id;
          } catch (err) {
            if (err.code !== 11000) throw err;
            errors.push({ index, code: err.code, errmsg: err.message });
            if (options.ordered !== false) break;
          }
        }
      });
      if (errors.length) throw Object.assign(new Error('Duplicate document'), { code: 11000, writeErrors: errors });
      return { acknowledged: true, insertedCount: docs.length, insertedIds: ids };
    },
    updateOne: async (f,u,o={}) => transaction(() => update(f,u,o)),
    updateMany: async (f,u,o={}) => transaction(() => update(f,u,o,true)),
    findOneAndUpdate: async (f,u,o={}) => transaction(() => {
      const r = update(f,u,o);
      const value = (o.returnDocument === 'after' ? r.after : r.before) || null;
      return o.includeResultMetadata ? { value, lastErrorObject: { updatedExisting: !!r.before } } : value;
    }),
    bulkWrite: async ops => transaction(() => {
      let modifiedCount = 0, upsertedCount = 0;
      for (const { updateOne } of ops) {
        const r = update(updateOne.filter, updateOne.update, updateOne);
        modifiedCount += r.modifiedCount;
        upsertedCount += r.upsertedCount;
      }
      return { modifiedCount, upsertedCount };
    }),
    deleteMany: async f => transaction(() => {
      const docs = find(f);
      const del = open().prepare('DELETE FROM documents WHERE collection=? AND id=?');
      for (const d of docs) del.run(name,String(d._id));
      return { acknowledged: true, deletedCount: docs.length };
    }),
  };
}

const connection = mongoose.createConnection();
connection.db = { collection };
connection.readyState = 1;
function model(name, schema) {
  schema.set('autoCreate', false);
  schema.set('autoIndex', false);
  const compiled = connection.model(name, schema);
  schemas.set(compiled.collection.name, schema);
  if (db) ensureIndexes(compiled.collection.name, schema);
  return compiled;
}
module.exports = { model, open, isOpen: () => Boolean(db), close() { db?.close(); db = undefined; } };
