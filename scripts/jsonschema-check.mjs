#!/usr/bin/env node
/**
 * 轻量 JSON Schema Draft-07 校验器(自实现,无依赖)。
 * 用于校验 templates/config.json 是否符合 templates/config-schema.json。
 *
 * 用法:
 *   node scripts/jsonschema-check.mjs <schema.json> <data.json>
 *
 * 支持校验:type、enum、required、properties、minimum/maximum/items。
 */
import { readFileSync } from 'node:fs';

const [schemaPath, dataPath] = process.argv.slice(2);
if (!schemaPath || !dataPath) {
  console.error('用法:node scripts/jsonschema-check.mjs <schema.json> <data.json>');
  process.exit(2);
}

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

const errors = [];

function check(node, value, path = '$') {
  if (node.type === 'object' || (node.properties && typeof value === 'object')) {
    if (node.required) {
      for (const k of node.required) {
        if (!(k in (value || {}))) {
          errors.push({ path: `${path}.${k}`, message: 'missing required' });
        }
      }
    }
    if (node.properties && typeof value === 'object' && value !== null) {
      for (const [k, sub] of Object.entries(node.properties)) {
        if (k in value) check(sub, value[k], `${path}.${k}`);
      }
    }
    if (node.type === 'object' && (value === null || typeof value !== 'object')) {
      errors.push({ path, message: `expected object, got ${typeof value}` });
    }
  } else if (node.type === 'integer' || node.type === 'number') {
    if (typeof value !== 'number') {
      errors.push({ path, message: `expected ${node.type}, got ${typeof value}` });
    } else {
      if (node.minimum !== undefined && value < node.minimum) {
        errors.push({ path, message: `value ${value} < minimum ${node.minimum}` });
      }
      if (node.maximum !== undefined && value > node.maximum) {
        errors.push({ path, message: `value ${value} > maximum ${node.maximum}` });
      }
    }
  } else if (node.type === 'boolean') {
    if (typeof value !== 'boolean') {
      errors.push({ path, message: `expected boolean, got ${typeof value}` });
    }
  } else if (node.type === 'string') {
    if (typeof value !== 'string') {
      errors.push({ path, message: `expected string, got ${typeof value}` });
    } else if (node.enum && !node.enum.includes(value)) {
      errors.push({ path, message: `value "${value}" not in enum [${node.enum.join(', ')}]` });
    }
  } else if (node.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push({ path, message: `expected array, got ${typeof value}` });
    } else if (node.items) {
      value.forEach((item, i) => check(node.items, item, `${path}[${i}]`));
    }
  }
}

check(schema, data);

if (errors.length === 0) {
  console.log(`✅ ${dataPath} 符合 ${schemaPath}`);
  process.exit(0);
} else {
  console.log(`❌ ${dataPath} 不符合 ${schemaPath}:`);
  for (const e of errors) console.log(`  ${e.path}: ${e.message}`);
  process.exit(1);
}