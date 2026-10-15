// Keep the real browser origin usable for SSR inside the app container as well.
// Only binds container loopback; never exposes an additional host port.
import net from 'node:net'
if (process.env.BILGE_ISOLATED_TEST !== 'true') throw new Error('Test environment required')
net.createServer(client => {
  const upstream=net.connect(8080,'gateway')
  client.pipe(upstream).pipe(client)
  client.on('error',()=>upstream.destroy())
  upstream.on('error',()=>client.destroy())
  client.on('close',()=>upstream.destroy())
}).listen(3137,'127.0.0.1')
