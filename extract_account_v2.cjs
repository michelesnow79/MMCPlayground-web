
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('figma_file_info.json', 'utf8'));

function findNode(id, node) {
    if (node.id === id) return node;
    if (node.children) {
        for (let c of node.children) {
            let r = findNode(id, c);
            if (r) return r;
        }
    }
    return null;
}

const accountFrame = findNode('15802:5614', data.document);

function extractStyles(node, context = '') {
    const results = [];
    if (node.fills && node.fills.length > 0 && node.fills[0].type === 'SOLID') {
        const c = node.fills[0].color;
        const hex = `#${Math.round(c.r * 255).toString(16).padStart(2, '0')}${Math.round(c.g * 255).toString(16).padStart(2, '0')}${Math.round(c.b * 255).toString(16).padStart(2, '0')}`;
        results.push({ name: node.name, type: 'fill', value: hex, path: context });
    }
    if (node.type === 'TEXT') {
        results.push({ name: node.name, type: 'text', content: node.characters, style: node.style, path: context });
    }
    if (node.children) {
        node.children.forEach(c => results.push(...extractStyles(c, `${context} > ${node.name}`)));
    }
    return results;
}

if (accountFrame) {
    const accountSpecs = extractStyles(accountFrame, 'Account');
    fs.writeFileSync('account_specs_v2.json', JSON.stringify(accountSpecs, null, 2));
    console.log('Saved account specs');
}
