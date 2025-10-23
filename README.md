
docker部署Webdav加密


docker-compose.yml如下

    services:
      server:
        image: myflavor/webdav-encrypt
        environment:
          - DAV_HOST=172.17.0.1
          - DAV_PORT=5244
          - DAV_PASSWORD=647Sb1XsaQl2dl8q
        ports:
          - 7080:8080
        restart: unless-stopped

DAV_HOST是Webdav地址

DAV_PORT是Webdav端口

DAV_PASSWORD是文件密码
