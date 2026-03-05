#!/usr/bin/env node
/**
 * Config Coverage Report
 *
 * Scans all examples/*.json files and reports which schema fields
 * from cluster-config.schema.json are exercised by at least one example.
 *
 * Usage: node scripts/config-coverage.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'cluster-config.schema.json');
const EXAMPLES_DIR = path.join(ROOT, 'examples');

// Load schema
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// Collect all configurable field paths from the schema
function collectFields(properties, prefix) {
    const fields = [];
    for (const [key, val] of Object.entries(properties)) {
        if (val === true) continue; // schema "true" passthrough (e.g. clusterId: true)
        fields.push({ path: prefix ? `${prefix}.${key}` : key, key });
    }
    return fields;
}

const topLevelFields = collectFields(schema.properties, '').filter(f => f.key !== '$schema');
const managedFields = collectFields(schema.definitions.managedCluster.properties, 'clusters[]')
    .filter(f => !['clusterId', 'clusterType'].includes(f.key));
const serverlessFields = collectFields(schema.definitions.serverlessCluster.properties, 'clusters[]')
    .filter(f => !['clusterId', 'clusterType'].includes(f.key));

// Load all examples
const exampleFiles = fs.readdirSync(EXAMPLES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

const examples = exampleFiles.map(f => ({
    name: f,
    config: JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, f), 'utf8')),
}));

// Track which fields are covered and by which examples
function checkCoverage(fields, getKeys) {
    return fields.map(field => {
        const coveredBy = [];
        for (const ex of examples) {
            const keys = getKeys(ex.config);
            if (keys.includes(field.key)) {
                coveredBy.push(ex.name);
            }
        }
        return { ...field, coveredBy, covered: coveredBy.length > 0 };
    });
}

const topResults = checkCoverage(topLevelFields, config =>
    Object.keys(config).filter(k => k !== '$schema')
);

const managedResults = checkCoverage(managedFields, config => {
    const keys = new Set();
    for (const c of config.clusters || []) {
        if (c.clusterType === 'OPENSEARCH_MANAGED_SERVICE') {
            Object.keys(c).forEach(k => keys.add(k));
        }
    }
    return [...keys];
});

const serverlessResults = checkCoverage(serverlessFields, config => {
    const keys = new Set();
    for (const c of config.clusters || []) {
        if (c.clusterType === 'OPENSEARCH_SERVERLESS') {
            Object.keys(c).forEach(k => keys.add(k));
        }
    }
    return [...keys];
});

// Print report
function printSection(title, results) {
    const covered = results.filter(r => r.covered).length;
    const total = results.length;
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

    console.log(`\n## ${title}: ${covered}/${total} (${pct}%)\n`);
    console.log('| Field | Covered | Examples |');
    console.log('|-------|:-------:|----------|');
    for (const r of results) {
        const icon = r.covered ? '✅' : '❌';
        const exList = r.coveredBy.length > 0
            ? r.coveredBy.map(e => e.replace('.json', '')).join(', ')
            : '—';
        console.log(`| \`${r.key}\` | ${icon} | ${exList} |`);
    }
}

const allResults = [...topResults, ...managedResults, ...serverlessResults];
const totalCovered = allResults.filter(r => r.covered).length;
const totalFields = allResults.length;
const totalPct = Math.round((totalCovered / totalFields) * 100);

console.log(`# Config Coverage Report\n`);
console.log(`**Overall: ${totalCovered}/${totalFields} fields covered (${totalPct}%)**\n`);
console.log(`Examples scanned: ${exampleFiles.length} (${exampleFiles.join(', ')})`);

printSection('Top-Level Fields', topResults);
printSection('Managed Domain Fields', managedResults);
printSection('Serverless Fields', serverlessResults);

// Exit with non-zero if coverage is below threshold (optional CI gate)
const threshold = parseInt(process.env.COVERAGE_THRESHOLD || '0', 10);
if (threshold > 0 && totalPct < threshold) {
    console.log(`\n⚠️  Coverage ${totalPct}% is below threshold ${threshold}%`);
    process.exit(1);
}
