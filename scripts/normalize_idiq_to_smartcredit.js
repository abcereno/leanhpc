#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function getByPath(obj, dotted) {
  if (!dotted) return undefined;
  return dotted.split('.').reduce((acc, key) => {
    if (acc === undefined || acc === null) return undefined;
    if (/^\d+$/.test(key)) return acc[Number(key)];
    return acc[key];
  }, obj);
}

function buildDefaultWrapper(input) {
  return {
    success: true,
    report: {
      BundleComponents: {
        BundleComponent: [
          {
            Type: 'IDIQConverted',
            SourceRaw: input
          }
        ]
      }
    }
  };
}

function transform(input, map) {
  if (!map || !map.components || !Array.isArray(map.components)) {
    return buildDefaultWrapper(input);
  }

  const components = [];
  for (const comp of map.components) {
    const type = comp.type || comp.Type || 'MappedComponent';
    let data;
    if (comp.path) {
      data = getByPath(input, comp.path);
    } else if (comp.extract) {
      data = {};
      for (const f of comp.extract) {
        data[f] = getByPath(input, f);
      }
    } else {
      data = input;
    }

    components.push({ Type: type, ...((data && typeof data === 'object') ? data : { value: data }) });
  }

  return {
    success: true,
    report: {
      BundleComponents: {
        BundleComponent: components
      }
    }
  };
}

function usage() {
  console.log('Usage: node scripts/normalize_idiq_to_smartcredit.js <input.json> <output.json> [mapping.json]');
  console.log('If no mapping is provided a simple wrapper is produced.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    usage();
    process.exit(1);
  }

  const [inputFile, outputFile, mapFile] = args.map(a => path.resolve(a));
  if (!fs.existsSync(inputFile)) {
    console.error('Input file not found:', inputFile);
    process.exit(2);
  }

  const input = readJSON(inputFile);
  let map = null;
  if (mapFile && fs.existsSync(mapFile)) {
    try { map = readJSON(mapFile); } catch (e) { console.warn('Could not parse mapping file, ignoring.'); }
  }

  const out = transform(input, map);
  writeJSON(outputFile, out);
  console.log('Wrote normalized file to', outputFile);
}

if (require.main === module) main();
