// Local, read-only preview. Mirrors the HA asset route without changing the bundle.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mime = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.png':'image/png', '.css':'text/css'};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let pathname = url.pathname === '/' ? '/preview/index.html' : url.pathname;
    if (pathname.startsWith('/water_treatment_panel/')) pathname = '/custom_components/water_treatment/frontend/' + pathname.slice('/water_treatment_panel/'.length);
    const file = resolve(root, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(root + sep) || file.slice(root.length + 1).split(sep).some(part => part.startsWith('.'))) {
      response.writeHead(403); response.end(); return;
    }
    response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch {response.writeHead(404); response.end();}
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => {
  console.log(`Тестовый предпросмотр: http://127.0.0.1:${server.address().port}/`);
  console.log('Сценарии: ?state=due или ?state=unknown; тема: &theme=light. Запись в HA отключена.');
});
