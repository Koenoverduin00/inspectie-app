// Zet de web-app klaar in www/ voor de mobiele apps (Capacitor). Dezelfde bestanden als op GitHub Pages.
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const DOEL = 'www';
const BESTANDEN = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'vendor'];

rmSync(DOEL, { recursive: true, force: true });
mkdirSync(DOEL);
for (const b of BESTANDEN) cpSync(b, `${DOEL}/${b}`, { recursive: true });
console.log(`Web-app klaargezet in ${DOEL}/ (${BESTANDEN.join(', ')})`);
