const http = require('node:http')

if (process.argv.includes('--version')) {
  console.log('fake-dsh 0.0.0')
  process.exit(0)
}

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' })
  response.end('served')
})
server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  console.log(`dsh web: http://127.0.0.1:${address.port}`)
})
