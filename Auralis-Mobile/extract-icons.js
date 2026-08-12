const fs = require('fs');
const path = require('path');
const dir = 'd:\\\\CodeBase\\\\Active\\\\Auralis\\\\Auralis-PC\\\\node_modules\\\\lucide-vue-next\\\\dist\\\\cjs\\\\icons';
const icons = ['book-open-text', 'book-marked', 'archive', 'terminal', 'cpu', 'activity', 'infinity', 'scroll', 'feather', 'pen-tool', 'orbit', 'blocks', 'hourglass', 'award', 'telescope', 'rocket'];
const out = {};
for (const icon of icons) {
  try {
    const code = fs.readFileSync(path.join(dir, icon + '.js'), 'utf8');
    const match = code.match(/const \w+ = [^\(]+\(\"[^\"]+\", (\[.*?\])\);/s);
    if(match) {
      const children = eval(match[1]);
      let inner = '';
      for(const child of children) {
         let tag = child[0];
         let attrs = Object.entries(child[1]).map(e => e[0] + '="' + e[1] + '"').join(' ');
         inner += '<' + tag + ' ' + attrs + '/>';
      }
      out[icon] = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
    }
  } catch(e) { console.error(icon, e.message) }
}
console.log(JSON.stringify(out, null, 2));
