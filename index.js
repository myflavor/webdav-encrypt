import http from 'http'
import {Transform} from 'stream'
import {createCipheriv, createDecipheriv, createHash} from 'crypto'

const config = {
    hostname: '172.17.0.1',
    port: 5445,
    password: 'myflavor'
}

config.hostname = process.env.DAV_HOST || config.hostname
config.port = process.env.DAV_PORT || config.port
config.password = process.env.DAV_PASSWORD || config.password

const algorithm = 'aes-256-ctr'
const ivLength = 16
const hash = str => createHash('sha256').update(str).digest()
const key = hash(config.password)
const iv = hash('iv' + config.password).subarray(0, ivLength)


class AesEncryptStream extends Transform {
    constructor() {
        super()
        this.cipher = createCipheriv(algorithm, key, iv)
    }

    _transform(chunk, encoding, callback) {
        try {
            const encryptedChunk = this.cipher.update(chunk)
            this.push(encryptedChunk)
            callback()
        } catch (err) {
            console.log('加密失败', err)
            callback()
        }
    }

    _flush(callback) {
        try {
            const finalChunk = this.cipher.final()
            this.push(finalChunk)
            callback()
        } catch (err) {
            console.log('加密失败', err)
            callback()
        }
    }
}

const incrementIV = blocks => {
    const currentIV = Buffer.from(iv)
    for (let i = 0; i < blocks; i++) {
        for (let j = 15; j >= 0; j--) {
            if (currentIV[j] === 0xff) {
                currentIV[j] = 0x00
            } else {
                currentIV[j]++
                break
            }
        }
    }
    return currentIV
}

class AesDecryptStream extends Transform {
    constructor(start = 0) {
        super()
        const blocks = parseInt(start / ivLength)
        const offset = start % ivLength
        const currentIV = incrementIV(blocks)
        this.decipher = createDecipheriv(algorithm, key, currentIV)
        if (offset > 0) {
            const dummyBuffer = Buffer.alloc(offset)
            this.decipher.update(dummyBuffer)
        }
    }


    _transform(chunk, encoding, callback) {
        try {
            const decryptedChunk = this.decipher.update(chunk)
            this.push(decryptedChunk)
            callback()
        } catch (err) {
            console.log('解密失败', err)
            callback()
        }
    }

    _flush(callback) {
        try {
            const finalChunk = this.decipher.final()
            this.push(finalChunk)
            callback()
        } catch (err) {
            console.log('解密失败', err)
            callback()
        }
    }
}

const getRangeStart = req => {
    const range = req.headers.range
    if (range == null) {
        return 0
    }
    const match = range.match(/bytes=(\d+)-(\d*)/i)
    return match ? parseInt(match[1]) : 0
}

const server = http.createServer((req, res) => {


    const proxyOpt = {
        hostname: config.hostname, port: config.port,
        method: req.method, path: req.url,
        headers: req.headers
    }
    delete req.headers['accept-encoding']
    delete req.headers['content-encoding']

    const proxyReq = http.request(proxyOpt, proxyRes => {
        console.log(req.method, decodeURIComponent(req.url), proxyRes.statusCode)
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        if (req.method === 'GET') {
            if (proxyRes.statusCode === 206) {
                const rangeStart = getRangeStart(req)
                return proxyRes.pipe(new AesDecryptStream(rangeStart)).pipe(res)
            }
            if (proxyRes.statusCode === 200) {
                return proxyRes.pipe(new AesDecryptStream()).pipe(res)
            }
        }
        proxyRes.pipe(res)
    })

    proxyReq.on('error', err => {
        res.writeHead(500)
        res.end(err.message)
    })

    if (req.method === 'PUT') {
        return req.pipe(new AesEncryptStream()).pipe(proxyReq)
    } else {
        req.pipe(proxyReq)
    }

})


server.listen(8080)
console.log('代理服务已启动')
